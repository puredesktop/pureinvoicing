import { useState } from 'react'
import type { InvoiceProduct } from '../../../hooks/useInvoiceProduct'
import { KIND_LABEL, agreementRows, agreementTotals, periodLabel } from '../../../lib/invoices/agreements'
import type { AgreementStatus, InvoiceStore } from '../../../lib/invoices/types'
import { Icon, hueOf, initials, shortDate } from '../bits'
import { Avatar, Body, Btn, Card, Dot, Hint, Kicker, List, Main, Meta, Mono, Panel, Rail, RailRow, SearchBox } from '../deskStyles'
import { AgreementPage } from './AgreementPage'
import { AgreementStatusChip, STATUS_DOT, money } from './agreementBits'
import { NewAgreementSheet, type NewAgreementPreset } from './NewAgreementSheet'
import { MakeTemplateSheet, type MakeTemplatePreset } from './MakeTemplateSheet'
import { TemplateEditor, TemplatesLibrary } from './Templates'

type Place = 'all' | AgreementStatus | 'closed' | 'templates'
const PLACES: { id: Place; label: string; color?: string }[] = [
  { id: 'all', label: 'All agreements' }, { id: 'sent', label: 'Awaiting signature', color: STATUS_DOT.sent },
  { id: 'signed', label: 'Active', color: STATUS_DOT.signed }, { id: 'draft', label: 'Drafts', color: STATUS_DOT.draft }, { id: 'closed', label: 'Complete or ended', color: STATUS_DOT.complete },
]

/**
 * Agreements: what may be invoiced and what may be billed to us. Client
 * agreements show what has been invoiced against them and what is left;
 * the rail adds it up. One agreement opens in place.
 */
