import { readRetainedAsset } from './assets'
import { calculateInvoice } from './calculations'
import { newId } from './defaults'
import { renderInvoice } from './rendering'
import type { InvoiceRepository } from './repository'
import type { FinalizationAction, InvoiceStore, PublicationReceipt } from './types'
import { getDraft, getIssued, getVersion, issuedLabel, nextAvailableNumber, numberPattern, reserveNumber } from './updates'
import { formatInvoiceNumber } from './numbering'

function proposal(store: InvoiceStore, draftId: string, action: FinalizationAction) {
  const draft = getDraft(store, draftId)
  if (!store.sequence.verified) throw new Error('Verify sequence setup before finalization.')
  if ((action.kind === 'publishCorrection') !== !!draft.correctionOf) throw new Error('Use correction publication only for a correction draft.')
  if (action.kind === 'publishCorrection' && !action.changeNote.trim()) throw new Error('A correction requires a change note.')
  const previous = draft.correctionOf ? getVersion(store, draft.correctionOf) : undefined
  if (previous && previous.id !== draft.source?.versionId) throw new Error('The current issued version changed. Start a fresh correction.')
  const number = draft.correctionOf ? getIssued(store, draft.correctionOf).number
    : action.kind === 'registerHistorical' ? action.originalNumber : nextAvailableNumber(store.sequence)
  if (!draft.correctionOf) reserveNumber(store, number, action.kind === 'registerHistorical')
  // A correction keeps the label the client already saw; a new invoice is written through today's pattern.
  const label = draft.correctionOf ? issuedLabel(store, getIssued(store, draft.correctionOf)) : formatInvoiceNumber(number, numberPattern(store), draft.content.invoiceDate)
  const calculation = calculateInvoice(draft.content, draft.currencyReviewRequired)
  const binding = JSON.stringify({ draft, action, number, label, calculation, business: store.business, template: store.template,
    sequence: store.sequence, previous, historicalAsset: action.kind === 'registerHistorical' && action.originalPdfAssetId
      ? store.assets[action.originalPdfAssetId] : null })
  return { draft, number, label, calculation, binding, previous }
}
interface Confirmation {
  draftId: string; action: FinalizationAction; binding: string; expiresAt: number
  invoiceId: string; versionId: string; documentId: string; pdfAssetId: string
}
export function createFinalizationCommands(repository: InvoiceRepository, exportPdf: (args: {
  invoiceId: string; request: { kind: 'downloadVersion'; versionId: string }
}) => Promise<unknown>, dependencies = { renderInvoice, readRetainedAsset, now: () => Date.now() }) {
  // Uncommitted proposals are session-local and expire. Successful identities are
  // durable, in the same storage write as the sequence and immutable version.
  const confirmations = new Map<string, Confirmation>()
  return {
    async prepareInvoiceFinalization(args: { draftId: string; action: FinalizationAction }) {
      const store = await repository.refresh()
      const action = structuredClone(args.action)
      const approved = proposal(store, args.draftId, action)
      if (action.kind === 'registerHistorical' && action.originalPdfAssetId) {
        await dependencies.readRetainedAsset(store, action.originalPdfAssetId, 'pdf')
      }
      const preview = await dependencies.renderInvoice(repository, approved.draft.content, approved.number, approved.draft.currencyReviewRequired, approved.label)
      if (!preview.canFinalize || !preview.document?.pdfAssetId) return { ready: false as const, diagnostics: preview.diagnostics, preview }
      const latest = await repository.refresh()
      if (proposal(latest, args.draftId, action).binding !== approved.binding) throw new Error('Saved work or settings changed during preparation. Prepare again.')
      const confirmationToken = newId(), expiresAt = dependencies.now() + 10 * 60 * 1000
      for (const [token, confirmation] of confirmations) if (confirmation.expiresAt <= dependencies.now()) confirmations.delete(token)
      confirmations.set(confirmationToken, { draftId: args.draftId, action, binding: approved.binding, expiresAt,
        invoiceId: approved.draft.correctionOf ?? approved.draft.id, versionId: newId(),
        documentId: preview.document.id, pdfAssetId: preview.document.pdfAssetId })
      const summary = (content: typeof approved.draft.content) => ({ recipient: content.recipient, invoiceDate: content.invoiceDate,
        dueDate: content.dueDate, currency: content.currency, total: calculateInvoice(content).total })
      return { ready: true as const, confirmationToken, expiresAt: new Date(expiresAt).toISOString(), action, number: approved.number, numberText: approved.label,
        draftRevision: approved.draft.revision, ...summary(approved.draft.content), calculation: approved.calculation, preview,
        correctionDifferences: approved.previous ? { before: summary(approved.previous.content), after: summary(approved.draft.content),
          warning: 'Previously shared copies are not automatically replaced.' } : null,
        historical: action.kind === 'registerHistorical', historicalReferenceProvenance: action.kind === 'registerHistorical' && action.originalPdfAssetId ? 'unverified-historical-original' : null,
        sequenceImpact: { before: nextAvailableNumber(latest.sequence), after: approved.draft.correctionOf ? nextAvailableNumber(latest.sequence) : Math.max(nextAvailableNumber(latest.sequence), approved.number + 1) } }
    },
    async finalizeInvoice(args: { confirmationToken: string }) {
      const token = args.confirmationToken
      let repeated = false
      const store = await repository.guardedTransact(current => {
        if (Object.hasOwn(current.publications ?? {}, token)) { repeated = true; return current }
        const confirmation = confirmations.get(token)
        if (!confirmation || confirmation.expiresAt <= dependencies.now()) throw new Error('Confirmation expired or is unknown. Prepare again and obtain fresh approval.')
        const approved = proposal(current, confirmation.draftId, confirmation.action)
        if (approved.binding !== confirmation.binding) throw new Error('Confirmation is stale: saved work, settings, totals, or number changed. Prepare again and obtain fresh approval.')
        if (!approved.calculation.complete || approved.calculation.warnings.length) throw new Error('Invoice validation failed. Prepare again.')
        const document = current.documents?.[confirmation.documentId]
        if (!document?.pageCount || document.pdfAssetId !== confirmation.pdfAssetId) throw new Error('Validated document changed. Prepare again.')
        const at = new Date(dependencies.now()).toISOString(), action = confirmation.action
        const receipt: PublicationReceipt = { confirmationToken: token, invoiceId: confirmation.invoiceId, versionId: confirmation.versionId,
          number: approved.number, numberText: approved.label, issuedAt: at, action, total: approved.calculation.total, currency: approved.draft.content.currency! }
        const version = { id: receipt.versionId, issuedAt: at, content: structuredClone(approved.draft.content),
          ...(action.kind === 'publishCorrection' ? { changeNote: action.changeNote } : {}),
          pdf: { assetId: confirmation.pdfAssetId, fileName: `Invoice-${approved.label}.pdf`, provenance: 'app-produced' as const } }
        const prior = approved.draft.correctionOf ? getIssued(current, approved.draft.correctionOf) : undefined
        const next = prior ? current : reserveNumber(current, approved.number, action.kind === 'registerHistorical', at)
        const invoice = { id: receipt.invoiceId, number: receipt.number, numberText: prior?.numberText ?? approved.label, historical: action.kind === 'registerHistorical', createdAt: at,
          source: approved.draft.source, ...prior, updatedAt: at, currentVersionId: version.id, versions: [...(prior?.versions ?? []), version],
          history: [...(prior?.history ?? []), { id: newId(), at, versionId: version.id,
            kind: prior ? 'corrected' as const : action.kind === 'registerHistorical' ? 'historical' as const : 'issued' as const,
            ...(action.kind === 'publishCorrection' ? { note: action.changeNote } : {}) }],
          ...(action.kind === 'registerHistorical' && action.originalPdfAssetId ? {
            historicalPdf: { assetId: action.originalPdfAssetId, provenance: 'unverified-historical-original' as const } } : {}) }
        const drafts = { ...next.drafts }; delete drafts[approved.draft.id]
        return { ...next, drafts, invoices: { ...next.invoices, [invoice.id]: invoice }, publications: { ...next.publications, [token]: receipt } }
      })
      const publication = store.publications![token]
      // Publication has already succeeded. PDF/export failure must never escape
      // as an issuance failure, nor can a token replay open another save dialog.
      let pdf: unknown = { status: 'notRequested', retry: { invoiceId: publication.invoiceId, versionId: publication.versionId } }
      if (!repeated && publication.action.kind !== 'registerHistorical') {
        try { pdf = await exportPdf({ invoiceId: publication.invoiceId, request: { kind: 'downloadVersion', versionId: publication.versionId } }) }
        catch (error) {
          console.error('Publication succeeded but PDF export failed', error)
          pdf = { status: 'failed', error: error instanceof Error ? error.message : String(error), invoiceId: publication.invoiceId, versionId: publication.versionId }
        }
      }
      return { issued: true, saveStatus: 'saved', publication, repeated, pdf, deliveryClaimed: false }
    },
  }
}
