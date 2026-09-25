import { invoiceDocuments, openNotes } from './annotations'
import type { InvoiceNote } from './types'
import { calculateInvoice } from './calculations'
import { supportedCurrencies } from './defaults'
import { getVersion, issuedLabel, nextAvailableNumber, numberPattern, provisionalLabel } from './updates'
import { invoiceStanding } from './lifecycle'
import { numberMatches } from './numbering'
import { archiveStats } from './stats'
import { localToday } from './defaults'
import type { ArchiveQuery, ClientQuery, InvoiceStore } from './types'
function paginate<T>(items: T[], cursor?: string, limit = 25) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Page size must be between 1 and 100.')
  if (cursor !== undefined && !/^\d+$/.test(cursor)) throw new Error('Invalid pagination cursor.')
  const offset = Number(cursor ?? 0)
  if (!Number.isSafeInteger(offset)) throw new Error('Invalid pagination cursor.')
  return { items: items.slice(offset, offset + limit), total: items.length,
    nextCursor: offset + limit < items.length ? String(offset + limit) : null }
}
export function workspaceState(store: InvoiceStore) {
  const missing = ['name', 'address'].filter(key => !store.business[key as 'name' | 'address'].trim())
  return { firstUse: !Object.keys(store.invoices).length && !Object.keys(store.drafts).length,
    setup: { missingBusinessFields: missing, sequenceVerified: store.sequence.verified, readyToIssue: !missing.length && store.sequence.verified },
    business: store.business, defaultTemplate: store.template,
    sequence: { ...store.sequence, actualNextNumber: nextAvailableNumber(store.sequence), numberPattern: numberPattern(store), nextNumberText: provisionalLabel(store, localToday()) },
    stats: archiveStats(store),
    archiveCounts: { drafts: Object.values(store.drafts).filter(d => !d.correctionOf).length,
      corrections: Object.values(store.drafts).filter(d => d.correctionOf).length,
      issued: Object.keys(store.invoices).length, historical: Object.values(store.invoices).filter(i => i.historical).length },
    supportedCurrencies, presentationOptions: { pageSizes: ['A4', 'Letter'], typeStyles: ['sans', 'serif', 'mono'], alignments: ['left', 'center', 'right'] },
    assets: Object.values(store.assets) }
}
export function invoiceDetails(store: InvoiceStore, invoiceId: string, versionId?: string, includeCorrection = false) {
  const draft = Object.hasOwn(store.drafts, invoiceId) ? store.drafts[invoiceId] : undefined
  if (draft) {
    if (versionId) throw new Error('A draft has no retained issued versions.')
    return { ...draft, status: draft.correctionOf ? 'correction' : 'draft', number: draft.correctionOf ? store.invoices[draft.correctionOf].number : null,
      numberText: draft.correctionOf ? issuedLabel(store, store.invoices[draft.correctionOf]) : null,
      provisionalNumber: draft.correctionOf ? null : nextAvailableNumber(store.sequence),
      provisionalNumberText: draft.correctionOf ? null : provisionalLabel(store, draft.content.invoiceDate),
      calculation: calculateInvoice(draft.content, draft.currencyReviewRequired), pdf: { available: false } }
  }
  const invoice = Object.hasOwn(store.invoices, invoiceId) ? store.invoices[invoiceId] : undefined
  if (!invoice) throw new Error('Invoice not found.')
  const version = getVersion(store, invoiceId, versionId)
  const correction = Object.values(store.drafts).find(d => d.correctionOf === invoiceId)
  return { id: invoice.id, status: 'issued', number: invoice.number, numberText: issuedLabel(store, invoice), marks: invoice.marks ?? null, standing: invoiceStanding(invoice), historical: invoice.historical, source: invoice.source,
    selectedVersion: version, content: version.content, superseded: version.id !== invoice.currentVersionId,
    currentVersionId: invoice.currentVersionId, calculation: calculateInvoice(version.content),
    pdf: { available: false, availabilityUnchecked: true, ...version.pdf }, historicalPdf: invoice.historicalPdf ?? null,
    versions: invoice.versions.map(v => ({ id: v.id, issuedAt: v.issuedAt, changeNote: v.changeNote, superseded: v.id !== invoice.currentVersionId, pdfAvailable: false, availabilityUnchecked: true })),
    history: [...invoice.history].sort((a, b) => a.at.localeCompare(b.at)), correctionId: correction?.id ?? null,
    notes: invoice.notes ?? [], documents: invoiceDocuments(store, invoice),
    ...(includeCorrection && correction ? { correction: { ...correction, calculation: calculateInvoice(correction.content, correction.currencyReviewRequired) } } : {}) }
}
export function searchInvoices(store: InvoiceStore, query: ArchiveQuery = {}) {
  const issued = Object.values(store.invoices).map(invoice => {
    const version = getVersion(store, invoice.id)
    const standing = invoiceStanding(invoice)
    return { id: invoice.id, number: invoice.number as number | null, numberText: issuedLabel(store, invoice) as string | null, status: 'issued', mark: standing.mark as string | null, daysOverdue: standing.daysOverdue, marks: invoice.marks ?? null, historical: invoice.historical,
      notes: openNotes(invoice), documentCount: invoiceDocuments(store, invoice).length,
      content: version.content, updatedAt: invoice.updatedAt, latestVersion: version.id as string | null,
      correctionId: Object.values(store.drafts).find(d => d.correctionOf === invoice.id)?.id ?? null }
  })
  const drafts = Object.values(store.drafts).filter(d => !d.correctionOf).map(draft => ({ id: draft.id, number: null, numberText: null,
    status: 'draft', mark: null, daysOverdue: 0, marks: null, historical: false, notes: [] as InvoiceNote[], documentCount: 0, content: draft.content, updatedAt: draft.updatedAt, latestVersion: null, correctionId: null }))
  const needle = (query.query ?? '').trim().toLocaleLowerCase()
  const status = query.status ?? 'all'
  const rows = [...issued, ...drafts].filter(row =>
    (status === 'all' || (status === 'draft' || status === 'issued' ? row.status === status : status === 'open' ? row.status === 'issued' && row.mark !== 'paid' : row.mark === status)) &&
    (!query.clientId || row.content.clientId === query.clientId) && (!query.historicalOnly || row.historical) &&
    (!needle || (row.number !== null && numberMatches(row.numberText ?? String(row.number), row.number, needle)) || row.content.recipient.name.toLocaleLowerCase().includes(needle) || row.content.reference.toLocaleLowerCase().includes(needle)))
  const sortBy = query.sortBy ?? 'updatedAt', direction = query.sortDirection === 'ascending' ? 1 : -1
  rows.sort((a, b) => {
    const av = sortBy === 'client' ? a.content.recipient.name : sortBy === 'invoiceDate' ? a.content.invoiceDate ?? '' : a[sortBy] ?? -1
    const bv = sortBy === 'client' ? b.content.recipient.name : sortBy === 'invoiceDate' ? b.content.invoiceDate ?? '' : b[sortBy] ?? -1
    return direction * (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))) || a.id.localeCompare(b.id)
  })
  return paginate(rows.map(({ content, ...row }) => ({ ...row, recipient: content.recipient,
    clientId: content.clientId, invoiceDate: content.invoiceDate, dueDate: content.dueDate, currency: content.currency,
    reference: content.reference, total: calculateInvoice(content).total, provisionalNumber: row.status === 'draft' ? nextAvailableNumber(store.sequence) : null,
    provisionalNumberText: row.status === 'draft' ? provisionalLabel(store, content.invoiceDate) : null })), query.cursor, query.limit)
}
export function searchClients(store: InvoiceStore, query: ClientQuery = {}) {
  const needle = (query.query ?? '').trim().toLocaleLowerCase()
  return paginate(Object.values(store.clients).filter(client => (!query.clientId || client.id === query.clientId) &&
    (!needle || [client.name, client.billingAddress, client.contactName, client.email, client.phone, client.taxIdentifier].some(value => value?.toLocaleLowerCase().includes(needle))))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), query.cursor, query.limit)
}
