import type { InvoiceProduct } from '../../hooks/useInvoiceProduct'
import { agentRefs, invoiceRefs, proposalRefs } from '../../lib/agentRefs'
import { calculateInvoice } from '../../lib/invoices/calculations'
import { compactSections, type CompactRow } from '../../lib/invoices/compactRows'
import { invoiceStanding, termsLabel } from '../../lib/invoices/lifecycle'
import { formatAmount, formatMoney, isZeroMoney } from '../../lib/invoices/money'
import type { InvoiceStore } from '../../lib/invoices/types'
import { Icon, StandingChip, longDate, shortDate } from './bits'
import { Btn, Chip, Meta, Mono } from './deskStyles'
import { ProposalStatusChip } from './proposals/ProposalsView'

/** Beyond this many, the older paid and decided ones wait in the full app. */
const SETTLED_SHOWN = 8

export interface CompactRoomProps {
  product: InvoiceProduct
  store: InvoiceStore
  loaded: boolean
  storageUnavailable: boolean
  disabled: boolean
}

/** What the room holds: one issued invoice to read, or the short list. Drafts and offers open in their own pages. */
export function CompactRoom({ product: p, store, loaded, storageUnavailable, disabled }: CompactRoomProps): React.ReactElement {
  if (!loaded) return <Quiet>{storageUnavailable ? 'Invoice storage is unavailable here. Open the full app once PureDesktop has granted filesystem access.' : 'Loading your invoices…'}</Quiet>
  const atInvoice = !['proposals', 'agreements', 'contractors', 'clients', 'library'].includes(p.destination)
  if (atInvoice && p.selectedId && p.issued && p.version) return <CompactInvoice product={p} store={store} />
  return <CompactList product={p} store={store} disabled={disabled} />
}

