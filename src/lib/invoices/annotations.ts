import { newId } from './defaults'
import type { Agreement, InvoiceNote, InvoiceStore, IssuedInvoice, LinkedDocument } from './types'

/**
 * Working notes on issued invoices, and the agreements (contracts, SOWs,
 * purchase orders) that clients and invoices rest on. Neither is printed and
 * neither touches issued content, so both stay editable after issue.
 */

export const DOCUMENT_KINDS: { id: LinkedDocument['kind']; label: string }[] = [
  { id: 'contract', label: 'Contract' }, { id: 'sow', label: 'Statement of work' },
  { id: 'purchase-order', label: 'Purchase order' }, { id: 'other', label: 'Document' },
]
export const documentKindLabel = (kind: LinkedDocument['kind']) => DOCUMENT_KINDS.find(k => k.id === kind)?.label ?? 'Document'

function issued(store: InvoiceStore, invoiceId: string): IssuedInvoice {
  const invoice = Object.hasOwn(store.invoices, invoiceId) ? store.invoices[invoiceId] : undefined
  if (!invoice) throw new Error('Issued invoice not found. Notes and documents attach to issued invoices; a draft uses its client’s documents.')
  return invoice
}
const withInvoice = (store: InvoiceStore, invoice: IssuedInvoice): InvoiceStore => ({ ...store, invoices: { ...store.invoices, [invoice.id]: invoice } })

export type NoteOwner = { invoiceId: string } | { agreementId: string }
function agreementOf(store: InvoiceStore, id: string): Agreement {
  const a = store.agreements && Object.hasOwn(store.agreements, id) ? store.agreements[id] : undefined
  if (!a) throw new Error('Agreement not found.')
  return a
}
const notesOf = (store: InvoiceStore, owner: NoteOwner) => ('invoiceId' in owner ? issued(store, owner.invoiceId).notes : agreementOf(store, owner.agreementId).notes) ?? []
function withNotes(store: InvoiceStore, owner: NoteOwner, notes: InvoiceNote[], now: string): InvoiceStore {
  const list = notes.length ? notes : undefined
  if ('invoiceId' in owner) return withInvoice(store, { ...store.invoices[owner.invoiceId], updatedAt: now, notes: list })
  return { ...store, agreements: { ...store.agreements, [owner.agreementId]: { ...agreementOf(store, owner.agreementId), updatedAt: now, notes: list } } }
}
export function addNote(store: InvoiceStore, owner: NoteOwner, text: string, now = new Date().toISOString()): { store: InvoiceStore; noteId: string } {
  const notes = notesOf(store, owner), body = text.trim()
  if (!body) throw new Error('Write the note first.')
  const noteId = newId()
  return { noteId, store: withNotes(store, owner, [...notes, { id: noteId, text: body, at: now }], now) }
}
export function updateNote(store: InvoiceStore, owner: NoteOwner, noteId: string, change: { done?: boolean; text?: string; remove?: boolean }, now = new Date().toISOString()): InvoiceStore {
  const current = notesOf(store, owner)
  const note = current.find(n => n.id === noteId)
  if (!note) throw new Error('Note not found here.')
  if (change.text !== undefined && !change.text.trim()) throw new Error('A note needs text; remove it instead.')
  const notes = change.remove ? current.filter(n => n.id !== noteId) : current.map(n => {
    if (n.id !== noteId) return n
    const next = { ...n, ...(change.text !== undefined ? { text: change.text.trim() } : {}) }
    if (change.done === true && !n.doneAt) next.doneAt = now
    if (change.done === false) delete next.doneAt
    return next
  })
  return withNotes(store, owner, notes, now)
}
export function addInvoiceNote(store: InvoiceStore, invoiceId: string, text: string, now = new Date().toISOString()): { store: InvoiceStore; noteId: string } {
  return addNote(store, { invoiceId }, text, now)
}

/** Tick a note done (or not done), change its text, or remove it. */
export function updateInvoiceNote(store: InvoiceStore, invoiceId: string, noteId: string, change: { done?: boolean; text?: string; remove?: boolean }, now = new Date().toISOString()): InvoiceStore {
  return updateNote(store, { invoiceId }, noteId, change, now)
}

