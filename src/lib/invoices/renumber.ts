import { newId } from './defaults'
import type { InvoiceContent, InvoiceStore } from './types'
import { issuedLabel } from './updates'

export interface RenumberRequest {
  invoiceId: string
  /** The corrected number as the client will see it, e.g. PS-2026-003. */
  numberText: string
  /** Why: kept in the invoice history and on the new version. */
  reason: string
  /** The corrected version's content and its already-retained, checked PDF. */
  content: InvoiceContent
  pdfAssetId: string
}

/**
 * Correcting the number of a registered (historical) invoice whose original
 * number was a mistake, such as a duplicate. The original version keeps the
 * number it was sent with; a new version carries the corrected number and its
 * PDF, and the history says why. Invoices issued here are never renumbered:
 * their number was checked against the sequence when they were issued.
 */
export function renumberRegistered(store: InvoiceStore, request: RenumberRequest, now: string = new Date().toISOString()): InvoiceStore {
  const invoice = Object.hasOwn(store.invoices, request.invoiceId) ? store.invoices[request.invoiceId] : undefined
  if (!invoice) throw new Error('Invoice not found.')
  if (!invoice.historical) throw new Error('Only registered past invoices can be renumbered; an invoice issued here keeps its number.')
  const label = request.numberText.trim()
  if (!label) throw new Error('Give the corrected number.')
  if (!request.reason.trim()) throw new Error('Say why the number changes; it is kept in the history.')
  if (label === issuedLabel(store, invoice)) throw new Error(`The invoice is already numbered ${label}.`)
  const clash = Object.values(store.invoices).find(other => other.id !== invoice.id && issuedLabel(store, other) === label)
  if (clash) throw new Error(`${label} is already used by another invoice.`)
  const versionId = newId(), reason = request.reason.trim()
  return { ...store, invoices: { ...store.invoices, [invoice.id]: { ...invoice, updatedAt: now, currentVersionId: versionId,
    versions: [...invoice.versions, { id: versionId, issuedAt: now, content: structuredClone(request.content), numberText: label, changeNote: reason,
      pdf: { assetId: request.pdfAssetId, fileName: `Invoice-${label}.pdf`, provenance: 'app-produced' } }],
    history: [...invoice.history, { id: newId(), at: now, kind: 'corrected', versionId, note: `Renumbered ${issuedLabel(store, invoice)} → ${label}. ${reason}` }] } } }
}

/** Labels carried by more than one issued invoice, each with the invoices that share it. */
export function duplicateNumbers(store: InvoiceStore): { label: string; invoiceIds: string[] }[] {
  const byLabel = new Map<string, string[]>()
  for (const invoice of Object.values(store.invoices)) { const label = issuedLabel(store, invoice); byLabel.set(label, [...(byLabel.get(label) ?? []), invoice.id]) }
  return [...byLabel.entries()].filter(([, ids]) => ids.length > 1).map(([label, invoiceIds]) => ({ label, invoiceIds }))
}
