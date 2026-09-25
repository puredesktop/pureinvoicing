import { useEffect, useRef, useState } from 'react'
import type { BusinessSetup } from '../../hooks/useBusinessSetup'
import type { InvoiceProduct } from '../../hooks/useInvoiceProduct'
import type { InvoiceMark } from '../../lib/invoices/lifecycle'
import { formatMoney } from '../../lib/invoices/money'
import { workspaceState } from '../../lib/invoices/queries'
import { PaymentDialog, type PaymentTarget } from './PaymentDialog'
import { NotesDialog } from './Annotations'
import type { ArchiveQuery, InvoiceStore } from '../../lib/invoices/types'
import { Avatar, Body, Btn, Card, Chip, Dot, Hint, Kicker, List, Main, Meta, Mono, Panel, Pill, Popover, MenuHead, MenuItem, Rail, RailRow, SearchBox, Select } from './deskStyles'
import { Icon, StandingChip, hueOf, initials, shortDate, whenWords } from './bits'
import { FirstUse } from './FirstUse'
import { ImportSheet } from './ImportSheet'

type Place = 'all' | 'overdue' | 'open' | 'draft'
const PLACES: Array<{ id: Place; label: string; color?: string }> = [
  { id: 'all', label: 'All invoices' },
  { id: 'overdue', label: 'Overdue', color: 'var(--d-bad-ink)' },
  { id: 'open', label: 'Awaiting payment', color: 'var(--d-warn-ink)' },
  { id: 'draft', label: 'Drafts', color: 'var(--d-faint)' },
]

type ArchiveRow = InvoiceProduct['archive']['items'][number]
const paymentTarget = (row: ArchiveRow): PaymentTarget => ({ id: row.id, numberText: row.numberText ?? '', client: row.recipient.name || 'Unnamed client', total: String(row.total), currency: row.currency ?? undefined, dueDate: row.dueDate ?? undefined, marks: row.marks ?? undefined })