export type DocumentOwner = { clientId: string } | { invoiceId: string } | { agreementId: string } | { contractorId: string }
const fileName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

function owned(store: InvoiceStore, owner: DocumentOwner): LinkedDocument[] {
  if ('clientId' in owner) {
    const client = Object.hasOwn(store.clients, owner.clientId) ? store.clients[owner.clientId] : undefined
    if (!client) throw new Error('Client not found.')
    return client.documents ?? []
  }
  if ('agreementId' in owner) return agreementOf(store, owner.agreementId).documents ?? []
  if ('contractorId' in owner) {
    const contractor = store.contractors?.[owner.contractorId]
    if (!contractor) throw new Error('Contractor not found.')
    return contractor.documents ?? []
  }
  return issued(store, owner.invoiceId).documents ?? []
}
function withDocuments(store: InvoiceStore, owner: DocumentOwner, documents: LinkedDocument[], now: string): InvoiceStore {
  const list = documents.length ? documents : undefined
  if ('clientId' in owner) return { ...store, clients: { ...store.clients, [owner.clientId]: { ...store.clients[owner.clientId], documents: list, updatedAt: now } } }
  if ('agreementId' in owner) return { ...store, agreements: { ...store.agreements, [owner.agreementId]: { ...agreementOf(store, owner.agreementId), documents: list, updatedAt: now } } }
  if ('contractorId' in owner) return { ...store, contractors: { ...store.contractors, [owner.contractorId]: { ...store.contractors![owner.contractorId], documents: list, updatedAt: now } } }
  return withInvoice(store, { ...store.invoices[owner.invoiceId], documents: list, updatedAt: now })
}

/** Link a file by path; linking the same path again changes its kind or name instead of adding a copy. */
export function linkDocument(store: InvoiceStore, owner: DocumentOwner, file: { path: string; kind?: LinkedDocument['kind']; name?: string }, now = new Date().toISOString()): { store: InvoiceStore; documentId: string } {
  const path = file.path.trim()
  if (!path) throw new Error('Choose a file to link.')
  const kind = file.kind ?? 'other'
  if (!DOCUMENT_KINDS.some(k => k.id === kind)) throw new Error('kind must be contract, sow, purchase-order or other.')
  const documents = owned(store, owner)
  const existing = documents.find(d => d.path === path)
  if (existing) {
    const next = { ...existing, kind, name: file.name?.trim() || existing.name }
    return { documentId: existing.id, store: withDocuments(store, owner, documents.map(d => d.id === existing.id ? next : d), now) }
  }
  const doc: LinkedDocument = { id: newId(), path, name: file.name?.trim() || fileName(path), kind, addedAt: now }
  return { documentId: doc.id, store: withDocuments(store, owner, [...documents, doc], now) }
}

export function unlinkDocument(store: InvoiceStore, owner: DocumentOwner, documentId: string, now = new Date().toISOString()): InvoiceStore {
  const documents = owned(store, owner)
  if (!documents.some(d => d.id === documentId)) throw new Error('That document is not linked here.')
  return withDocuments(store, owner, documents.filter(d => d.id !== documentId), now)
}

/** What an invoice rests on: its own links, then its client's (marked as the client's). */
export function invoiceDocuments(store: InvoiceStore, invoice: IssuedInvoice): (LinkedDocument & { from: 'invoice' | 'client' })[] {
  const version = invoice.versions.find(v => v.id === invoice.currentVersionId) ?? invoice.versions[0]
  const clientId = version?.content.clientId
  const own = (invoice.documents ?? []).map(d => ({ ...d, from: 'invoice' as const }))
  const client = clientId && Object.hasOwn(store.clients, clientId) ? (store.clients[clientId].documents ?? []) : []
  return [...own, ...client.filter(d => !own.some(o => o.path === d.path)).map(d => ({ ...d, from: 'client' as const }))]
}
export const openNotes = (invoice: IssuedInvoice) => (invoice.notes ?? []).filter(n => !n.doneAt)
