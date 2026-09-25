import { calculateInvoice } from './calculations'
import { localToday } from './defaults'
import { invoiceStanding } from './lifecycle'
import { sumMoney } from './money'
import type { InvoiceStore } from './types'

export interface CurrencyTotals { currency: string; invoiced: string; collected: string; outstanding: string; overdue: string; count: number }
export interface ClientStats {
  key: string
  name: string
  clientId?: string
  count: number
  currency: string | null
  invoiced: string
  outstanding: string
  overdueCount: number
  lastIssuedAt: string | null
  /** Mean days from invoice date to the paid mark, over paid invoices; null without any. */
  averageDaysToPay: number | null
}
export interface ArchiveStats {
  year: number
  /** Totals for the current year, one row per currency, the busiest currency first. */
  byCurrency: CurrencyTotals[]
  /** The same totals over every issued invoice, whatever its date. */
  allTime: CurrencyTotals[]
  counts: { drafts: number; corrections: number; issued: number; sent: number; overdue: number; awaiting: number; paid: number; historical: number }
  clients: ClientStats[]
}

function days(from: string, to: string): number {
  const parse = (value: string) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d).getTime() }
  return Math.round((parse(to) - parse(from)) / 86_400_000)
}

/** What the rail and the client pages show: this year's money by currency, counts by standing, and per-client history. */
export function archiveStats(store: InvoiceStore, today: string = localToday()): ArchiveStats {
  const year = Number(today.slice(0, 4))
  type Row = { invoiced: string[]; collected: string[]; outstanding: string[]; overdue: string[]; count: number }
  const perCurrency = new Map<string, Row>(), everCurrency = new Map<string, Row>()
  const perClient = new Map<string, ClientStats & { paidDays: number[]; amounts: string[]; open: string[] }>()
  const counts = { drafts: 0, corrections: 0, issued: 0, sent: 0, overdue: 0, awaiting: 0, paid: 0, historical: 0 }
  for (const draft of Object.values(store.drafts)) { if (draft.correctionOf) counts.corrections++; else counts.drafts++ }
  for (const invoice of Object.values(store.invoices)) {
    const version = invoice.versions.find(candidate => candidate.id === invoice.currentVersionId) ?? invoice.versions[invoice.versions.length - 1]
    const content = version.content
    const total = calculateInvoice(content).total
    const currency = content.currency ?? ''
    const standing = invoiceStanding(invoice, today)
    counts.issued++
    if (invoice.historical) counts.historical++
    if (standing.mark === 'paid') counts.paid++
    else { counts.awaiting++; if (standing.mark === 'overdue') counts.overdue++; if (standing.mark === 'sent') counts.sent++ }
    const inYear = (content.invoiceDate ?? version.issuedAt).startsWith(String(year))
    for (const map of inYear ? [perCurrency, everCurrency] : [everCurrency]) {
      const row = map.get(currency) ?? { invoiced: [], collected: [], outstanding: [], overdue: [], count: 0 }
      row.invoiced.push(total); row.count++
      if (standing.mark === 'paid') row.collected.push(total); else { row.outstanding.push(total); if (standing.mark === 'overdue') row.overdue.push(total) }
      map.set(currency, row)
    }
    const key = content.clientId ?? `name:${content.recipient.name.trim().toLocaleLowerCase()}`
    const client = perClient.get(key) ?? { key, name: content.recipient.name, clientId: content.clientId, count: 0, currency: content.currency, invoiced: '0', outstanding: '0', overdueCount: 0, lastIssuedAt: null, averageDaysToPay: null, paidDays: [], amounts: [], open: [] }
    client.count++
    client.name = store.clients[content.clientId ?? '']?.name ?? client.name
    client.amounts.push(total)
    if (standing.mark !== 'paid') client.open.push(total)
    if (standing.mark === 'overdue') client.overdueCount++
    if (invoice.marks?.paidAt && content.invoiceDate) client.paidDays.push(days(content.invoiceDate, invoice.marks.paidAt))
    const issuedAt = version.issuedAt
    if (!client.lastIssuedAt || issuedAt > client.lastIssuedAt) client.lastIssuedAt = issuedAt
    perClient.set(key, client)
  }
  const totals = (map: Map<string, Row>): CurrencyTotals[] => [...map.entries()].map(([currency, row]) => ({ currency, count: row.count,
    invoiced: sumMoney(row.invoiced, currency), collected: sumMoney(row.collected, currency),
    outstanding: sumMoney(row.outstanding, currency), overdue: sumMoney(row.overdue, currency) }))
    .sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency))
  const byCurrency = totals(perCurrency), allTime = totals(everCurrency)
  const clients = [...perClient.values()].map(({ paidDays, amounts, open, ...client }) => ({ ...client,
    invoiced: sumMoney(amounts, client.currency), outstanding: sumMoney(open, client.currency),
    averageDaysToPay: paidDays.length ? Math.round(paidDays.reduce((a, b) => a + b, 0) / paidDays.length) : null }))
    .sort((a, b) => (b.lastIssuedAt ?? '').localeCompare(a.lastIssuedAt ?? '') || a.name.localeCompare(b.name))
  return { year, byCurrency, allTime, counts, clients }
}
