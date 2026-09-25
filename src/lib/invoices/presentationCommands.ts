import { exportInvoiceBytes } from '../../bridge/platformBridge'
import { importInvoiceAsset, readRetainedAsset } from './assets'
import { newId } from './defaults'
import { templatePreviewContent } from './templatePreview'
import { presentationDiagnostics } from './presentation'
import { renderInvoice, requirePrintableInvoice } from './rendering'
import type { InvoiceRepository } from './repository'
import type { Presentation } from './types'
import { getDraft, getIssued, getVersion, issuedLabel, nextAvailableNumber, provisionalLabel, saveDraftTemplate, updateDraftPresentation, updateTemplate } from './updates'
import { documentIdForVersion } from './versionDocuments'
export type PreviewTarget = { draftId: string } | { invoiceId: string; versionId?: string }
export type PresentationTarget = { kind: 'defaultTemplate' } | { kind: 'draft'; draftId: string }
export type PdfRequest = { kind: 'downloadVersion'; versionId?: string } | { kind: 'downloadHistoricalReference' } | { kind: 'reissue' }
export function createPresentationCommands(repository: InvoiceRepository) {
  return {
    async getTemplatePreview(args: { business: import('./types').Business; settings: Presentation; clientId?: string }) {
      const store = await repository.current()
      if (args.clientId && !store.clients[args.clientId]) throw new Error('No such client.')
      const content = templatePreviewContent(args.business, args.settings, args.clientId ? store.clients[args.clientId] : null)
      return renderInvoice(repository, content, nextAvailableNumber(store.sequence), false, provisionalLabel(store, content.invoiceDate))
    },
    importInvoiceAsset: (kind: 'logo' | 'pdf') => importInvoiceAsset(repository, kind),
    async updatePresentation(args: { target: PresentationTarget; settings: Partial<Presentation> }) {
      if (args.settings.logoAssetId) await readRetainedAsset(await repository.current(), args.settings.logoAssetId, 'logo')
      const target = args.target
      const store = await repository.transact(s => target.kind === 'draft' ? updateDraftPresentation(s, target.draftId, args.settings) : updateTemplate(s, args.settings))
      const settings = target.kind === 'draft' ? getDraft(store, target.draftId).content.presentation : store.template
      return { target, settings, diagnostics: presentationDiagnostics(settings), saveStatus: 'saved' }
    },
    async saveDraftPresentationAsDefault(args: { draftId: string }) {
      const template = getDraft(await repository.current(), args.draftId).content.presentation
      if (template.logoAssetId) await readRetainedAsset(await repository.current(), template.logoAssetId, 'logo')
      const store = await repository.transact(s => {
        if (JSON.stringify(getDraft(s, args.draftId).content.presentation) !== JSON.stringify(template)) throw new Error('Presentation changed; review it again.')
        return saveDraftTemplate(s, args.draftId)
      })
      return { defaultTemplate: store.template, diagnostics: presentationDiagnostics(store.template), saveStatus: 'saved' }
    },
    async getInvoicePreview(args: { target: PreviewTarget; pageNumbers?: number[] }) {
      const store = await repository.current(), target = args.target
      const draft = 'draftId' in target ? getDraft(store, target.draftId) : undefined
      const content = draft ? draft.content : getVersion(store, (target as { invoiceId: string }).invoiceId, (target as { versionId?: string }).versionId).content
      const issued = draft ? draft.correctionOf ? getIssued(store, draft.correctionOf) : undefined : getIssued(store, (target as { invoiceId: string }).invoiceId)
      const number = issued ? issued.number : nextAvailableNumber(store.sequence)
      const label = issued ? issuedLabel(store, issued) : provisionalLabel(store, content.invoiceDate)
      const result = await renderInvoice(repository, content, number, draft?.currencyReviewRequired, label)
      if (args.pageNumbers?.some(n => !Number.isInteger(n) || n < 1 || n > result.pageCount)) throw new Error('Requested page does not exist.')
      return { ...result, pages: args.pageNumbers ? result.pages.filter(p => args.pageNumbers!.includes(p.pageNumber)) : result.pages,
        number, numberText: label, numberStatus: draft && !draft.correctionOf ? 'provisional' : 'permanent', draftRevision: draft?.revision,
        allPageDiagnostics: result.pages.map(p => ({ pageNumber: p.pageNumber, diagnostics: p.diagnostics })) }
    },
    async setHistoricalPdfReference(args: { invoiceId: string; pdfAssetId: string | null }) {
      if (args.pdfAssetId) await readRetainedAsset(await repository.current(), args.pdfAssetId, 'pdf')
      const store = await repository.guardedTransact(s => {
        const invoice = getIssued(s, args.invoiceId)
        if (!invoice.historical) throw new Error('Only historical invoices have an original PDF reference.')
        const at = new Date().toISOString()
        return { ...s, invoices: { ...s.invoices, [invoice.id]: { ...invoice, updatedAt: at,
          historicalPdf: args.pdfAssetId ? { assetId: args.pdfAssetId, provenance: 'unverified-historical-original' as const } : undefined,
          history: [...invoice.history, { id: newId(), at, kind: 'referenceChanged' as const, note: args.pdfAssetId ? `Reference asset ${args.pdfAssetId}; contents are unverified.` : 'Historical reference removed.' }] } } }
      })
      return { historicalPdf: store.invoices[args.invoiceId].historicalPdf ?? null, saveStatus: 'saved' }
    },
    async getPdfAvailability(invoiceId: string, versionId?: string) {
      const store = await repository.current(), invoice = getIssued(store, invoiceId), version = getVersion(store, invoiceId, versionId)
      try {
        // Read only: availability never generates or exports a document.
        const id = await documentIdForVersion(store, version.content, invoice.number, issuedLabel(store, invoice))
        const assetId = store.documents?.[id]?.pdfAssetId ?? version.pdf?.assetId
        if (!assetId) return { available: false, invoiceId, versionId: version.id }
        await readRetainedAsset(store, assetId, 'pdf')
        return { available: true, invoiceId, versionId: version.id, assetId }
      } catch (error) {
        console.error('Invoice PDF availability check failed', error)
        return { available: false, invoiceId, versionId: version.id, error: error instanceof Error ? error.message : String(error) }
      }
    },
    async exportInvoicePdf(args: { invoiceId: string; request: PdfRequest }) {
      const store = await repository.refresh(), invoice = getIssued(store, args.invoiceId)
      const version = getVersion(store, invoice.id, args.request.kind === 'downloadVersion' ? args.request.versionId : undefined)
      const historical = args.request.kind === 'downloadHistoricalReference'
      const client = version.content.recipient.name.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 70) || 'client'
      const label = issuedLabel(store, invoice)
      const fileName = `Invoice-${label.replace(/[^a-zA-Z0-9_-]+/g, '-')}-${client}-${historical ? 'historical-original' : `v${invoice.versions.findIndex(v => v.id === version.id) + 1}`}.pdf`
      const labels = { invoiceId: invoice.id, versionId: version.id, fileName, superseded: version.id !== invoice.currentVersionId,
        provenance: historical ? 'unverified-historical-original' : 'app-produced', issued: true }
      let available = false
      let exported: { cancelled: boolean; path?: string } | undefined
      let reissueRecorded = false
      try {
        let assetId: string
        if (historical) {
          if (!invoice.historicalPdf) throw new Error('No original historical reference is attached.')
          assetId = invoice.historicalPdf.assetId
        } else {
          const id = await documentIdForVersion(store, version.content, invoice.number, label)
          const retained = store.documents?.[id]?.pdfAssetId ?? version.pdf?.assetId
          if (retained) assetId = retained
          else {
            if (args.request.kind === 'reissue') throw new Error('The unchanged current PDF is unavailable. Prepare it with downloadVersion before reissuing.')
            const preview = await requirePrintableInvoice(repository, version.content, invoice.number, false, label)
            assetId = preview.document!.pdfAssetId!
          }
        }
        let file
        try { file = await readRetainedAsset(await repository.current(), assetId, 'pdf') }
        catch (error) {
          console.error('Retained invoice PDF read failed', error)
          if (historical || args.request.kind === 'reissue') throw error
          const preview = await requirePrintableInvoice(repository, version.content, invoice.number, false, label)
          file = await readRetainedAsset(await repository.current(), preview.document!.pdfAssetId!, 'pdf')
        }
        available = true
        const result = await exportInvoiceBytes(fileName, file.base64, args.request.kind === 'reissue' ? async () => {
          await repository.guardedTransact(s => {
            if (getIssued(s, invoice.id).currentVersionId !== version.id) throw new Error('Current version changed. Review it before reissuing.')
            return s
          })
        } : undefined)
        exported = result
        if (!result.cancelled && args.request.kind === 'reissue') {
          const event = { id: newId(), at: new Date().toISOString(), kind: 'reissued' as const, versionId: version.id, note: 'PDF exported; no delivery is claimed.' }
          await repository.guardedTransact(s => {
          const current = getIssued(s, invoice.id)
          if (current.history.some(entry => entry.id === event.id)) return s
          if (current.currentVersionId !== version.id) throw new Error('The current version changed during export. The selected PDF was exported; no reissue event was recorded.')
          return { ...s, invoices: { ...s.invoices, [invoice.id]: { ...current, updatedAt: event.at, history: [...current.history, event] } } }
          })
          reissueRecorded = true
        }
        return { ...labels, available, ...result, reissueRecorded, deliveryClaimed: false }
      } catch (error) {
        console.error('Issued invoice PDF export failed', error)
        return { ...labels, available, ...exported, reissueRecorded, deliveryClaimed: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
