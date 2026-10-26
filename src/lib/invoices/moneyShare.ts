import { unbilledPeriods, partyName, periodLabel } from './agreements'
import { calculateInvoice } from './calculations'
import { localToday } from './defaults'
import { invoiceStanding } from './lifecycle'
import { archiveStats } from './stats'
import type { Agreement, InvoiceContent, InvoiceStore, IssuedInvoice } from './types'
import { issuedLabel } from './updates'

/**
 * The money share: a read-out of this workspace's invoicing for the
 * organisation's Executive app (its CFO). It is written only when the
 * Executive app has asked for it by leaving `.appdata/executive/money/
 * share.json`, and it is only ever a copy: nothing here reads it back or
 * changes the books. The shape is a contract with the Executive app
 * (ps-suite#1013, file formats §2b); keep field names and meanings as they are.
 */

export const MONEY_SHARE_VERSION = 1
/** Paid invoices are listed when the paid mark falls within this many days. */
export const PAID_WINDOW_DAYS = 90

export interface OwedInvoice { number: string; client: string; amount: number; currency: string; issued: string; due: string | null; daysOverdue: number }
export interface DraftInvoice { id: string; client: string; amount: number; currency: string }
export interface PaidInvoice { number: string; client: string; amount: number; currency: string; paidOn: string }
export interface NextMilestone { title: string; due: string | null; amount: number; currency: string }
export interface AgreementLine { title: string; client: string; state: Agreement['status']; nextMilestone: NextMilestone | null }
export interface InvoicingShare {
  v: 1
  at: string
  currency: string
  owedToUs: OwedInvoice[]
  drafts: DraftInvoice[]
  paid: PaidInvoice[]
  agreements: AgreementLine[]
}

const currentContent = (invoice: IssuedInvoice): InvoiceContent =>
  (invoice.versions.find(v => v.id === invoice.currentVersionId) ?? invoice.versions[invoice.versions.length - 1]).content
const currentIssuedAt = (invoice: IssuedInvoice): string =>
  (invoice.versions.find(v => v.id === invoice.currentVersionId) ?? invoice.versions[0]).issuedAt.slice(0, 10)
const amountOf = (content: InvoiceContent): number => Number(calculateInvoice(content).total)
const clientOf = (store: InvoiceStore, content: InvoiceContent): string =>
  (content.clientId ? store.clients[content.clientId]?.name : undefined) ?? content.recipient.name
function dayMinus(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return localToday(new Date(y, m - 1, d - days))
}
/** "2026-10-26T09:00:00Z": the instant without milliseconds, as the contract writes it. */
const instant = (now: Date): string => now.toISOString().replace(/\.\d{3}Z$/, 'Z')

/** The workspace's main currency: the one most issued invoices use, else the first agreement's, else USD. */
function mainCurrency(store: InvoiceStore, today: string): string {
  return archiveStats(store, today).allTime.find(row => row.currency)?.currency
    ?? Object.values(store.agreements ?? {}).find(a => a.currency)?.currency
    ?? 'USD'
}

/**
 * What is still to invoice on a client agreement. A milestone is next when it
 * has no invoice yet, in the agreement's own order. Its due date is the day
 * it became invoiceable (signature, or marked done/accepted); a milestone
 * still waiting on work has no date, because the app does not keep one. A
 * monthly retainer's next is its first month not yet invoiced (or the coming
 * month, while the agreement runs), due on the first of that month.
 */
export function nextMilestone(a: Agreement, today: string): NextMilestone | null {
  if (a.fee.kind === 'monthly' && a.fee.amount) {
    if (a.status !== 'signed') return null
    let period = unbilledPeriods(a, today)[0]
    if (!period) {
      const [y, m] = today.slice(0, 7).split('-').map(Number)
      period = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
      if (a.endDate && a.endDate.slice(0, 7) < period) return null
    }
    return { title: periodLabel(period), due: `${period}-01`, amount: a.fee.amount, currency: a.currency }
  }
  const m = a.milestones.find(x => !x.invoiceId)
  if (!m) return null
  return { title: m.label, due: m.doneAt ?? null, amount: m.amount, currency: a.currency }
}