/** The archive: places and money in the rail, the list in the middle, one primary action. */
export function ArchiveView({ product: p, setup: s, store, disabled }: { product: InvoiceProduct; setup: BusinessSetup; store: InvoiceStore; disabled: boolean }): React.ReactElement {
  const q = p.archiveQuery, state = workspaceState(store), stats = p.stats
  const list = useRef<HTMLDivElement>(null)
  // Recording or correcting a payment straight from the list.
  const [paying, setPaying] = useState<PaymentTarget | null>(null)
  // The notes sheet for one issued invoice, opened from its row.
  const [notesFor, setNotesFor] = useState<string | null>(null)
  const notesInvoice = notesFor ? store.invoices[notesFor] : undefined
  useEffect(() => { if (list.current) list.current.scrollTop = p.scrollTop }, [p.scrollTop])
  const filter = (patch: ArchiveQuery) => p.updateArchive({ ...patch, cursor: '0' })
  const place: Place = q.status === 'overdue' || q.status === 'open' || q.status === 'draft' ? q.status : 'all'
  const [menu, setMenu] = useState<{ kind: 'sort' | 'status'; rect: DOMRect } | null>(null)
  useEffect(() => {
    if (!menu) return
    const close = (event: MouseEvent) => { if (!(event.target as Element | null)?.closest?.('[data-popover]')) setMenu(null) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(null) }
    window.addEventListener('mousedown', close); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', key) }
  }, [menu])
  const money = stats.byCurrency[0]
  const sortWords: Record<string, string> = { updatedAt: 'newest', invoiceDate: 'invoice date', number: 'number', client: 'client' }
  const showingWords = `${p.archive.total} invoice${p.archive.total === 1 ? '' : 's'}${stats.counts.overdue ? ` · ${stats.counts.overdue} overdue` : ''}${stats.counts.drafts ? ` · ${stats.counts.drafts} draft${stats.counts.drafts === 1 ? '' : 's'}` : ''}`
  return (
    <Body>
      <Rail aria-label="Places">
        {PLACES.map(item => {
          const count = item.id === 'all' ? stats.counts.issued + stats.counts.drafts : item.id === 'overdue' ? stats.counts.overdue : item.id === 'open' ? stats.counts.awaiting : stats.counts.drafts
          return <RailRow key={item.id} $on={place === item.id && !q.clientId} onClick={() => filter({ status: item.id, clientId: undefined })}><Dot $color={item.color} /><span className="name">{item.label}</span><small>{count}</small></RailRow>
        })}
        {stats.clients.length ? <Kicker style={{ padding: '12px 8px 4px' }}>Clients</Kicker> : null}
        {stats.clients.slice(0, 8).map(client => (
          <RailRow key={client.key} $on={!!client.clientId && q.clientId === client.clientId} disabled={!client.clientId} title={client.clientId ? undefined : 'Typed on the invoice, not in the directory'} onClick={() => client.clientId && filter({ clientId: q.clientId === client.clientId ? undefined : client.clientId, status: 'all' })}>
            <Avatar $hue={hueOf(client.name)} $size={18}>{initials(client.name)}</Avatar><span className="name">{client.name || 'Unnamed client'}</span><small>{client.count}</small>
          </RailRow>
        ))}
        {/* Money, added up from each invoice's own total: this calendar year by invoice date, then every invoice. */}
        {[
          ...(money ? [{ key: 'year', title: `${stats.year} · by invoice date`, row: money }] : []),
          ...(stats.allTime[0] && stats.allTime[0].count !== money?.count ? [{ key: 'all', title: 'All time', row: stats.allTime.find(r => r.currency === money?.currency) ?? stats.allTime[0] }] : []),
        ].map(({ key, title, row }) => (
          <div key={key}>
            <Kicker style={{ display: 'flex', padding: '12px 8px 4px' }}><span>{title}{stats.byCurrency.length > 1 || stats.allTime.length > 1 ? ` · ${row.currency}` : ''}</span><span style={{ flex: 1 }} /><span>{row.count} invoice{row.count === 1 ? '' : 's'}</span></Kicker>
            <div style={{ padding: '2px 8px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Meta>Invoiced</Meta><Mono>{formatMoney(row.invoiced, row.currency)}</Mono></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Meta>Collected</Meta><Mono>{formatMoney(row.collected, row.currency)}</Mono></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Meta>Outstanding</Meta><Mono style={{ color: Number(row.overdue) > 0 ? 'var(--d-bad-ink)' : undefined }}>{formatMoney(row.outstanding, row.currency)}</Mono></div>
            </div>
          </div>
        ))}
        <span style={{ flex: 1 }} />
        <Card style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, margin: '8px 0 0' }}>
          <Kicker>Next number</Kicker>
          <Mono style={{ fontSize: 15, fontWeight: 500 }}>{s.nextLabel}</Mono>
          <Hint>{store.sequence.verified ? 'Assigned when you issue.' : 'Confirm the starting number in Business before issuing.'}</Hint>
        </Card>
      </Rail>
      <Main>
        {state.firstUse ? <FirstUse product={p} setup={s} store={store} disabled={disabled} /> : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SearchBox><Icon.search /><input type="search" placeholder="Search number, client or reference" value={q.query ?? ''} onChange={event => filter({ query: event.target.value })} /></SearchBox>
          <Pill $on={!!q.status && !['all', 'overdue', 'open', 'draft'].includes(q.status)} onClick={event => setMenu({ kind: 'status', rect: event.currentTarget.getBoundingClientRect() })}>{q.status === 'sent' ? 'Sent' : q.status === 'paid' ? 'Paid' : q.status === 'issued' ? 'Issued' : 'Status'} <span className="caret">▾</span></Pill>
          <Pill onClick={event => setMenu({ kind: 'sort', rect: event.currentTarget.getBoundingClientRect() })}>Sort: {sortWords[q.sortBy ?? 'updatedAt']} <span className="caret">▾</span></Pill>
          {q.historicalOnly ? <Pill $on onClick={() => filter({ historicalOnly: false })}>Historical only <span className="caret">×</span></Pill> : null}
          <span style={{ flex: 1 }} />
          <Meta>{showingWords}</Meta>
          <Btn $acc disabled={disabled} onClick={p.createDraft}><Icon.plus />Invoice</Btn>
        </div>
        <Panel style={{ flex: '1 1 auto', overflow: 'hidden' }}>
          <div ref={list} style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }} tabIndex={0} aria-label="Invoices">
            {!p.archive.total ? (
              <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                <strong>{state.firstUse ? 'No invoices yet' : 'Nothing matches'}</strong>
                <Meta>{state.firstUse ? 'Start a draft, or register invoices you issued before.' : 'Try another number or client, or clear the search and filters. Nothing has been removed.'}</Meta>
                {!state.firstUse ? <Btn $sm onClick={() => filter({ query: '', status: 'all', clientId: undefined, historicalOnly: false })}>Clear search and filters</Btn> : null}
              </div>
            ) : (
              <List>
                <thead><tr><th style={{ width: 132 }}>Number</th><th>Client</th><th className="c-issued" style={{ width: 104 }}>Issued</th><th className="c-due" style={{ width: 88 }}>Due</th><th className="num" style={{ width: 124 }}>Total</th><th style={{ width: 150 }}>Status</th><th style={{ width: p.archive.items.some(row => row.status !== 'draft' && row.mark !== 'paid') ? 212 : 120 }} /></tr></thead>
                <tbody>
                  {p.archive.items.map(row => {
                    const draft = row.status === 'draft'
                    return (
                      <tr key={row.id} aria-selected={p.selectedId === row.id} onClick={() => p.openInvoice(row.id, list.current?.scrollTop ?? 0)}>
                        <td><Mono style={{ color: draft ? 'var(--d-muted)' : undefined, whiteSpace: 'nowrap' }}>{draft ? row.provisionalNumberText : row.numberText}</Mono>{draft ? <Hint style={{ display: 'block' }}>provisional</Hint> : row.historical ? <Hint style={{ display: 'block' }}>registered</Hint> : row.correctionId ? <Hint style={{ display: 'block' }}>correction in progress</Hint> : null}</td>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><Avatar $hue={hueOf(row.recipient.name)}>{initials(row.recipient.name || '?')}</Avatar><div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.recipient.name || 'Unnamed client'}</div>{row.reference ? <Hint style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.reference}</Hint> : null}{row.notes.length ? <button type="button" className="note-line" title={row.notes.map(n => n.text).join('\n')} onClick={event => { event.stopPropagation(); setNotesFor(row.id) }}><Icon.note /><span>{row.notes[0].text}</span>{row.notes.length > 1 ? <small>+{row.notes.length - 1}</small> : null}</button> : null}</div></div></td>
                        <td className="c-issued">{draft ? <Meta>—</Meta> : shortDate(row.invoiceDate)}</td>
                        <td className="c-due" style={{ color: row.mark === 'overdue' ? 'var(--d-bad-ink)' : undefined }}>{row.dueDate ? shortDate(row.dueDate) : <Meta>—</Meta>}</td>
                        <td className="num"><Mono>{formatMoney(row.total, row.currency)}</Mono></td>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {draft ? <><Chip>Draft</Chip><Hint>edited {whenWords(row.updatedAt)}</Hint></> : <>{row.mark === 'paid' ? <button type="button" className="chip-button" title={`Paid ${row.marks?.paidAt ?? ''}${row.marks?.paidReference ? ` · ${row.marks.paidReference}` : ''}. Click to edit the payment.`} disabled={disabled} onClick={event => { event.stopPropagation(); setPaying(paymentTarget(row)) }} style={{ border: 0, padding: 0, background: 'none', cursor: 'pointer', font: 'inherit' }}><StandingChip mark="paid" paidAt={row.marks?.paidAt} /></button> : <StandingChip mark={row.mark as InvoiceMark} daysOverdue={row.daysOverdue} paidAt={row.marks?.paidAt} sentAt={row.marks?.sentAt} />}{row.historical ? <Chip $tone="info">Historical</Chip> : null}</>}
                        </div></td>
                        <td onClick={event => event.stopPropagation()}>
                          {!draft ? <Btn $sm $quiet className="row-note" aria-label={`Notes on ${row.numberText}`} title={row.documentCount ? `Notes · ${row.documentCount} linked document${row.documentCount === 1 ? '' : 's'}` : 'Notes'} style={{ marginRight: 2, padding: '0 6px' }} onClick={() => setNotesFor(row.id)}><Icon.note /></Btn> : null}{!draft && row.mark !== 'paid' ? <Btn $sm disabled={disabled} style={{ marginRight: 6 }} onClick={() => setPaying(paymentTarget(row))}>Mark paid</Btn> : null}
                          {draft ? <Btn $sm onClick={() => p.openInvoice(row.id)}>Continue</Btn> : <Btn $sm disabled={disabled} onClick={() => { void p.openInvoice(row.id).then(() => p.download({ kind: 'downloadVersion' })) }}>PDF</Btn>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </List>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderTop: '1px solid var(--d-line)' }}>
            <Meta>Issued means finalised here. Sent and paid are marks you set; nothing is posted to a ledger.</Meta>
            <span style={{ flex: 1 }} />
            {p.archive.total > (q.limit ?? 25) ? <>
              <Btn $quiet $sm disabled={p.pageOffset === 0} onClick={() => p.updateArchive({ cursor: String(Math.max(0, p.pageOffset - (q.limit ?? 25))) })}>Previous</Btn>
              <Meta>{p.pageOffset + 1}–{p.pageOffset + p.archive.items.length} of {p.archive.total}</Meta>
              <Btn $quiet $sm disabled={!p.archive.nextCursor} onClick={() => p.updateArchive({ cursor: p.archive.nextCursor ?? '0' })}>Next</Btn>
              <Select style={{ width: 'auto', height: 26 }} value={q.limit ?? 25} onChange={event => filter({ limit: Number(event.target.value) })}>{[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} per page</option>)}</Select>
            </> : null}
            <Btn $quiet $sm disabled={disabled} onClick={p.registerExisting}>Register a past invoice</Btn>
            <Btn $quiet $sm disabled={disabled} onClick={p.openImport}>Import invoices…</Btn>
          </div>
        </Panel>
      </Main>
      {notesInvoice ? <NotesDialog title={p.labelFor(notesInvoice.id) ?? ''} subtitle={notesInvoice.versions.find(v => v.id === notesInvoice.currentVersionId)?.content.recipient.name ?? ''} notes={notesInvoice.notes ?? []} disabled={disabled}
        onAdd={text => p.addNote(notesInvoice.id, text)} onUpdate={(noteId, change) => p.updateNote(notesInvoice.id, noteId, change)} onClose={() => setNotesFor(null)} /> : null}
      {paying ? <PaymentDialog target={paying} disabled={disabled} onSave={(request, id) => void p.markInvoice(request, id)} onClose={() => setPaying(null)} /> : null}
      <ImportSheet product={p} disabled={disabled} />
      {menu ? (
        <Popover data-popover role="menu" style={{ left: menu.rect.left, top: menu.rect.bottom + 6, width: 200 }}>
          {menu.kind === 'status' ? <>
            <MenuHead>Status</MenuHead>
            {([['all', 'Everything'], ['issued', 'Issued'], ['sent', 'Sent'], ['paid', 'Paid']] as const).map(([value, label]) => <MenuItem key={value} $on={(q.status ?? 'all') === value} onClick={() => { filter({ status: value, historicalOnly: false }); setMenu(null) }}>{label}</MenuItem>)}
            <MenuItem $on={!!q.historicalOnly} onClick={() => { filter({ historicalOnly: !q.historicalOnly }); setMenu(null) }}>Historical only</MenuItem>
          </> : <>
            <MenuHead>Sort by</MenuHead>
            {(['updatedAt', 'invoiceDate', 'number', 'client'] as const).map(value => <MenuItem key={value} $on={(q.sortBy ?? 'updatedAt') === value} onClick={() => { filter({ sortBy: value }); setMenu(null) }}>{sortWords[value][0].toUpperCase() + sortWords[value].slice(1)}</MenuItem>)}
            <MenuItem onClick={() => { filter({ sortDirection: q.sortDirection === 'ascending' ? 'descending' : 'ascending' }); setMenu(null) }}>{q.sortDirection === 'ascending' ? 'Ascending' : 'Descending'}<small>flip</small></MenuItem>
          </>}
        </Popover>
      ) : null}
    </Body>
  )
}
