import type { InvoiceStore, LibraryDocument, LibraryKind } from './types'

/**
 * The library: documents kept for invoicing, each a retained copy with its
 * words read once. What they are for decides where they are offered: a
 * client's invoice rules beside that client's invoices, a tax note or a
 * process beside everything. The drawer reads them when it formats an
 * invoice; nothing here is printed.
 */

export const LIBRARY_KINDS: { id: LibraryKind; label: string; does: string }[] = [
  { id: 'invoice-rules', label: 'Invoice rules', does: 'What a client requires on an invoice: references, addresses, formats, where to send it.' },
  { id: 'process', label: 'Process', does: 'How invoicing is done here: when, by whom, the steps.' },
  { id: 'template', label: 'Template', does: 'An invoice or a letter to follow.' },
  { id: 'tax', label: 'Tax', does: 'Tax guidance and rates.' },
  { id: 'contract-terms', label: 'Contract terms', does: 'Payment terms and conditions agreed.' },
  { id: 'reference', label: 'Reference', does: 'Anything else worth keeping beside the invoices.' },
]
export const libraryKindLabel = (kind: LibraryKind) => LIBRARY_KINDS.find(k => k.id === kind)?.label ?? 'Document'

export interface LibraryQuery { kind?: LibraryKind | 'all'; clientId?: string; query?: string }

export function getLibraryDocument(store: InvoiceStore, id: string): LibraryDocument {
  const d = store.library && Object.hasOwn(store.library, id) ? store.library[id] : undefined
  if (!d) throw new Error('Document not found in the library.')
  return d
}

/** The documents a query finds, newest first; a client's query also finds the documents that belong to no client. */
export function libraryRows(store: InvoiceStore, query: LibraryQuery = {}): LibraryDocument[] {
  const needle = (query.query ?? '').trim().toLocaleLowerCase()
  return Object.values(store.library ?? {})
    .filter(d => (!query.kind || query.kind === 'all' || d.kind === query.kind)
      && (!query.clientId || !d.clientId || d.clientId === query.clientId)
      && (!needle || [d.title, d.fileName, d.notes ?? '', d.text].some(v => v.toLocaleLowerCase().includes(needle))))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export interface AddLibraryInput { title?: string; kind?: LibraryKind; clientId?: string; notes?: string; assetId: string; fileName: string; mimeType: string; text: string }

export function addLibraryDocument(store: InvoiceStore, input: AddLibraryInput, id: string, now: string): InvoiceStore {
  const title = (input.title ?? '').trim() || input.fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Document'
  if (input.clientId && !Object.hasOwn(store.clients, input.clientId)) throw new Error('Client not found.')
  const kind: LibraryKind = input.kind && LIBRARY_KINDS.some(k => k.id === input.kind) ? input.kind : 'reference'
  const d: LibraryDocument = { id, title, kind, ...(input.clientId ? { clientId: input.clientId } : {}), assetId: input.assetId, fileName: input.fileName, mimeType: input.mimeType, text: input.text, ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}), addedAt: now, updatedAt: now }
  return { ...store, library: { ...(store.library ?? {}), [id]: d } }
}

export interface LibraryPatch { title?: string; kind?: LibraryKind; clientId?: string | null; notes?: string | null }

export function updateLibraryDocument(store: InvoiceStore, id: string, patch: LibraryPatch, now: string): InvoiceStore {
  const d = getLibraryDocument(store, id)
  const next: LibraryDocument = { ...d, updatedAt: now }
  if (patch.title !== undefined) { const t = patch.title.trim(); if (!t) throw new Error('A document needs a title.'); next.title = t }
  if (patch.kind !== undefined) { if (!LIBRARY_KINDS.some(k => k.id === patch.kind)) throw new Error(`Unknown kind. One of ${LIBRARY_KINDS.map(k => k.id).join(', ')}.`); next.kind = patch.kind }
  if (patch.clientId !== undefined) {
    if (patch.clientId && !Object.hasOwn(store.clients, patch.clientId)) throw new Error('Client not found.')
    if (patch.clientId) next.clientId = patch.clientId; else delete next.clientId
  }
  if (patch.notes !== undefined) { if (patch.notes?.trim()) next.notes = patch.notes.trim(); else delete next.notes }
  return { ...store, library: { ...(store.library ?? {}), [id]: next } }
}

/** Takes a document out of the library. Its retained copy stays (assets are never removed), unreferenced. */
export function removeLibraryDocument(store: InvoiceStore, id: string): InvoiceStore {
  getLibraryDocument(store, id)
  const library = { ...(store.library ?? {}) }
  delete library[id]
  return { ...store, library }
}

/** The text the drawer reads: the document's words, clipped to a length a prompt can carry, with where it was cut. */
export function libraryExcerpt(d: LibraryDocument, limit = 12_000): { text: string; clipped: boolean } {
  const text = d.text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return text.length > limit ? { text: `${text.slice(0, limit)}…`, clipped: true } : { text, clipped: false }
}
