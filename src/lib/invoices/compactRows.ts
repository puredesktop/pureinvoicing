import { proposalRows } from './proposals'
import { searchInvoices } from './queries'
import type { InvoiceMark } from './lifecycle'
import type { InvoiceStore, ProposalStatus } from './types'

export type CompactStatus =
  | { kind: 'invoice'; mark: InvoiceMark; daysOverdue: number; paidAt?: string; sentAt?: string }
  | { kind: 'draft' }
  | { kind: 'offer'; status: ProposalStatus }

export interface CompactRow {
  id: string
  type: 'invoice' | 'offer'
  who: string
  /** The issued number or the offer's title. A draft has no number yet. */
  what: string
  dueDate: string | null
  total: string
  currency: string | null
  status: CompactStatus
  updatedAt: string
  correcting: boolean
}

export interface CompactSections {
  /** Issued and not paid: the longest overdue first, then the soonest due. */
  outstanding: CompactRow[]
  /** Invoice drafts and offers still in play: the latest first. */
  working: CompactRow[]
  /** Paid invoices and offers that were decided: the latest first. */
  settled: CompactRow[]
}

const latestFirst = (a: CompactRow, b: CompactRow) => b.updatedAt.localeCompare(a.updatedAt)

/** Every invoice and offer in one read, from the app's own queries, so totals and numbers are the ones it shows elsewhere. */
export function compactSections(store: InvoiceStore): CompactSections {
  const sections: CompactSections = { outstanding: [], working: [], settled: [] }
  let cursor: string | undefined
  do {
    const page = searchInvoices(store, { limit: 100, cursor })
    for (const row of page.items) {
      const shown: CompactRow = {
        id: row.id, type: 'invoice', who: row.recipient.name, what: row.numberText ?? 'Draft invoice', dueDate: row.dueDate,
        total: row.total, currency: row.currency, updatedAt: row.updatedAt, correcting: !!row.correctionId,
        status: row.status === 'draft' ? { kind: 'draft' } : { kind: 'invoice', mark: row.mark as InvoiceMark, daysOverdue: row.daysOverdue, paidAt: row.marks?.paidAt, sentAt: row.marks?.sentAt },
      }
      if (row.status === 'draft') sections.working.push(shown)
      else if (row.mark === 'paid') sections.settled.push(shown)
      else sections.outstanding.push(shown)
    }
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  for (const row of proposalRows(store)) {
    const shown: CompactRow = {
      id: row.id, type: 'offer', who: row.customer, what: row.title || 'Untitled', dueDate: null,
      total: row.total, currency: row.currency, updatedAt: row.updatedAt, correcting: false, status: { kind: 'offer', status: row.status },
    }
    if (row.status === 'draft' || row.status === 'offered') sections.working.push(shown)
    else sections.settled.push(shown)
  }
  sections.outstanding.sort((a, b) => {
    const days = (row: CompactRow) => (row.status.kind === 'invoice' ? row.status.daysOverdue : 0)
    return days(b) - days(a) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.id.localeCompare(b.id)
  })
  sections.working.sort(latestFirst)
  sections.settled.sort(latestFirst)
  return sections
}
