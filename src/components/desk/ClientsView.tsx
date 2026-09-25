import { styled } from 'styled-components'
import { PreviewPane } from './PreviewPane'
import { DocumentsList } from './Annotations'
import { AgreementStatusChip } from './agreements/agreementBits'
import { EmailsInput } from './EmailsInput'
import { PeopleLookupInput } from './PeopleLookupInput'
import { useEffect } from 'react'
import type { ClientDirectory } from '../../hooks/useClientDirectory'
import type { InvoiceProduct } from '../../hooks/useInvoiceProduct'
import type { InvoiceMark } from '../../lib/invoices/lifecycle'
import { TERMS_PRESETS, termsLabel } from '../../lib/invoices/lifecycle'
import { formatMoney } from '../../lib/invoices/money'
import { searchInvoices } from '../../lib/invoices/queries'
import type { InvoiceStore } from '../../lib/invoices/types'
import { Icon, StandingChip, hueOf, initials, shortDate } from './bits'
import { Area, Avatar, Body, Btn, Card, Chip, Field, Grid, Hint, Input, List, Meta, Mono, Panel, Pill, SearchBox, Sec, SecHead, Select, Slot, Stat } from './deskStyles'

/** The directory: every client with what they owe, and one client's details and invoices. */
const TestOverlay = styled.div`
  position: fixed; inset: 0; z-index: 60; background: rgba(15, 20, 30, .35); display: flex; justify-content: center; padding: 28px 16px;
  .sheet { width: min(860px, 100%); display: flex; flex-direction: column; gap: 12px; padding: 18px 20px; border-radius: 16px; background: var(--d-surface, #fff); color: var(--d-ink, #171717); box-shadow: 0 20px 60px rgba(0,0,0,.25); min-height: 0; }
  .head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .head b { display: block; font-size: 15px; }
`