/** The whole share, built from the store as it is now. Pure: the same store and instant give the same file. */
export function invoicingShare(store: InvoiceStore, now: Date = new Date()): InvoicingShare {
  const today = localToday(now)
  const currency = mainCurrency(store, today)
  const paidSince = dayMinus(today, PAID_WINDOW_DAYS)
  const owedToUs: OwedInvoice[] = [], paid: PaidInvoice[] = []
  for (const invoice of Object.values(store.invoices)) {
    const content = currentContent(invoice)
    const line = { number: issuedLabel(store, invoice), client: clientOf(store, content), amount: amountOf(content), currency: content.currency ?? currency }
    const paidOn = invoice.marks?.paidAt
    if (paidOn) { if (paidOn >= paidSince) paid.push({ ...line, paidOn }); continue }
    const standing = invoiceStanding(invoice, today)
    owedToUs.push({ ...line, issued: content.invoiceDate ?? currentIssuedAt(invoice), due: standing.dueDate, daysOverdue: standing.daysOverdue })
  }
  owedToUs.sort((a, b) => b.daysOverdue - a.daysOverdue || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.number.localeCompare(b.number))
  paid.sort((a, b) => b.paidOn.localeCompare(a.paidOn) || a.number.localeCompare(b.number))
  // A correction draft is a new version of an invoice already counted above, not new money.
  const drafts: DraftInvoice[] = Object.values(store.drafts).filter(d => !d.correctionOf)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(d => ({ id: d.id, client: clientOf(store, d.content), amount: amountOf(d.content), currency: d.content.currency ?? currency }))
  const agreements: AgreementLine[] = Object.values(store.agreements ?? {})
    .filter(a => a.direction === 'client' && (a.status === 'sent' || a.status === 'signed' || a.status === 'complete'))
    .map(a => ({ title: a.title, client: partyName(store, a), state: a.status, nextMilestone: nextMilestone(a, today) }))
    .filter(a => a.state !== 'complete' || a.nextMilestone)
    .sort((a, b) => (a.nextMilestone?.due ?? '9999').localeCompare(b.nextMilestone?.due ?? '9999') || a.title.localeCompare(b.title))
  return { v: MONEY_SHARE_VERSION, at: instant(now), currency, owedToUs, drafts, paid, agreements }
}

/** Where the share lives and what turns it on, relative to the workspace's `.appdata` folder. */
export const MONEY_SHARE_FOLDER = 'executive/money'
export const MONEY_SHARE_REQUEST = 'share.json'
export const MONEY_SHARE_FILE = 'invoicing.json'

/** The share request is `{ "v": 1 }`; anything else (no file, unreadable, another version) means do not share. */
export function shareRequested(text: string | null): boolean {
  if (text === null) return false
  try { const value = JSON.parse(text) as { v?: unknown } | null; return !!value && value.v === 1 } catch { return false }
}

export interface MoneySharePort {
  /** The share request's text, or null when there is none. */
  readRequest(): Promise<string | null>
  /** Replace the share file whole (the shell writes it atomically). */
  write(text: string): Promise<void>
}
/**
 * Publishes the share after a change. Publishes run one at a time in order,
 * so an older store can never land after a newer one; a store whose share
 * reads the same as the last one written (the instant aside) is skipped.
 * The request is checked every time, so sharing starts and stops with it.
 */
export function createMoneySharePublisher(port: MoneySharePort) {
  let last: string | null = null
  let tail: Promise<unknown> = Promise.resolve()
  return {
    publish(store: InvoiceStore, now: Date = new Date()): Promise<'written' | 'unchanged' | 'not-shared'> {
      const run = tail.then(async () => {
        if (!shareRequested(await port.readRequest())) { last = null; return 'not-shared' as const }
        const share = invoicingShare(store, now)
        const key = JSON.stringify({ ...share, at: '' })
        if (key === last) return 'unchanged' as const
        await port.write(`${JSON.stringify(share, null, 2)}\n`)
        last = key
        return 'written' as const
      })
      tail = run.catch(() => undefined)
      return run
    },
  }
}
