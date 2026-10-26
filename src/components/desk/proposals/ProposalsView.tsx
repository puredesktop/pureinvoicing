import { useState } from 'react'
import type { InvoiceProduct } from '../../../hooks/useInvoiceProduct'
import { agentRefs, proposalRefs } from '../../../lib/agentRefs'
import { invoiceCommands } from '../../../lib/invoices/workspace'
import { formatMoney } from '../../../lib/invoices/money'
import { PROPOSAL_STATUSES, PROPOSAL_STATUS_LABEL, proposalRows } from '../../../lib/invoices/proposals'
import type { InvoiceStore, ProposalStatus } from '../../../lib/invoices/types'
import { Icon, hueOf, initials, shortDate } from '../bits'
import { Avatar, Body, Btn, Card, Chip, Dot, Hint, Kicker, List, Main, Meta, Mono, Panel, Rail, RailRow, SearchBox } from '../deskStyles'
import { ProposalPage } from './ProposalPage'

const STATUS_TONE: Record<ProposalStatus, 'neutral' | 'warn' | 'ok' | 'bad'> = { draft: 'neutral', offered: 'warn', accepted: 'ok', declined: 'bad' }
export const PROPOSAL_DOT: Record<ProposalStatus, string> = { draft: 'var(--d-faint)', offered: 'var(--d-warn-ink)', accepted: 'var(--d-ok-ink)', declined: 'var(--d-bad-ink)' }

export function ProposalStatusChip({ status }: { status: ProposalStatus }): React.ReactElement {
  return <Chip $tone={STATUS_TONE[status]}>{status !== 'draft' ? <i /> : null}{PROPOSAL_STATUS_LABEL[status]}</Chip>
}

/**
 * Proposals: enquiries and the offers made for them. Kept apart from
 * invoices; an accepted offer becomes an invoice draft only when asked.
 */
export function ProposalsView({ product: p, store, disabled }: { product: InvoiceProduct; store: InvoiceStore; disabled: boolean }): React.ReactElement {
  const [place, setPlace] = useState<'all' | ProposalStatus>('all')
  const [query, setQuery] = useState('')
  const selected = p.selectedProposalId ? store.proposals?.[p.selectedProposalId] : undefined
  if (selected) return <ProposalPage key={selected.id} product={p} store={store} proposal={selected} disabled={disabled} />
  const rows = proposalRows(store)
  const needle = query.trim().toLocaleLowerCase()
  const visible = rows.filter(r => (place === 'all' || r.status === place) && (!needle || [r.title, r.customer].some(v => v.toLocaleLowerCase().includes(needle))))
  const start = () => p.act(async () => { const made = await invoiceCommands.createProposal(); await p.openProposal(made.id) })
  return (
    <Body style={{ gap: 14, padding: '14px 18px 18px' }}>
      <Rail aria-label="Proposal places">
        <RailRow $on={place === 'all'} onClick={() => setPlace('all')}><span className="name">All proposals</span><small>{rows.length}</small></RailRow>
        {PROPOSAL_STATUSES.map(status => (
          <RailRow key={status} $on={place === status} onClick={() => setPlace(status)}><Dot $color={PROPOSAL_DOT[status]} /><span className="name">{PROPOSAL_STATUS_LABEL[status]}</span><small>{rows.filter(r => r.status === status).length}</small></RailRow>
        ))}
        <span style={{ flex: 1 }} />
        <Card style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, margin: '8px 0 0' }}>
          <Kicker>From enquiry to invoice</Kicker>
          <span style={{ fontSize: 12.5 }}>Each offer you make is kept as it was sent. Changes after that start a new version.</span>
          <Hint>When the customer accepts, make the invoice draft from that version. Proposals use no invoice numbers.</Hint>
        </Card>
      </Rail>
      <Main style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SearchBox style={{ width: 300 }}><Icon.search /><input aria-label="Search proposals" placeholder="Search customer or title" value={query} onChange={event => setQuery(event.target.value)} /></SearchBox>
          <span style={{ flex: 1 }} />
          <Meta>{visible.length} proposal{visible.length === 1 ? '' : 's'}</Meta>
          <Btn $acc disabled={disabled} onClick={start}><Icon.plus />New proposal</Btn>
        </div>
        <Panel $strong style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: '1 1 auto', overflow: 'auto' }}>
            {!rows.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '70px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>Answer an enquiry with an offer</div>
                <Meta style={{ maxWidth: 460 }}>Note what the customer asked for, set out the scope, deliverables, timing and prices, and keep a record of what you offered and what they decided.</Meta>
                <Btn $acc disabled={disabled} onClick={start}><Icon.plus />New proposal</Btn>
              </div>
            ) : !visible.length ? <Meta style={{ display: 'block', padding: 24 }}>Nothing here. Try another place or clear the search.</Meta> : (
              <List>
                <thead><tr><th>Customer</th><th style={{ width: 120 }}>Version</th><th className="num" style={{ width: 140 }}>Total</th><th style={{ width: 120 }}>Enquiry</th><th style={{ width: 190 }}>Status</th></tr></thead>
                <tbody>
                  {visible.map(r => (
                    <tr key={r.id} {...agentRefs(`${r.customer || 'New proposal'} · ${r.title || 'Untitled'}`, proposalRefs(r.id))} onClick={() => p.openProposal(r.id)}>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><Avatar $hue={hueOf(r.customer || '?')}>{initials(r.customer || '?')}</Avatar><div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer || 'No customer yet'}</div><Hint style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || 'Untitled proposal'}</Hint></div></div></td>
                      <td><Mono>v{r.shownVersion.number}</Mono>{r.versionCount > 1 ? <Hint> of {r.versionCount}</Hint> : null}</td>
                      <td className="num"><Mono>{r.currency ? formatMoney(r.total, r.currency) : r.total}</Mono></td>
                      <td>{r.enquiryDate ? shortDate(r.enquiryDate) : <Meta>—</Meta>}</td>
                      <td><ProposalStatusChip status={r.status} />{r.invoice ? <Hint style={{ display: 'block', marginTop: 3 }}>{r.invoice.status === 'issued' ? `Invoiced · ${r.invoice.numberText}` : r.invoice.status === 'draft' ? 'Invoice draft made' : 'Invoice draft discarded'}</Hint> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </List>
            )}
          </div>
        </Panel>
      </Main>
    </Body>
  )
}