export function AgreementsView({ product: p, store, disabled }: { product: InvoiceProduct; store: InvoiceStore; disabled: boolean }): React.ReactElement {
  const [place, setPlace] = useState<Place>('all')
  const [who, setWho] = useState<'all' | 'client' | 'contractor'>('all')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState<NewAgreementPreset | null>(null)
  const [making, setMaking] = useState<MakeTemplatePreset | null>(null)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const selected = p.selectedAgreementId ? store.agreements?.[p.selectedAgreementId] : undefined
  if (selected) return <AgreementPage key={selected.id} product={p} store={store} agreement={selected} disabled={disabled} />
  const editingTemplate = templateId ? store.templates?.[templateId] : undefined
  const sheets = <>
    {creating ? <NewAgreementSheet product={p} store={store} preset={creating} disabled={disabled} onClose={() => setCreating(null)} /> : null}
    {making ? <MakeTemplateSheet product={p} store={store} preset={making} disabled={disabled} onClose={() => setMaking(null)} onMade={id => { setPlace('templates'); setTemplateId(id) }} /> : null}
  </>
  if (editingTemplate) return <><TemplateEditor key={editingTemplate.id} product={p} store={store} template={editingTemplate} disabled={disabled} onBack={() => setTemplateId(null)} onUse={t => setCreating({ templateId: t.id })} />{sheets}</>

  const rows = agreementRows(store)
  const needle = query.trim().toLocaleLowerCase()
  const inPlace = (status: AgreementStatus, id: Place) => id === 'all' || (id === 'closed' ? status === 'complete' || status === 'ended' : status === id)
  const visible = rows.filter(r => inPlace(r.status, place) && (who === 'all' || r.direction === who) && (!needle || [r.title, r.party, r.numberText ?? ''].some(v => v.toLocaleLowerCase().includes(needle))))
  const totals = agreementTotals(store)
  const groups = (['client', 'contractor'] as const).map(direction => ({ direction, rows: visible.filter(r => r.direction === direction) })).filter(g => g.rows.length)
  return (
    <Body style={{ gap: 14, padding: '14px 18px 18px' }}>
      <Rail aria-label="Agreement places">
        {PLACES.map(item => {
          const count = rows.filter(r => inPlace(r.status, item.id)).length
          return <RailRow key={item.id} $on={place === item.id} onClick={() => setPlace(item.id)}>{item.color ? <Dot $color={item.color} /> : null}<span className="name">{item.label}</span><small>{count}</small></RailRow>
        })}
        <div style={{ height: 1, background: 'var(--d-line)', margin: '8px 8px' }} />
        <RailRow $on={place === 'templates'} onClick={() => setPlace('templates')}><Icon.file /><span className="name">Templates</span><small>{Object.keys(store.templates ?? {}).length}</small></RailRow>
        <Kicker style={{ padding: '12px 8px 4px' }}>Who it is with</Kicker>
        <RailRow $on={who === 'client'} onClick={() => setWho(who === 'client' ? 'all' : 'client')}><span className="name">Clients · we do the work</span><small>{rows.filter(r => r.direction === 'client').length}</small></RailRow>
        <RailRow $on={who === 'contractor'} onClick={() => setWho(who === 'contractor' ? 'all' : 'contractor')}><span className="name">Contractors · they work for us</span><small>{rows.filter(r => r.direction === 'contractor').length}</small></RailRow>
        <Kicker style={{ padding: '12px 8px 4px' }}>Active and complete · {totals.currency}</Kicker>
        <div style={{ padding: '2px 8px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><Meta>Fixed fees agreed</Meta><Mono>{money(totals.agreed, totals.currency)}</Mono></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><Meta>Invoiced against them</Meta><Mono>{money(totals.invoiced, totals.currency)}</Mono></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><Meta>Still to bill</Meta><Mono style={{ color: Number(totals.toBill) > 0 ? 'var(--d-acc-ink, var(--d-acc))' : undefined, fontWeight: 600 }}>{money(totals.toBill, totals.currency)}</Mono></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><Meta>Billed by contractors</Meta><Mono>{money(totals.contractorBilled, totals.currency)}</Mono></div>
        </div>
        <span style={{ flex: 1 }} />
        <Card style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, margin: '8px 0 0' }}>
          <Kicker>Your wording</Kicker>
          <span style={{ fontSize: 12.5 }}>New agreements start from your templates: fields fill themselves, prompts are written each time.</span>
          <Hint>Make one from an agreement you are happy with. Have counsel review your templates once.</Hint>
        </Card>
      </Rail>
      {place === 'templates' ? <TemplatesLibrary product={p} store={store} disabled={disabled} onUse={t => setCreating({ templateId: t.id })} onEdit={setTemplateId} onMake={preset => setMaking(preset)} /> : <Main style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SearchBox style={{ width: 300 }}><Icon.search /><input aria-label="Search agreements" placeholder="Search party, number or title" value={query} onChange={event => setQuery(event.target.value)} /></SearchBox>
          <span style={{ flex: 1 }} />
          <Meta>{visible.length} agreement{visible.length === 1 ? '' : 's'}</Meta>
          <Btn $acc disabled={disabled} onClick={() => setCreating({})}><Icon.plus />Agreement</Btn>
        </div>
        <Panel $strong style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: '1 1 auto', overflow: 'auto' }}>
            {!rows.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '70px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>Agreements set what may be invoiced</div>
                <Meta style={{ maxWidth: 460 }}>Draft a statement of work for a client or an agreement with a contractor, or record the ones you have already signed so invoices can be counted against them.</Meta>
                <div style={{ display: 'flex', gap: 8 }}><Btn $acc disabled={disabled} onClick={() => setCreating({})}><Icon.plus />New agreement</Btn><Btn disabled={disabled} onClick={() => setCreating({ register: true })}>Record a signed one</Btn></div>
              </div>
            ) : !visible.length ? <Meta style={{ display: 'block', padding: 24 }}>Nothing here. Try another place or clear the search.</Meta> : (
              <List>
                <thead><tr><th style={{ width: 150 }}>Number</th><th>Agreement</th><th className="c-issued" style={{ width: 110 }}>Signed</th><th className="num" style={{ width: 120 }}>Value</th><th style={{ width: 210 }}>Billed against it</th><th style={{ width: 170 }}>Status</th></tr></thead>
                <tbody>
                  {groups.map(group => [
                    <tr key={`${group.direction}-head`} style={{ cursor: 'default' }}><td colSpan={6} style={{ background: 'var(--d-well)', padding: '9px 12px 6px' }}><Kicker>{group.direction === 'client' ? 'With clients · Pure Science does the work' : 'With contractors · they do work for Pure Science'}</Kicker></td></tr>,
                    ...group.rows.map(r => (
                      <tr key={r.id} onClick={() => p.openAgreement(r.id)}>
                        <td><Mono style={{ whiteSpace: 'nowrap', color: r.numberText ? undefined : 'var(--d-muted)' }}>{r.numberText ?? 'Draft'}</Mono><Hint style={{ display: 'block' }}>{KIND_LABEL[r.kind]}</Hint></td>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><Avatar $hue={hueOf(r.party || '?')}>{initials(r.party || '?')}</Avatar><div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.party || 'No party yet'}</div><Hint style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</Hint></div></div></td>
                        <td className="c-issued">{r.signedAt ? shortDate(r.signedAt) : <Meta>—</Meta>}</td>
                        <td className="num"><Mono>{r.value ? money(r.value, r.currency) : ''}</Mono>{r.valueNote ? <Hint>{r.value ? ` ${r.valueNote}` : r.valueNote}</Hint> : null}</td>
                        <td>{r.billing ? <BillingCell billing={r.billing} value={r.value} currency={r.currency} /> : <Meta>{r.direction === 'contractor' ? 'Their bills are kept on the agreement' : '—'}</Meta>}</td>
                        <td><AgreementStatusChip status={r.status} />{r.openNotes ? <Hint style={{ display: 'block', marginTop: 3 }}>{r.openNotes} open note{r.openNotes === 1 ? '' : 's'}</Hint> : null}</td>
                      </tr>
                    )),
                  ])}
                </tbody>
              </List>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderTop: '1px solid var(--d-line)' }}>
            <Meta>Agreements set what may be invoiced; invoices say what was. Milestones link the two.</Meta>
            <span style={{ flex: 1 }} />
            <Btn $quiet $sm disabled={disabled} onClick={() => setCreating({ register: true })}>Record a signed agreement</Btn>
          </div>
        </Panel>
      </Main>}
      {sheets}
    </Body>
  )
}

