import { localToday, newId } from './defaults'
import type { InvoiceStore, IssuedInvoice } from './types'

/**
 * Where an issued invoice stands. Issued is what the app did; sent and paid
 * are marks the person sets (or PureMail sets on send); overdue is computed
 * from the due date and nothing else. No ledger, no inference.
 */
export type InvoiceMark = 'issued' | 'sent' | 'overdue' | 'paid'

export interface InvoiceStanding {
  mark: InvoiceMark
  dueDate: string | null
  /** Days past due, 0 when not overdue. */
  daysOverdue: number
  /** Days until due, negative when past. Null without a due date. */
  daysUntilDue: number | null
}

export const TERMS_PRESETS: ReadonlyArray<{ days: number; label: string }> = [
  { days: 0, label: 'Due on receipt' },
  { days: 7, label: 'Net 7' },
  { days: 14, label: 'Net 14' },
  { days: 15, label: 'Net 15' },
  { days: 30, label: 'Net 30' },
  { days: 45, label: 'Net 45' },
  { days: 60, label: 'Net 60' },
]

export function termsLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'Custom date'
  return TERMS_PRESETS.find(preset => preset.days === days)?.label ?? `Net ${days}`
}

/** The due date the terms imply, as an ISO day, or null without a date or terms. */
export function termsDueDate(invoiceDate: string | null, termsDays: number | null | undefined): string | null {
  if (!invoiceDate || termsDays === null || termsDays === undefined || !Number.isInteger(termsDays) || termsDays < 0) return null
  const [year, month, day] = invoiceDate.split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day + termsDays)
  return localToday(date)
}

function daysBetween(from: string, to: string): number {
  const parse = (value: string) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d).getTime() }
  return Math.round((parse(to) - parse(from)) / 86_400_000)
}

export function invoiceStanding(invoice: IssuedInvoice, today: string = localToday()): InvoiceStanding {
  const version = invoice.versions.find(candidate => candidate.id === invoice.currentVersionId) ?? invoice.versions[invoice.versions.length - 1]
  const dueDate = version?.content.dueDate ?? null
  if (invoice.marks?.paidAt) return { mark: 'paid', dueDate, daysOverdue: 0, daysUntilDue: dueDate ? daysBetween(today, dueDate) : null }
  const daysUntilDue = dueDate ? daysBetween(today, dueDate) : null
  if (daysUntilDue !== null && daysUntilDue < 0) return { mark: 'overdue', dueDate, daysOverdue: -daysUntilDue, daysUntilDue }
  return { mark: invoice.marks?.sentAt ? 'sent' : 'issued', dueDate, daysOverdue: 0, daysUntilDue }
}

export const MARK_LABEL: Record<InvoiceMark, string> = { issued: 'Issued', sent: 'Sent', overdue: 'Overdue', paid: 'Paid' }

export type MarkRequest =
  | { kind: 'sent'; at?: string; to?: string }
  | { kind: 'paid'; at?: string; reference?: string; note?: string }
  | { kind: 'clear'; which: 'sent' | 'paid' }

const isoDay = (value: string | undefined, fallback: string): string => {
  if (!value) return fallback
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new Error('Use an ISO date such as 2026-09-19.')
  return value
}

/** Set or clear a mark on an issued invoice. History gets one entry; nothing issued changes. */
export function applyMark(store: InvoiceStore, invoiceId: string, request: MarkRequest, now: string = new Date().toISOString()): InvoiceStore {
  const invoice = Object.hasOwn(store.invoices, invoiceId) ? store.invoices[invoiceId] : undefined
  if (!invoice) throw new Error('Issued invoice not found. Marks apply to issued invoices only.')
  const today = now.slice(0, 10)
  const marks = { ...invoice.marks }
  let note: string
  let kind: 'sent' | 'paid' | 'unmarked'
  if (request.kind === 'sent') {
    marks.sentAt = isoDay(request.at, today)
    if (request.to !== undefined) marks.sentTo = request.to.trim() || undefined
    kind = 'sent'; note = `Marked sent${marks.sentTo ? ` to ${marks.sentTo}` : ''} on ${marks.sentAt}.`
  } else if (request.kind === 'paid') {
    const before = marks.paidAt
    marks.paidAt = isoDay(request.at, today)
    if (marks.paidAt > today) throw new Error('A payment date cannot be in the future.')
    if (request.reference !== undefined) marks.paidReference = request.reference.trim() || undefined
    if (request.note !== undefined) marks.paidNote = request.note.trim() || undefined
    // Marking again edits the payment record (a date typed wrongly, a reference that arrived later).
    kind = 'paid'; note = `${before ? `Payment record updated: paid on ${marks.paidAt}${before !== marks.paidAt ? ` (was ${before})` : ''}` : `Marked paid on ${marks.paidAt}`}${marks.paidReference ? `, ref ${marks.paidReference}` : ''}.`
  } else {
    if (request.which === 'sent') { delete marks.sentAt; delete marks.sentTo } else { delete marks.paidAt; delete marks.paidReference; delete marks.paidNote }
    kind = 'unmarked'; note = `${request.which === 'sent' ? 'Sent' : 'Paid'} mark cleared.`
  }
  const cleaned = Object.fromEntries(Object.entries(marks).filter(([, value]) => value !== undefined))
  return { ...store, invoices: { ...store.invoices, [invoiceId]: { ...invoice, updatedAt: now,
    marks: Object.keys(cleaned).length ? cleaned : undefined,
    history: [...invoice.history, { id: newId(), at: now, kind, note }] } } }
}