export function ClientsView({ product: p, directory: d, store, disabled }: { product: InvoiceProduct; directory: ClientDirectory; store: InvoiceStore; disabled: boolean }): React.ReactElement {
  const clients = Object.values(store.clients).sort((a, b) => a.name.localeCompare(b.name))
  const statsFor = (id: string) => p.stats.clients.find(client => client.clientId === id)
  const selectedId = p.selectedClientId && store.clients[p.selectedClientId] ? p.selectedClientId : clients[0]?.id ?? null
  const client = selectedId ? store.clients[selectedId] : null
  const stats = client ? statsFor(client.id) : undefined
  const needle = d.query.trim().toLocaleLowerCase()
  const visible = needle ? clients.filter(candidate => [candidate.name, candidate.billingAddress, candidate.contactName, candidate.email].some(value => value?.toLocaleLowerCase().includes(needle))) : clients
  useEffect(() => { if (client && d.editor && d.editor.clientId && d.editor.clientId !== client.id) d.cancel() }, [client?.id])
  const invoices = client ? searchInvoices(store, { clientId: client.id, sortBy: 'invoiceDate', limit: 100 }).items : []
  const editing = d.editor
  return (
    <Body>
      <Panel style={{ flex: '0 0 400px', overflow: 'hidden' }}>
        <div style={{ padding: '12px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <SearchBox style={{ minWidth: 0, flex: 1 }}><Icon.search /><input placeholder="Search clients" value={d.query} onChange={event => d.search(event.target.value)} /></SearchBox>
          <Btn $acc $sm disabled={disabled || !!editing} onClick={d.create}><Icon.plus />Client</Btn>
        </div>
        <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '0 10px 10px' }}>
          {visible.map(candidate => {
            const s = statsFor(candidate.id)
            return (
              <Card key={candidate.id} style={{ padding: '10px 12px', display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', ...(candidate.id === selectedId ? { borderColor: 'var(--d-acc)', boxShadow: '0 0 0 3px var(--d-acc-soft)' } : {}) }} onClick={() => p.selectClient(candidate.id)}>
                <Avatar $hue={hueOf(candidate.name)} $size={32}>{initials(candidate.name)}</Avatar>
                <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidate.name}</div><Hint>{s ? `${s.count} invoice${s.count === 1 ? '' : 's'} · ${formatMoney(s.invoiced, s.currency)}${s.lastIssuedAt ? ` · last ${shortDate(s.lastIssuedAt.slice(0, 10))}` : ''}` : 'No invoices yet'}</Hint></div>
                {s?.overdueCount ? <Chip $tone="bad">{s.overdueCount} overdue</Chip> : s && Number(s.outstanding) > 0 ? <Chip $tone="warn">open</Chip> : s ? <Chip $tone="ok">settled</Chip> : null}
              </Card>
            )
          })}
          {!visible.length ? <Meta style={{ padding: '10px 4px' }}>{needle ? 'Nothing matches.' : 'No clients yet.'}</Meta> : null}
          <Slot><Icon.plus />A recipient typed on any draft can be saved here in one click.</Slot>
        </div>
      </Panel>
      <Panel $strong style={{ flex: '1 1 auto', overflow: 'auto' }}>
        {editing ? (
          <Sec>
            <SecHead><h3>{editing.clientId ? 'Edit client' : 'New client'}</h3><span className="sp" /><Btn $quiet $sm onClick={d.cancel}>Cancel</Btn><Btn $acc $sm disabled={d.busy || !editing.details.name.trim()} onClick={d.save}>{editing.clientId ? 'Save changes' : 'Create client'}</Btn></SecHead>
            <Grid>
              <Field><span>Client organisation</span><PeopleLookupInput kind="org" value={editing.details.name} invalid={!editing.details.name.trim()} placeholder="Name or PurePeople organisation" onChange={name => d.change({ name })} onPick={org => d.change({ name: org.name, phone: editing.details.phone || org.phone })} /></Field>
              <Field><span>Contact person</span><PeopleLookupInput kind="person" value={editing.details.contactName ?? ''} placeholder="Name or PurePeople contact" onChange={contactName => d.change({ contactName })} onPick={person => d.change({ contactName: person.name, email: editing.details.email || person.email, phone: editing.details.phone || person.phone, name: editing.details.name.trim() || person.organization || editing.details.name })} /></Field>
            </Grid>
            <Grid $cols="1.4fr 1fr">
              <Field><span>Billing address</span><Area value={editing.details.billingAddress} onChange={event => d.change({ billingAddress: event.target.value })} /></Field>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field as="div"><span>Email</span><EmailsInput value={editing.details.email} onChange={email => d.change({ email })} onPickPerson={person => d.change({ contactName: editing.details.contactName || person.name, phone: editing.details.phone || person.phone, name: editing.details.name.trim() || person.organization || editing.details.name })} /></Field>
                <Field><span>Phone</span><Input value={editing.details.phone ?? ''} onChange={event => d.change({ phone: event.target.value })} /></Field>
              </div>
            </Grid>
            <Grid $cols="1fr 1fr 1fr">
              <Field><span>Tax identifier</span><Input value={editing.details.taxIdentifier ?? ''} placeholder="optional" onChange={event => d.change({ taxIdentifier: event.target.value })} /></Field>
              <Field><span>Usual terms</span><Select value={editing.details.termsDays ?? ''} onChange={event => d.change({ termsDays: event.target.value === '' ? undefined : Number(event.target.value) })}><option value="">Business default</option>{TERMS_PRESETS.map(preset => <option key={preset.days} value={preset.days}>{preset.label}</option>)}</Select></Field>
              <Field><span>Usual currency</span><Input value={editing.details.currency ?? ''} placeholder="e.g. USD" onChange={event => d.change({ currency: event.target.value.toUpperCase() || undefined })} /></Field>
            </Grid>
            <Hint>Changing these changes nothing already drafted or issued. Each invoice keeps its own copy.</Hint>
            {d.error ? <Hint $err>{d.error}</Hint> : null}
          </Sec>
        ) : client ? (
          <>
            {p.clientTest?.clientId === client.id ? <TestOverlay role="dialog" aria-label={`Test invoice to ${client.name}`} onMouseDown={e => { if (e.target === e.currentTarget) p.closeClientTest() }}>
              <div className="sheet">
                <div className="head"><div><b>Test invoice to {client.name}</b><Meta>Your template with this client’s details. Nothing is saved and no invoice number is used.</Meta></div><span style={{ flex: 1 }} /><Btn $acc disabled={disabled} onClick={() => { p.closeClientTest(); void p.createDraftForClient(client.id) }}><Icon.plus />Start a real invoice</Btn><Btn $quiet onClick={p.closeClientTest}>Close</Btn></div>
                <PreviewPane pages={p.clientTest.result?.pages ?? null} diagnostics={p.clientTest.result?.diagnostics.filter(x => !x.field.startsWith('pages.')) ?? []} rendering={!p.clientTest.result} caption="a test invoice" />
              </div>
            </TestOverlay> : null}
            <Sec style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar $hue={hueOf(client.name)} $size={44}>{initials(client.name)}</Avatar>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{client.name}</div><Meta>{[client.contactName, client.email, client.termsDays !== undefined ? `usual terms ${termsLabel(client.termsDays)}` : null, client.currency].filter(Boolean).join(' · ') || 'No contact details yet'}</Meta></div>
              <span style={{ flex: 1 }} />
              <Btn disabled={disabled} onClick={() => d.edit(client)}>Edit details</Btn>
              <Btn disabled={disabled} onClick={() => p.testInvoiceForClient(client.id)} title="See an invoice to this client in your template. Nothing is saved and no number is used.">Test invoice</Btn>
              <Btn $acc disabled={disabled} onClick={() => p.createDraftForClient(client.id)}><Icon.plus />Invoice for {client.name.split(' ')[0]}</Btn>
            </Sec>
            <Sec style={{ flexDirection: 'row', gap: 10 }}>
              <Stat style={{ flex: 1 }}><span className="l">Invoiced</span><span className="v">{stats ? formatMoney(stats.invoiced, stats.currency) : '—'}</span></Stat>
              <Stat style={{ flex: 1 }}><span className="l">Outstanding</span><span className="v" style={{ color: stats && Number(stats.outstanding) > 0 ? (stats.overdueCount ? 'var(--d-bad-ink)' : 'var(--d-warn-ink)') : undefined }}>{stats ? formatMoney(stats.outstanding, stats.currency) : '—'}</span></Stat>
              <Stat style={{ flex: 1 }}><span className="l">Average days to pay</span><span className="v">{stats?.averageDaysToPay ?? '—'}</span></Stat>
              <Stat style={{ flex: 1 }}><span className="l">Billing address</span><span className="v" style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'pre-line', overflow: 'visible' }}>{client.billingAddress || 'not yet added'}</span></Stat>
            </Sec>
            <Sec>
              <SecHead><h3>Agreements</h3><Meta>{Object.values(store.agreements ?? {}).filter(a => a.clientId === client.id).length}</Meta><span className="sp" /><Btn $sm disabled={disabled} onClick={() => p.openAgreement(null)}>All agreements</Btn></SecHead>
              {Object.values(store.agreements ?? {}).filter(a => a.clientId === client.id).map(a => (
                <Card key={a.id} role="button" tabIndex={0} onClick={() => p.openAgreement(a.id)} onKeyDown={event => { if (event.key === 'Enter') void p.openAgreement(a.id) }} style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 600 }}>{a.title}</div><Hint>{a.numberText ?? 'Draft'}</Hint></div>
                  <AgreementStatusChip status={a.status} />
                </Card>
              ))}
              {!Object.values(store.agreements ?? {}).some(a => a.clientId === client.id) ? <Meta>No agreements recorded. Record the MSA and SOWs you have signed so invoices are counted against them, or draft the next one in Agreements.</Meta> : null}
            </Sec>
            <Sec>
              <SecHead><h3>Documents</h3><Meta>{client.documents?.length ?? 0}</Meta><span className="sp" /><Meta>shown on every invoice to {client.name.split(' ')[0]}</Meta></SecHead>
              <DocumentsList documents={client.documents ?? []} disabled={disabled} empty="No agreements linked. Link the master services agreement, SOWs or purchase orders; the files stay where they are."
                onLink={kind => p.linkDocument({ clientId: client.id }, kind)} onOpen={doc => p.openDocument(doc.path, doc.name)} onUnlink={doc => p.unlinkDocument({ clientId: client.id }, doc.id)} />
            </Sec>
            <Sec style={{ flex: '1 1 auto' }}>
              <SecHead><h3>Invoices</h3><Meta>{invoices.length}</Meta><span className="sp" />{stats?.overdueCount ? <Pill $quiet onClick={() => p.updateArchive({ clientId: client.id, status: 'overdue', cursor: '0' })}>See overdue in the archive</Pill> : null}</SecHead>
              {invoices.length ? (
                <List style={{ fontSize: 12.5 }}>
                  <thead><tr><th>Number</th><th>Issued</th><th>Due</th><th className="num">Total</th><th>Status</th><th /></tr></thead>
                  <tbody>{invoices.map(row => (
                    <tr key={row.id} onClick={() => p.openInvoice(row.id)}>
                      <td><Mono style={{ color: row.status === 'draft' ? 'var(--d-muted)' : undefined }}>{row.status === 'draft' ? row.provisionalNumberText : row.numberText}</Mono></td>
                      <td>{row.status === 'draft' ? <Meta>—</Meta> : shortDate(row.invoiceDate)}</td>
                      <td style={{ color: row.mark === 'overdue' ? 'var(--d-bad-ink)' : undefined }}>{row.dueDate ? shortDate(row.dueDate) : <Meta>—</Meta>}</td>
                      <td className="num"><Mono>{formatMoney(row.total, row.currency)}</Mono></td>
                      <td>{row.status === 'draft' ? <Chip>Draft</Chip> : <StandingChip mark={row.mark as InvoiceMark} daysOverdue={row.daysOverdue} paidAt={row.marks?.paidAt} sentAt={row.marks?.sentAt} />}</td>
                      <td onClick={event => event.stopPropagation()}><Btn $sm onClick={() => p.openInvoice(row.id)}>{row.status === 'draft' ? 'Continue' : 'Open'}</Btn></td>
                    </tr>
                  ))}</tbody>
                </List>
              ) : <Meta>No invoices for this client yet.</Meta>}
            </Sec>
          </>
        ) : (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}><Meta>Clients are reusable billing details. Create one, or save a recipient from any draft.</Meta><Btn $acc disabled={disabled} onClick={d.create}><Icon.plus />New client</Btn></div>
        )}
      </Panel>
    </Body>
  )
}