function BillingCell({ billing, value, currency }: { billing: NonNullable<ReturnType<typeof agreementRows>[number]['billing']>; value: string | null; currency: string }): React.ReactElement {
  const agreed = Number(value ?? 0), invoiced = Number(billing.invoiced)
  const share = billing.toBill !== null && agreed > 0 ? Math.min(1, invoiced / agreed) : null
  return (
    <div>
      {share !== null ? <div style={{ height: 6, borderRadius: 999, background: 'var(--d-line)', overflow: 'hidden' }}><div style={{ width: `${share * 100}%`, height: 6, background: 'var(--d-ok-ink)' }} /></div> : null}
      <Hint style={{ display: 'block', marginTop: share !== null ? 4 : 0 }}>
        {billing.labels.length ? <Mono>{billing.labels.slice(0, 2).join(', ')}{billing.labels.length > 2 ? ` +${billing.labels.length - 2}` : ''}</Mono> : 'Nothing invoiced yet'}
        {billing.toBill !== null ? (Number(billing.toBill) > 0 ? ` · ${money(billing.toBill, currency)} to bill` : billing.labels.length ? ' · fully billed' : '') : ''}
      </Hint>
      {billing.unbilledPeriods.length ? <Hint style={{ display: 'block', color: 'var(--d-acc-ink, var(--d-acc))', fontWeight: 600 }}>{periodLabel(billing.unbilledPeriods[billing.unbilledPeriods.length - 1])} not yet invoiced</Hint> : null}
    </div>
  )
}
