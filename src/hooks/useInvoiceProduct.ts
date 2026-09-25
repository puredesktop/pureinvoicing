import type { DocumentOwner } from '../lib/invoices/annotations'
import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../types'
import type { ArchiveQuery, ContentPatch, DefaultSource, Presentation, FinalizationAction, InvoiceContent, InvoiceStore, LinkedDocument, NavigationPreferences } from '../lib/invoices/types'
import { presentationDiagnostics } from '../lib/invoices/presentation'
import { searchInvoices } from '../lib/invoices/queries'
import type { PdfRequest } from '../lib/invoices/presentationCommands'
import { invoiceCommands, invoiceRepository } from '../lib/invoices/workspace'
import { applyContentPatch, issuedLabel, provisionalLabel } from '../lib/invoices/updates'
import { archiveStats } from '../lib/invoices/stats'
import type { MarkRequest } from '../lib/invoices/lifecycle'
import { chooseDocumentFile, chooseImportFile, openLinkedDocument, toggleAgentDrawer } from '../bridge/platformBridge'
import type { ImportPreview, ImportSource } from '../lib/invoices/importCommands'
import { useInvoiceNavigation } from './useInvoiceNavigation'
export function useInvoiceProduct(settings: AppSettings, store: InvoiceStore, ready: boolean) {
  const navigation = useInvoiceNavigation(settings, ready)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [edits, setEdits] = useState<Record<string, InvoiceContent>>({})
  const [versionId, setVersionId] = useState<string>()
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof invoiceCommands.getInvoicePreview>> | null>(null)
  const [availability, setAvailability] = useState<Awaited<ReturnType<typeof invoiceCommands.getPdfAvailability>> | null>(null)
  const [confirmation, setConfirmation] = useState<Awaited<ReturnType<typeof invoiceCommands.prepareInvoiceFinalization>> | null>(null)
  const [historicalAssets, setHistoricalAssets] = useState<Record<string, string>>({})
  const [registrationId, setRegistrationId] = useState<string | null>(null)
  const saving = useRef<Promise<void> | null>(null)
  const [previewKey, setPreviewKey] = useState('')
  const [message, setMessage] = useState('')
  const [publishingToken, setPublishingToken] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importing, setImporting] = useState(false)
  const selectedId = navigation.navigation.selectedInvoiceId
  const pendingPublication = publishingToken ? store.publications?.[publishingToken] : undefined
  const issued = store.invoices[pendingPublication?.invoiceId ?? selectedId ?? '']
  const version = issued?.versions.find(v => v.id === versionId) ?? issued?.versions.find(v => v.id === issued.currentVersionId)
  useEffect(() => {
    setPreview(null); setAvailability(null); setConfirmation(null)
    if (!issued || !version) return
    let active = true
    invoiceCommands.getPdfAvailability(issued.id, version.id).then(result => { if (active) setAvailability(result) }).catch(error => {
      console.error('Archive PDF check failed', error)
      if (active) setError(error instanceof Error ? error.message : String(error))
    })
    return () => { active = false }
  }, [selectedId, version?.id])
  const clientNames = new Map(Object.values(store.clients).map(client => [client.id, client.name]))
  for (const content of [...Object.values(store.drafts).map(draft => draft.content), ...Object.values(store.invoices).map(invoice => invoice.versions.find(v => v.id === invoice.currentVersionId)!.content)]) {
    if (content.clientId && !clientNames.has(content.clientId)) clientNames.set(content.clientId, content.recipient.name)
  }
  const archiveClients = [...clientNames].sort((a, b) => a[1].localeCompare(b[1]))
  const archiveQuery = navigation.navigation.archive
  const pageSize = archiveQuery.limit ?? 25
  const found = searchInvoices(store, archiveQuery)
  const offset = Number(archiveQuery.cursor ?? 0)
  const archive = found.items.length || !found.total ? found : searchInvoices(store, { ...archiveQuery, cursor: String(Math.floor((found.total - 1) / pageSize) * pageSize) })
  const pageOffset = found.items.length || !found.total ? offset : Math.floor((found.total - 1) / pageSize) * pageSize
  async function openInvoice(id: string | null, scrollTop?: number, retainedVersionId?: string, saveEdits = true) {
    if (saveEdits) await persistEdits()
    setVersionId(retainedVersionId); setPreview(null); setConfirmation(null); setMessage('')
    await navigation.updateNavigation({ destination: 'invoices', selectedInvoiceId: id, ...(scrollTop !== undefined ? { scrollTop } : {}) })
  }
  const selected = store.drafts[navigation.navigation.selectedInvoiceId ?? '']
  const content = selected ? edits[selected.id] ?? selected.content : null
  const currentPreviewKey = JSON.stringify([selected?.id, content, selected?.currencyReviewRequired, store.sequence, issued?.currentVersionId, version?.id])
  async function persistEdits() {
    if (saving.current) await saving.current
    if (!selected || !edits[selected.id]) return
    const snapshot = edits[selected.id]
    const { presentation, clientId: _clientId, ...changes } = snapshot
    const operation = (async () => {
      await invoiceCommands.savePreparedDraft({ draftId: selected.id, changes, presentation })
      setEdits(current => {
        if (current[selected.id] !== snapshot) return current
        const next = { ...current }; delete next[selected.id]; return next
      })
    })()
    saving.current = operation
    try { await operation } finally { if (saving.current === operation) saving.current = null }
  }
  useEffect(() => {
    if (!selected || !edits[selected.id] || busy || error) return
    const timer = window.setTimeout(() => {
      void persistEdits().catch(error => {
        console.error('Automatic draft save failed', error)
        setError(error instanceof Error ? error.message : String(error))
      })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [edits, selected?.id, busy, error])
  useEffect(() => {
    if (!selected || edits[selected.id] || busy || error) return
    let active = true
    const timer = window.setTimeout(() => {
      invoiceCommands.getInvoicePreview({ target: { draftId: selected.id } }).then(result => {
        if (active) { setPreview(result); setPreviewKey(currentPreviewKey) }
      }).catch(error => {
        console.error('Draft preview failed', error)
        if (active) setError(error instanceof Error ? error.message : String(error))
      })
    }, 1000)
    return () => { active = false; window.clearTimeout(timer) }
  }, [currentPreviewKey, !!(selected && edits[selected.id]), busy, error])
  const [clientTest, setClientTest] = useState<{ clientId: string; result: Awaited<ReturnType<typeof invoiceCommands.getTemplatePreview>> | null } | null>(null)
  async function run(action: () => Promise<unknown>) {
    setError(''); setMessage(''); setBusy(true)
    try { await action() }
    catch (error) { console.error('Invoice workspace action failed', error); setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  const stats = archiveStats(store)
  return {
    destination: navigation.navigation.destination, selected, selectedId, issued, version, archive, archiveQuery, pageOffset, archiveClients, stats,
    selectedClientId: navigation.navigation.selectedClientId ?? null,
    /** The label this draft would get if issued now, or the issued label. */
    label: issued ? issuedLabel(store, issued) : selected ? selected.correctionOf ? issuedLabel(store, store.invoices[selected.correctionOf]) : provisionalLabel(store, content?.invoiceDate) : provisionalLabel(store, null),
    labelFor: (invoiceId: string) => (store.invoices[invoiceId] ? issuedLabel(store, store.invoices[invoiceId]) : null),
    markInvoice: (request: MarkRequest, invoiceId = issued?.id) => run(async () => {
      if (!invoiceId) return
      const result = await invoiceCommands.markInvoice({ invoiceId, mark: request })
      setMessage(request.kind === 'clear' ? `${request.which === 'sent' ? 'Sent' : 'Paid'} mark cleared on ${result.numberText}.` : request.kind === 'paid' ? `${result.numberText} marked paid.` : `${result.numberText} marked sent.`)
    }),
    addNote: (invoiceId: string, text: string) => run(async () => { await invoiceCommands.addInvoiceNote({ invoiceId, text }) }),
    updateNote: (invoiceId: string, noteId: string, change: { done?: boolean; text?: string; remove?: boolean }) => run(async () => { await invoiceCommands.updateInvoiceNote({ invoiceId, noteId, ...change }) }),
    /** Pick a file and link it to a client or an issued invoice. */
    linkDocument: (owner: DocumentOwner, kind: LinkedDocument['kind']) => run(async () => {
      const path = await chooseDocumentFile()
      if (!path) return
      const result = await invoiceCommands.linkDocument({ ...owner, path, kind })
      const doc = result.documents.find(d => d.id === result.documentId)
      setMessage(`Linked ${doc?.name ?? 'the document'}.`)
    }),
    unlinkDocument: (owner: DocumentOwner, documentId: string) => run(async () => { await invoiceCommands.unlinkDocument({ ...owner, documentId }) }),
    openDocument: (path: string, name?: string) => run(() => openLinkedDocument(path, name)),
    importOpen, importPreview, importing,
    openImport: () => { setImportPreview(null); setImportOpen(true) },
    closeImport: () => { setImportOpen(false); setImportPreview(null) },
    importDocumentRow: (index: number) => importPreview?.document?.invoices[index] ?? null,
    previewImport: (source: ImportSource | null, skipConflicts = false) => run(async () => {
      if (!source) { setImportPreview(null); return }
      setImportPreview(await invoiceCommands.previewInvoiceImport({ source, skipConflicts }))
    }),
    chooseImportFile: () => run(async () => {
      const path = await chooseImportFile()
      if (!path) return
      setImportPreview(await invoiceCommands.previewInvoiceImport({ source: { path } }))
    }),
    runImport: (skipConflicts = false) => run(async () => {
      if (!importPreview) return
      setImporting(true)
      try {
        const result = await invoiceCommands.importInvoices({ source: importPreview.source, skipConflicts })
        setImportOpen(false); setImportPreview(null)
        setMessage(`Imported ${result.imported} invoice${result.imported === 1 ? '' : 's'}${result.clientsCreated.length ? `, ${result.clientsCreated.length} new client${result.clientsCreated.length === 1 ? '' : 's'}` : ''}${result.pdfsRetained ? `, ${result.pdfsRetained} PDF${result.pdfsRetained === 1 ? '' : 's'} kept` : ''}${result.pdfsSkipped.length ? `; ${result.pdfsSkipped.length} PDF${result.pdfsSkipped.length === 1 ? '' : 's'} not found` : ''}. Next counter ${result.nextCounter}.`)
        await navigation.updateNavigation({ archive: { ...archiveQuery, status: 'all', query: '', cursor: '0' } })
      } finally { setImporting(false) }
    }),
    selectClient: (clientId: string | null) => run(async () => { await persistEdits(); await navigation.updateNavigation({ destination: 'clients', selectedClientId: clientId }) }),
    selectedAgreementId: navigation.navigation.selectedAgreementId ?? null,
    selectedContractorId: navigation.navigation.selectedContractorId ?? null,
    openAgreement: (agreementId: string | null) => run(async () => { await persistEdits(); await navigation.updateNavigation({ destination: 'agreements', selectedAgreementId: agreementId }) }),
    openContractor: (contractorId: string | null) => run(async () => { await persistEdits(); await navigation.updateNavigation({ destination: 'contractors', selectedContractorId: contractorId }) }),
    /** Run an agreement or contractor action with the desk's busy state, error callout and toast. */
    act: (action: () => Promise<unknown>, done?: string | ((result: unknown) => string | undefined)) => run(async () => { const result = await action(); const text = typeof done === 'function' ? done(result) : done; if (text) setMessage(text) }),
    /** Open an invoice draft made from an agreement. */
    openDraft: (draftId: string) => openInvoice(draftId, undefined, undefined, false),
    openAssistant: () => { void toggleAgentDrawer().catch(() => undefined) },
    scrollTop: navigation.navigation.scrollTop, preview: !selected || previewKey === currentPreviewKey ? preview : null, availability, confirmation, message: pendingPublication && issued ? `Invoice #${issued.number} is retained successfully. PDF export is pending; finish or cancel the folder picker. This does not record delivery or payment.` : message,
    registering: registrationId === selectedId,
    historicalAsset: selected ? store.assets[historicalAssets[selected.id] ?? ''] : undefined,
    importHistoricalPdf: () => run(async () => {
      const invoiceId = issued?.id, draftId = selected?.id
      setConfirmation(null)
      const result = await invoiceCommands.importInvoiceAsset('pdf')
      if (result.cancelled) { setMessage('Reference import cancelled.'); return }
      if (invoiceId) await invoiceCommands.setHistoricalPdfReference({ invoiceId, pdfAssetId: result.asset.id })
      else if (draftId) setHistoricalAssets(current => ({ ...current, [draftId]: result.asset.id }))
      setMessage(`Attached ${result.asset.name} as an unverified original reference. No details were extracted.`)
    }),
    removeHistoricalPdf: () => run(async () => {
      setConfirmation(null)
      if (issued) await invoiceCommands.setHistoricalPdfReference({ invoiceId: issued.id, pdfAssetId: null })
      else if (selected) setHistoricalAssets(current => { const next = { ...current }; delete next[selected.id]; return next })
      setMessage('Historical reference removed. Entered invoice content is unchanged.')
    }),
    updateArchive: (patch: ArchiveQuery) => { void navigation.updateNavigation({ archive: { ...archiveQuery, ...patch }, scrollTop: 0 }).catch(error => { console.error('Archive preferences failed', error) }) },
    openInvoice: (id: string | null, scrollTop?: number, retainedVersionId?: string) => run(() => openInvoice(id, scrollTop, retainedVersionId)),
    selectVersion: (id: string) => { if (id === version?.id) return; setVersionId(id); setPreview(null); setAvailability(null) },
    registerExisting: () => run(async () => { await persistEdits(); const draft = await invoiceCommands.createInvoiceDraft(); setRegistrationId(draft.id); await openInvoice(draft.id, undefined, undefined, false) }),
    deleteDraft: () => run(async () => {
      if (!selected) return
      await invoiceCommands.discardInvoiceDraft({ draftId: selected.id })
      setEdits(current => { const next = { ...current }; delete next[selected.id]; return next })
      await navigation.updateNavigation({ selectedInvoiceId: selected.correctionOf ?? null })
    }),
    startCorrection: () => run(async () => { if (issued) { const draft = await invoiceCommands.startInvoiceCorrection({ invoiceId: issued.id }); await openInvoice(draft.id) } }),
    copyInvoice: () => run(async () => { if (issued && version) { const draft = await invoiceCommands.createInvoiceDraft({ sourceInvoiceId: issued.id, sourceVersionId: version.id }); await openInvoice(draft.id) } }),
    download: (request: PdfRequest) => run(async () => {
      const invoiceId = issued?.id ?? selected?.correctionOf
      if (!invoiceId) return
      const result = await invoiceCommands.exportInvoicePdf({ invoiceId, request })
      if ('error' in result && result.error) throw new Error(`Invoice remains issued. ${result.error}`)
      setMessage(result.cancelled ? 'Export cancelled. Invoice remains issued; download again for the same number and version.' : `${result.reissueRecorded ? 'Unchanged reissue recorded.' : 'PDF saved.'} ${result.fileName}${result.path ? ` · ${result.path}` : ''}. This does not record delivery or payment.`)
      if (issued) setAvailability(await invoiceCommands.getPdfAvailability(invoiceId, version?.id))
    }),
    preparePreview: () => run(async () => {
      setPreview(null)
      await persistEdits()
      setPreviewKey(currentPreviewKey)
      if (selected || issued) setPreview(await invoiceCommands.getInvoicePreview({ target: selected ? { draftId: selected.id } : { invoiceId: issued!.id, versionId: version?.id } }))
    }),
    preparePublication: (action: FinalizationAction) => run(async () => {
      if (!selected) return
      setConfirmation(null)
      await persistEdits()
      const proposal = action.kind === 'registerHistorical' ? { ...action, originalPdfAssetId: historicalAssets[selected.id] } : action
      setConfirmation(await invoiceCommands.prepareInvoiceFinalization({ draftId: selected.id, action: proposal }))
    }),
    acknowledgeCurrency: () => run(async () => { if (selected) { await persistEdits(); await invoiceCommands.acknowledgeCurrencyReview(selected.id) } }),
    cancelPublication: () => setConfirmation(null),
    finalize: () => run(async () => {
      if (!confirmation?.ready || !confirmation.confirmationToken) return
      const token = confirmation.confirmationToken
      setMessage('Confirming publication and preparing PDF export…')
      setPublishingToken(token)
      let result: Awaited<ReturnType<typeof invoiceCommands.finalizeInvoice>>
      try { result = await invoiceCommands.finalizeInvoice({ confirmationToken: token }) }
      finally { setPublishingToken(null); setConfirmation(null) }
      setConfirmation(null); setRegistrationId(null)
      await openInvoice(result.publication.invoiceId, undefined, result.publication.versionId, false)
      const pdf = result.pdf
      const pdfError = typeof pdf === 'object' && pdf !== null && 'error' in pdf && typeof pdf.error === 'string' ? pdf.error : null
      const cancelled = typeof pdf === 'object' && pdf !== null && 'cancelled' in pdf && pdf.cancelled === true
      const path = typeof pdf === 'object' && pdf !== null && 'path' in pdf && typeof pdf.path === 'string' ? pdf.path : null
      const outcome = pdfError ? `PDF export failed: ${pdfError}` : cancelled ? 'PDF export cancelled.' : path ? `PDF saved: ${path}` : 'PDF has not been exported.'
      setMessage(`Invoice #${result.publication.number} ${result.publication.action.kind === 'registerHistorical' ? 'registered' : 'issued'} successfully. ${outcome} Download this retained version to retrieve or retry its PDF without issuing again. Issued does not mean delivered or paid.`)
    }),
    content,
    presentationDiagnostics: content ? presentationDiagnostics(content.presentation) : [],
    editPresentation: (patch: Partial<Presentation>) => {
      if (!selected || !content) return
      setPreview(null); setConfirmation(null)
      setEdits(current => ({ ...current, [selected.id]: { ...(current[selected.id] ?? content), presentation: { ...(current[selected.id] ?? content).presentation, ...patch } } }))
    },
    importDraftLogo: () => run(async () => {
      if (!selected) return
      await persistEdits()
      const result = await invoiceCommands.importInvoiceAsset('logo')
      if (!result.cancelled) await invoiceCommands.setDraftPresentation(selected.id, { logoAssetId: result.asset.id })
    }),
    saveAppearanceDefault: () => run(async () => {
      if (!selected) return
      await persistEdits()
      await invoiceCommands.saveDraftPresentationAsDefault({ draftId: selected.id })
      setMessage('Appearance saved as the default for future invoices.')
    }),
    applyDefaults: (sources: DefaultSource[]) => run(async () => {
      if (!selected) return
      await persistEdits()
      await invoiceCommands.applyDefaultsToDraft({ draftId: selected.id, sources, clientId: content?.clientId })
      setConfirmation(null); setPreview(null)
    }),
    dirty: !!selected && !!edits[selected.id], busy, error: error || navigation.error?.message,
    navigate: (destination: NavigationPreferences['destination']) => run(async () => { await persistEdits(); await navigation.updateNavigation({ destination, ...(destination === 'agreements' ? { selectedAgreementId: null } : {}) }) }),
    selectDraft: (id: string) => run(() => openInvoice(id)),
    createDraft: () => run(async () => {
      await persistEdits()
      const draft = await invoiceCommands.createInvoiceDraft()
      await openInvoice(draft.id, undefined, undefined, false)
    }),
    /** A draft that already carries the client's details, terms and currency. */
    // A test invoice to a client: rendered in the current template, nothing saved, no number used.
    clientTest,
    testInvoiceForClient: (clientId: string) => run(async () => {
      const store = await invoiceRepository.current()
      setClientTest({ clientId, result: null })
      const result = await invoiceCommands.getTemplatePreview({ business: store.business, settings: store.template, clientId })
      setClientTest({ clientId, result })
    }),
    closeClientTest: () => setClientTest(null),
    createDraftForClient: (clientId: string) => run(async () => {
      await persistEdits()
      const draft = await invoiceCommands.createInvoiceDraft()
      await invoiceCommands.applyDefaultsToDraft({ draftId: draft.id, sources: ['client'], clientId })
      await openInvoice(draft.id, undefined, undefined, false)
    }),
    editDraft: (patch: ContentPatch) => {
      if (!selected) return
      setConfirmation(null); setPreview(null)
      setEdits(current => ({ ...current, [selected.id]: applyContentPatch(current[selected.id] ?? selected.content, patch) }))
    },
    saveDraft: () => run(persistEdits),
    applyClient: (clientId: string) => run(async () => {
      if (!selected) return
      // Preserve unrelated unsaved preparation before explicitly replacing the recipient snapshot.
      await persistEdits()
      await invoiceCommands.applyDefaultsToDraft({ draftId: selected.id, sources: ['client'], clientId })
    }),
  }
}
export type InvoiceProduct = ReturnType<typeof useInvoiceProduct>