function Quiet({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="invoicing-compact invoicing-compact-quiet" data-compact-show=""><p>{children}</p></div>
}

function CompactList({ product: p, store, disabled }: Pick<CompactRoomProps, 'product' | 'store' | 'disabled'>): React.ReactElement {
  const { outstanding, working, settled } = compactSections(store)
  if (!outstanding.length && !working.length && !settled.length) {
    return <div className="invoicing-compact invoicing-compact-quiet" data-compact-show=""><p>No invoices or offers yet.</p><Btn disabled={disabled} onClick={p.createDraft}>Start an invoice</Btn></div>
  }
  const owing = p.stats.allTime.filter(row => !isZeroMoney(row.outstanding))
  const open = (row: CompactRow) => row.type === 'offer' ? p.openProposal(row.id) : p.openInvoice(row.id)
  const earlier = settled.length - SETTLED_SHOWN
  return (
    <div className="invoicing-compact" data-compact-show="">
      <header className="invoicing-compact-owing">
        <Meta>Outstanding</Meta>
        {owing.length ? owing.map(row => (
          <div key={row.currency} className="invoicing-compact-owed">
            <Mono className="invoicing-compact-figure">{formatMoney(row.outstanding, row.currency)}</Mono>
            {!isZeroMoney(row.overdue) ? <span className="invoicing-compact-late"><Mono>{formatMoney(row.overdue, row.currency)}</Mono> overdue</span> : null}
          </div>
        )) : <div className="invoicing-compact-clear">Nothing is outstanding.</div>}
      </header>
      <Section title="Waiting for payment" rows={outstanding} open={open} />
      <Section title="In progress" rows={working} open={open} />
      <Section title="Settled" rows={settled.slice(0, SETTLED_SHOWN)} open={open} />
      {earlier > 0 ? <p className="invoicing-compact-note">{earlier} earlier {earlier === 1 ? 'one is' : 'ones are'} in the full app.</p> : null}
    </div>
  )
}

function Section({ title, rows, open }: { title: string; rows: CompactRow[]; open: (row: CompactRow) => void }): React.ReactElement | null {
  if (!rows.length) return null
  return (
    <section aria-label={title}>
      <h3 className="invoicing-compact-kicker">{title}</h3>
      {rows.map(row => (
        <button key={`${row.type}:${row.id}`} type="button" className="invoicing-compact-row" onClick={() => open(row)}
          {...agentRefs(`${row.what} · ${row.who || 'No client yet'}`, row.type === 'offer' ? proposalRefs(row.id) : invoiceRefs(row.id))}>
          <span className="invoicing-compact-who">
            <b>{row.who || (row.type === 'offer' ? 'No customer yet' : 'No client yet')}</b>
            <small>{rowDetail(row)}</small>
          </span>
          <Mono className="invoicing-compact-amount">{formatMoney(row.total, row.currency)}</Mono>
          <span className="invoicing-compact-status"><RowStatus row={row} /></span>
        </button>
      ))}
    </section>
  )
}

function rowDetail(row: CompactRow): string {
  const parts = row.type === 'offer' ? ['Offer', row.what] : [row.what]
  if (row.status.kind === 'invoice' && row.status.mark !== 'paid' && row.dueDate) parts.push(`due ${shortDate(row.dueDate)}`)
  if (row.correcting) parts.push('correction in progress')
  return parts.join(' · ')
}

function RowStatus({ row }: { row: CompactRow }): React.ReactElement {
  const { status } = row
  if (status.kind === 'offer') return <ProposalStatusChip status={status.status} />
  if (status.kind === 'draft') return <Chip>Draft</Chip>
  return <StandingChip mark={status.mark} daysOverdue={status.daysOverdue} paidAt={status.paidAt} sentAt={status.sentAt} />
}

/** One issued invoice, read straight from its retained version: the same figures its PDF carries. */
function CompactInvoice({ product: p, store }: Pick<CompactRoomProps, 'product' | 'store'>): React.ReactElement | null {
  const invoice = p.issued, version = p.version
  if (!invoice || !version) return null
  const c = version.content, calculation = calculateInvoice(c), standing = invoiceStanding(invoice)
  const superseded = version.id !== invoice.currentVersionId
  const number = invoice.versions.findIndex(candidate => candidate.id === version.id) + 1
  const correcting = Object.values(store.drafts).some(draft => draft.correctionOf === invoice.id)
  const showDiscount = !isZeroMoney(calculation.totalDiscount)
  const taxes = calculation.taxBreakdown.filter(tax => tax.rate > 0)
  // The same columns the printed page carries.
  const discountColumn = c.lineItems.some(line => (line.discountPercent ?? 0) > 0)
  const taxColumn = c.lineItems.some(line => (line.taxPercent ?? 0) > 0)
  const terms = c.termsDays !== null && c.termsDays !== undefined ? ` · ${termsLabel(c.termsDays)}` : ''
  return (
    <div className="invoicing-compact" data-compact-show="" {...agentRefs(p.label, invoiceRefs(invoice.id))}>
      <div className="invoicing-compact-bar">
        <Btn $quiet $sm onClick={() => p.openInvoice(null)}><Icon.back />Back</Btn>
        <Mono className="invoicing-compact-label">{p.label}</Mono>
        <StandingChip mark={standing.mark} daysOverdue={standing.daysOverdue} paidAt={invoice.marks?.paidAt} sentAt={invoice.marks?.sentAt} />
        {invoice.historical ? <Chip $tone="info">Historical</Chip> : null}
        {superseded || invoice.versions.length > 1 ? <Chip>{superseded ? `Superseded · v${number}` : `v${number}`}</Chip> : null}
      </div>
      <div className="invoicing-compact-read">
        <div className="invoicing-compact-head">
          <div className="invoicing-compact-to">
            <h2>{c.recipient.name || 'No client'}</h2>
            {c.reference ? <p>{c.reference}</p> : null}
            <p>Dated {longDate(c.invoiceDate)}</p>
            <p>Due {longDate(c.dueDate)}{terms}</p>
          </div>
          <div className="invoicing-compact-due">
            <Meta>{standing.mark === 'paid' ? 'Paid' : 'Total due'}</Meta>
            <Mono className="invoicing-compact-figure">{formatMoney(calculation.total, c.currency)}</Mono>
          </div>
        </div>
        <table className="invoicing-compact-lines">
          <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Rate</th>{discountColumn ? <th className="num">Disc</th> : null}{taxColumn ? <th className="num">Tax</th> : null}<th className="num">Amount</th></tr></thead>
          <tbody>
            {c.lineItems.map((line, index) => {
              const total = calculation.lines[index]?.total
              return (
                <tr key={index}>
                  <td>{line.description}</td>
                  <td className="num"><Mono>{line.quantity ?? ''}</Mono></td>
                  <td className="num"><Mono>{line.unitPrice === null ? '' : formatAmount(String(line.unitPrice), c.currency)}</Mono></td>
                  {discountColumn ? <td className="num"><Mono>{line.discountPercent ?? 0}%</Mono></td> : null}
                  {taxColumn ? <td className="num"><Mono>{line.taxPercent ?? 0}%</Mono></td> : null}
                  <td className="num"><Mono>{total === null || total === undefined ? '—' : formatAmount(total, c.currency)}</Mono></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <dl className="invoicing-compact-totals">
          <div><dt>Subtotal</dt><dd><Mono>{formatAmount(calculation.subtotal, c.currency)}</Mono></dd></div>
          {showDiscount ? <div><dt>Discounts</dt><dd><Mono>−{formatAmount(calculation.totalDiscount, c.currency)}</Mono></dd></div> : null}
          {taxes.map(tax => <div key={tax.rate}><dt>Tax {tax.rate}%</dt><dd><Mono>{formatAmount(tax.amount, c.currency)}</Mono></dd></div>)}
          <div className="invoicing-compact-grand"><dt>Total{c.currency ? ` ${c.currency}` : ''}</dt><dd><Mono>{formatMoney(calculation.total, c.currency)}</Mono></dd></div>
        </dl>
        {c.notes.trim() ? <p className="invoicing-compact-notes">{c.notes}</p> : null}
        <ul className="invoicing-compact-marks">
          {invoice.marks?.sentAt ? <li>Sent {longDate(invoice.marks.sentAt)}{invoice.marks.sentTo ? ` to ${invoice.marks.sentTo}` : ''}</li> : <li>Not marked as sent</li>}
          {invoice.marks?.paidAt ? <li>Paid {longDate(invoice.marks.paidAt)}{invoice.marks.paidReference ? ` · ${invoice.marks.paidReference}` : ''}</li> : standing.mark === 'overdue' ? <li className="invoicing-compact-late">{standing.daysOverdue} day{standing.daysOverdue === 1 ? '' : 's'} overdue</li> : null}
          {correcting ? <li>A correction is in progress. This invoice stays as issued until it is published.</li> : null}
        </ul>
        <p className="invoicing-compact-note">To mark it paid, correct it or get the PDF, use the full app.</p>
      </div>
    </div>
  )
}
