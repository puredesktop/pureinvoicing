import { useEffect, useRef, useState } from 'react'
import type { InvoiceProduct } from '../../../hooks/useInvoiceProduct'
import { agentRefs, proposalRefs, versionRefs } from '../../../lib/agentRefs'
import { COMMON_CURRENCIES, supportedCurrencies } from '../../../lib/invoices/defaults'
import { formatAmount, formatMoney } from '../../../lib/invoices/money'
import { unitPriceText } from '../../../lib/invoices/proposalHtml'
import { PROPOSAL_STATUS_LABEL, amountText, calculateProposal, conversionTarget, latestVersion, parseAmountInput } from '../../../lib/invoices/proposals'
import { invoiceCommands } from '../../../lib/invoices/workspace'
import type { Diagnostic, InvoiceStore, Proposal, ProposalContent, ProposalVersion } from '../../../lib/invoices/types'
import { Icon, shortDate } from '../bits'
import { Area, Body, Btn, Callout, Card, Field, Grid, Hint, IconBtn, Input, Kicker, Main, Meta, Mono, Panel, Sec, SecHead, Seg, SegBtn, Select, TopBar } from '../deskStyles'
import { ProposalStatusChip } from './ProposalsView'

/** The form holds what is typed; numbers stay text until they are saved, so "1." or "0,5" never fight the keyboard. */
type FormItem = { description: string; quantity: string; unitPrice: string }
type Form = Omit<ProposalContent, 'items' | 'paymentTermsDays'> & { items: FormItem[]; paymentTermsDays: string }
const toForm = (c: ProposalContent): Form => ({ ...c, items: c.items.map(i => ({ description: i.description, quantity: amountText(i.quantity), unitPrice: amountText(i.unitPrice) })), paymentTermsDays: amountText(c.paymentTermsDays) })
const amount = (text: string): number | null => { const r = parseAmountInput(text); return r.ok ? r.value : null }
/** Typed numbers that cannot be read without guessing, each with what to type instead. Nothing is saved while any remains. */
function numberIssues(f: Form): Diagnostic[] {
  const issues: Diagnostic[] = []
  f.items.forEach((item, index) => {
    for (const key of ['quantity', 'unitPrice'] as const) {
      const r = parseAmountInput(item[key])
      if (!r.ok) issues.push({ field: `items.${index}.${key}`, message: r.message })
    }
  })
  const days = parseAmountInput(f.paymentTermsDays)
  if (!days.ok || (days.value !== null && !(Number.isInteger(days.value) && days.value >= 0))) issues.push({ field: 'paymentTermsDays', message: 'Enter whole days, like 14.' })
  return issues
}
const fromForm = (f: Form): ProposalContent => {
  const days = amount(f.paymentTermsDays)
  return { ...f, items: f.items.map(i => ({ description: i.description, quantity: amount(i.quantity), unitPrice: amount(i.unitPrice) })), paymentTermsDays: days !== null && Number.isInteger(days) && days >= 0 ? days : null }
}

/**
 * Edits that could not be saved yet (an amount to correct, or typing not yet
 * saved), per proposal version, kept for this session. Leaving the page, by
 * its back button or another place in the app, never drops them: coming back
 * shows them again until they are saved or explicitly discarded.
 */
const pendingForms = new Map<string, Form>()
const pendingKey = (proposalId: string, versionId: string) => `${proposalId}:${versionId}`

export function ProposalPage({ product: p, store, proposal, disabled }: { product: InvoiceProduct; store: InvoiceStore; proposal: Proposal; disabled: boolean }): React.ReactElement {
  const latest = latestVersion(proposal)
  // A settled proposal opens on the accepted version; any later draft is kept for the record only.
  const settled = !!proposal.acceptedVersionId
  const [versionId, setVersionId] = useState(proposal.acceptedVersionId ?? latest.id)
  const version = proposal.versions.find(v => v.id === versionId) ?? latest
  // Follow a new version as soon as one appears (a revision started here or by the assistant).
  const latestSeen = useRef(latest.id)
  useEffect(() => { if (latestSeen.current !== latest.id) { latestSeen.current = latest.id; setVersionId(latest.id) } }, [latest.id])
  const editable = version.status === 'draft' && !settled
  const [form, setForm] = useState<Form>(() => (editable && pendingForms.get(pendingKey(proposal.id, version.id))) || toForm(version.content))
  const committed = useRef(JSON.stringify(version.content))
  const shownId = useRef(version.id)
  // Keep what is on screen for a version being left, unless it is what is saved.
  const latestState = useRef({ proposal, form, settled })
  latestState.current = { proposal, form, settled }
  const remember = (versionId: string) => {
    const { proposal: current, form: shownForm, settled: isSettled } = latestState.current
    const left = current.versions.find(v => v.id === versionId), key = pendingKey(current.id, versionId)
    if (left && left.status === 'draft' && !isSettled && JSON.stringify(shownForm) !== JSON.stringify(toForm(left.content))) pendingForms.set(key, shownForm)
    else pendingForms.delete(key)
  }
  useEffect(() => () => remember(shownId.current), [])
  // Take the saved version when nothing typed is waiting, or when another version is shown.
  useEffect(() => {
    const saved = JSON.stringify(version.content)
    if (shownId.current !== version.id) {
      remember(shownId.current)
      setForm((editable && pendingForms.get(pendingKey(proposal.id, version.id))) || toForm(version.content)); shownId.current = version.id
    } else if (JSON.stringify(fromForm(form)) === committed.current) setForm(toForm(version.content))
    committed.current = saved
  }, [version.id, version.revision])
  const discardPending = () => { pendingForms.delete(pendingKey(proposal.id, version.id)); setForm(toForm(version.content)) }
  const content = editable ? fromForm(form) : version.content
  const calculation = calculateProposal(content)
  const issues = editable ? numberIssues(form) : []
  const problem = (field: string) => editable ? (issues.find(d => d.field === field) ?? calculation.diagnostics.find(d => d.field === field))?.message : undefined
  /**
   * Save what is typed (the whole version: fields and the full item list).
   * The outcome says whether what is on screen is now what is saved:
   * 'blocked' when an amount cannot be read, 'failed' when the save failed.
   */
  const commit = async (current = form): Promise<'saved' | 'unchanged' | 'blocked' | 'failed'> => {
    if (!editable) return 'unchanged'
    if (numberIssues(current).length) return 'blocked'
    const next = fromForm(current), text = JSON.stringify(next)
    if (text === committed.current) return 'unchanged'
    const before = committed.current
    committed.current = text
    const { clientId: _clientId, ...changes } = next
    const result = await p.quietly(() => invoiceCommands.updateProposal({ proposalId: proposal.id, changes }))
    if (result === undefined) { committed.current = before; return 'failed' }
    return 'saved'
  }
  /** Before anything that reads the saved version: save what is on screen, or stop and keep it. */
  const saveFirst = async (doing: string) => {
    const outcome = await commit()
    if (outcome === 'blocked') throw new Error(`Fix the amounts marked in red before you ${doing}; your edits are kept on screen but are not saved yet.`)
    if (outcome === 'failed') throw new Error(`Your latest edits could not be saved, so nothing was done. They are kept on screen; try to ${doing} again.`)
  }
  const set = (patch: Partial<Form>) => setForm(current => ({ ...current, ...patch }))
  const setCustomer = (patch: Partial<Form['customer']>) => setForm(current => ({ ...current, customer: { ...current.customer, ...patch } }))
  const setItem = (index: number, patch: Partial<FormItem>) => setForm(current => ({ ...current, items: current.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }))
  const target = conversionTarget(store, proposal)
  const currencies = [...COMMON_CURRENCIES, ...(content.currency && !COMMON_CURRENCIES.includes(content.currency) ? [content.currency] : [])]
  const label = `${content.customer.name || 'New proposal'} · ${content.title || 'Untitled'}`
  const status = (next: 'offered' | 'accepted' | 'declined', words: string) => p.act(async () => { await saveFirst('change its status'); await invoiceCommands.setProposalStatus({ proposalId: proposal.id, versionId: version.id, status: next }) }, words)
  const revise = () => p.act(async () => { await invoiceCommands.updateProposal({ proposalId: proposal.id }) }, `Version ${latest.number + 1} started from version ${latest.number}. The offer stays as it was.`)
  const exportHtml = () => p.act(async () => { await saveFirst('export'); return invoiceCommands.exportProposal({ proposalId: proposal.id, versionId: version.id }) },
    result => { const r = result as { status: string; fileName: string; path?: string }; return r.status === 'cancelled' ? 'Export cancelled.' : `Saved ${r.fileName}${r.path ? ` · ${r.path}` : ''}. Nothing was sent.` })
  const convert = () => p.act(async () => {
    const r = await invoiceCommands.convertProposalToInvoice({ proposalId: proposal.id, versionId: version.id })
    await p.openDraft(r.invoiceId)
  }, `Invoice draft made from accepted version ${version.number}. It takes its number when you issue it.`)
  const copyClient = (clientId: string) => p.act(async () => { await saveFirst('copy a client'); await invoiceCommands.updateProposal({ proposalId: proposal.id, clientId }) }, `Customer copied from ${store.clients[clientId]?.name ?? 'the client'}. The client record is unchanged.`)
  const text = (key: 'title' | 'scope' | 'deliverables' | 'exclusions' | 'timing' | 'enquiry' | 'paymentTerms', name: string, placeholder: string, area = true) => (
    <Field><span>{name}</span>{area
      ? <Area value={form[key]} placeholder={placeholder} readOnly={!editable} onChange={event => set({ [key]: event.target.value })} onBlur={() => void commit()} />
      : <Input value={form[key]} placeholder={placeholder} readOnly={!editable} onChange={event => set({ [key]: event.target.value })} onBlur={() => void commit()} />}</Field>
  )
  const shown = editable ? form : toForm(version.content)
  return (
    <>
      <TopBar as="div" style={{ height: 48, borderTop: '1px solid var(--d-line)', background: 'transparent', backdropFilter: 'none' }}>
        <Btn $quiet $sm onClick={() => p.openProposal(null)}><Icon.back />Proposals</Btn>
        <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{content.title || 'Untitled proposal'}</span>
        <ProposalStatusChip status={version.status} />
        <span style={{ flex: 1 }} />
        {proposal.versions.length > 1 ? (
          <Seg role="tablist" aria-label="Versions">
            {proposal.versions.map(v => <SegBtn key={v.id} role="tab" aria-selected={v.id === version.id} $on={v.id === version.id} {...agentRefs(`Version ${v.number}`, versionRefs(v.id))} onClick={() => { if (v.id !== version.id) void p.act(async () => { await saveFirst('switch versions'); setVersionId(v.id) }) }}>v{v.number} · {PROPOSAL_STATUS_LABEL[v.status]}</SegBtn>)}
          </Seg>
        ) : null}
        <Btn $sm disabled={disabled} onClick={exportHtml}><Icon.download />Export HTML</Btn>
      </TopBar>
      <Body style={{ gap: 14 }} {...agentRefs(label, proposalRefs(proposal.id), '@open')}>
        <Main style={{ overflow: 'auto' }}>
          <Panel $strong>
            {!editable && version.status === 'draft' ? <Sec><Callout $tone="info"><Icon.info /><span><b>Version {version.number} was never offered.</b> Version {proposal.versions.find(v => v.id === proposal.acceptedVersionId)?.number} was accepted, so this proposal is settled and this draft is kept as it is.</span></Callout></Sec>
              : !editable ? <Sec><Callout $tone="info"><Icon.info /><span><b>Version {version.number} is {PROPOSAL_STATUS_LABEL[version.status].toLowerCase()}.</b> It stays exactly as {version.offeredAt ? `offered on ${shortDate(version.offeredAt)}` : 'it was'}. {version.id === latest.id && !proposal.acceptedVersionId ? 'Revising it starts the next version.' : ''}</span></Callout></Sec> : null}
            <Sec>
              <SecHead><h3>Enquiry</h3><span className="sp" /><Hint>Kept for your record; not printed on the offer</Hint></SecHead>
              <Grid $cols="160px 1fr">
                <Field><span>Received</span><Input type="date" value={form.enquiryDate ?? ''} readOnly={!editable} aria-invalid={!!problem('enquiryDate')} onChange={event => set({ enquiryDate: event.target.value || null })} onBlur={() => void commit()} /></Field>
                {text('enquiry', 'What they asked for', 'Who got in touch and what they need')}
              </Grid>
            </Sec>
            <Sec>
              <SecHead><h3>Customer</h3><span className="sp" />
                {editable && Object.keys(store.clients).length ? <Select style={{ width: 220, height: 28 }} value="" disabled={disabled} aria-label="Copy from client" onChange={event => { if (event.target.value) void copyClient(event.target.value) }}>
                  <option value="">Copy from client…</option>{Object.values(store.clients).sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select> : null}
              </SecHead>
              <Grid>
                <Field><span>Customer name</span><Input value={shown.customer.name} placeholder="Customer name" readOnly={!editable} aria-invalid={!!problem('customer.name')} onChange={event => setCustomer({ name: event.target.value })} onBlur={() => void commit()} /></Field>
                <Field><span>Contact</span><Input value={shown.customer.contactName ?? ''} placeholder="Person to address" readOnly={!editable} onChange={event => setCustomer({ contactName: event.target.value })} onBlur={() => void commit()} /></Field>
                <Field><span>Address</span><Area value={shown.customer.address} placeholder="Billing address" readOnly={!editable} onChange={event => setCustomer({ address: event.target.value })} onBlur={() => void commit()} /></Field>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Field><span>Email</span><Input value={shown.customer.email ?? ''} readOnly={!editable} onChange={event => setCustomer({ email: event.target.value })} onBlur={() => void commit()} /></Field>
                  <Grid><Field><span>Phone</span><Input value={shown.customer.phone ?? ''} readOnly={!editable} onChange={event => setCustomer({ phone: event.target.value })} onBlur={() => void commit()} /></Field>
                    <Field><span>Tax ID</span><Input value={shown.customer.taxIdentifier ?? ''} readOnly={!editable} onChange={event => setCustomer({ taxIdentifier: event.target.value })} onBlur={() => void commit()} /></Field></Grid>
                </div>
              </Grid>
              {problem('customer.name') ? <Hint $err>{problem('customer.name')}</Hint> : null}
            </Sec>
            <Sec>
              <SecHead><h3>The offer</h3></SecHead>
              {editable ? <>
                {text('title', 'Title', 'e.g. Website refresh', false)}
                {text('scope', 'Scope', 'The work you will do')}
                {text('deliverables', 'Deliverables', 'What they receive')}
                {text('exclusions', 'Not included', 'What the price does not cover')}
                {text('timing', 'Timing', 'When it starts and when it is delivered')}
              </> : <ReadOnlyOffer content={version.content} />}
            </Sec>
            <Sec>
              <SecHead><h3>Prices</h3><span className="sp" />
                <Field style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><span>Currency</span>
                  <Select style={{ width: 110, height: 28 }} value={content.currency ?? ''} disabled={!editable} aria-invalid={!!problem('currency')} onChange={event => { const currency = event.target.value || null; setForm(current => ({ ...current, currency })); void p.quietly(() => invoiceCommands.updateProposal({ proposalId: proposal.id, changes: { currency } })) }}>
                    <option value="">Choose</option>{currencies.filter(c => supportedCurrencies.includes(c)).map(code => <option key={code} value={code}>{code}</option>)}
                  </Select>
                </Field>
              </SecHead>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--d-faint)' }}><th style={{ padding: '4px 4px 8px' }}><Kicker>Item</Kicker></th><th style={{ width: 90, textAlign: 'right' }}><Kicker>Qty</Kicker></th><th style={{ width: 130, textAlign: 'right' }}><Kicker>Unit price</Kicker></th><th style={{ width: 130, textAlign: 'right' }}><Kicker>Amount</Kicker></th>{editable ? <th style={{ width: 36 }} /> : null}</tr></thead>
                <tbody>
                  {(editable ? form.items : toForm(version.content).items).map((item, index) => (
                    <tr key={index} style={{ borderTop: '1px solid var(--d-line)', verticalAlign: 'top' }}>
                      <td style={{ padding: '6px 4px' }}><Input value={item.description} placeholder="Item description" aria-label={`Item ${index + 1} description`} readOnly={!editable} aria-invalid={!!problem(`items.${index}.description`)} onChange={event => setItem(index, { description: event.target.value })} onBlur={() => void commit()} /></td>
                      <td style={{ padding: '6px 4px' }}><Input value={item.quantity} placeholder="Qty" inputMode="decimal" aria-label={`Item ${index + 1} quantity`} style={{ textAlign: 'right' }} readOnly={!editable} aria-invalid={!!problem(`items.${index}.quantity`)} onChange={event => setItem(index, { quantity: event.target.value })} onBlur={() => void commit()} /></td>
                      <td style={{ padding: '6px 4px' }}><Input value={item.unitPrice} placeholder="Unit price" inputMode="decimal" aria-label={`Item ${index + 1} unit price`} style={{ textAlign: 'right' }} readOnly={!editable} aria-invalid={!!problem(`items.${index}.unitPrice`)} onChange={event => setItem(index, { unitPrice: event.target.value })} onBlur={() => void commit()} /></td>
                      <td style={{ padding: '12px 4px', textAlign: 'right' }}><Mono>{calculation.lines[index]?.amount !== null && calculation.lines[index] ? formatAmount(calculation.lines[index].amount!, content.currency) : '—'}</Mono></td>
                      {editable ? <td style={{ padding: '6px 0' }}><IconBtn type="button" aria-label={`Remove item ${index + 1}`} title="Remove item" onClick={() => { const next = { ...form, items: form.items.filter((_, i) => i !== index) }; setForm(next); void commit(next) }}><Icon.x /></IconBtn></td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              {issues.length ? <Callout $tone="bad"><Icon.warn /><span><b>Not saved yet.</b> {issues.map(d => `${fieldName(d.field)}: ${d.message}`).join(' ')} Your other edits are kept until then.</span><span className="sp" /><Btn $sm $quiet onClick={discardPending}>Discard unsaved edits</Btn></Callout> : null}
              {editable ? <Btn $quiet $sm style={{ alignSelf: 'flex-start' }} onClick={() => setForm(current => ({ ...current, items: [...current.items, { description: '', quantity: '1', unitPrice: '' }] }))}><Icon.plus />Add item</Btn> : null}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 14, paddingTop: 6, borderTop: '1px solid var(--d-line)' }}>
                <span style={{ fontWeight: 600 }}>Total</span><Mono style={{ fontSize: 20, fontWeight: 600 }}>{content.currency ? formatMoney(calculation.total, content.currency) : calculation.total}</Mono>
              </div>
            </Sec>
            <Sec>
              <SecHead><h3>Payment terms</h3></SecHead>
              <Grid $cols="1fr 180px">
                {editable ? text('paymentTerms', 'Terms', 'e.g. 50% on acceptance, the rest on delivery') : <Field as="div"><span>Terms</span><div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{version.content.paymentTerms || <Meta>Not stated</Meta>}</div></Field>}
                <Field><span>Invoice due after (days)</span><Input value={shown.paymentTermsDays} inputMode="numeric" placeholder="e.g. 14" readOnly={!editable} aria-invalid={!!problem('paymentTermsDays')} onChange={event => set({ paymentTermsDays: event.target.value })} onBlur={() => void commit()} /></Field>
              </Grid>
            </Sec>
          </Panel>
        </Main>
        <aside style={{ width: 300, flex: '0 0 300px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
          <Card style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }} {...agentRefs(`Version ${version.number}`, versionRefs(version.id))}>
            <Kicker>Version {version.number} of {proposal.versions.length}</Kicker>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}><Meta>Total</Meta><Mono style={{ fontSize: 18, fontWeight: 600 }}>{content.currency ? formatMoney(calculation.total, content.currency) : calculation.total}</Mono></div>
            <Actions p={p} proposal={proposal} version={version} latest={latest} disabled={disabled} ready={calculation.complete && !issues.length} target={target}
              status={status} revise={revise} convert={convert} />
            {editable && (issues.length || calculation.diagnostics.length) ? <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><Kicker>Before it can be offered</Kicker>{[...issues, ...calculation.diagnostics.filter(d => !issues.some(i => i.field === d.field))].map(d => <Hint key={d.field}>{fieldName(d.field)}: {d.message}</Hint>)}</div> : null}
          </Card>
          <Card style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Kicker>History</Kicker>
            {[...proposal.history].reverse().map(entry => <div key={entry.id} style={{ fontSize: 12.5 }}><Meta style={{ display: 'block' }}>{shortDate(entry.at)}</Meta>{entry.note}</div>)}
          </Card>
        </aside>
      </Body>
    </>
  )
}

function fieldName(field: string): string {
  const item = /^items\.(\d+)\.(\w+)$/.exec(field)
  if (item) return `Item ${Number(item[1]) + 1} ${item[2] === 'unitPrice' ? 'price' : item[2]}`
  return ({ 'customer.name': 'Customer', currency: 'Currency', items: 'Prices', enquiryDate: 'Received', paymentTermsDays: 'Invoice due after' } as Record<string, string>)[field] ?? field
}

function ReadOnlyOffer({ content }: { content: ProposalContent }): React.ReactElement {
  const block = (name: string, value: string) => <Field as="div"><span>{name}</span><div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{value.trim() ? value : <Meta>Not stated</Meta>}</div></Field>
  return <>{block('Title', content.title)}{block('Scope', content.scope)}{block('Deliverables', content.deliverables)}{block('Not included', content.exclusions)}{block('Timing', content.timing)}</>
}

type Target = ReturnType<typeof conversionTarget>
function Actions({ p, proposal, version, latest, disabled, ready, target, status, revise, convert }: {
  p: InvoiceProduct; proposal: Proposal; version: ProposalVersion; latest: ProposalVersion; disabled: boolean; ready: boolean; target: Target
  status: (next: 'offered' | 'accepted' | 'declined', words: string) => void; revise: () => void; convert: () => void
}): React.ReactElement {
  const settled = !!proposal.acceptedVersionId
  if (version.status === 'draft' && settled) return <Hint>This draft was never offered. Version {proposal.versions.find(v => v.id === proposal.acceptedVersionId)?.number} was accepted, so nothing more is offered from this proposal.</Hint>
  if (version.status === 'draft') return <>
    <Btn $acc disabled={disabled || !ready} onClick={() => status('offered', `Version ${version.number} marked offered. Its content is now fixed.`)}><Icon.check />Mark as offered</Btn>
    <Hint>Record that you have sent or given this version to the customer. Nothing is sent from here.</Hint>
  </>
  if (version.status === 'offered') return <>
    {!settled ? <>
      <Meta>What did the customer decide about version {version.number}?</Meta>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn $acc style={{ flex: 1 }} disabled={disabled} onClick={() => status('accepted', `Version ${version.number} recorded as accepted.`)}><Icon.check />Accepted</Btn>
        <Btn style={{ flex: 1 }} disabled={disabled} onClick={() => status('declined', `Version ${version.number} recorded as declined.`)}>Declined</Btn>
      </div>
      {version.id === latest.id ? <Btn $quiet $sm disabled={disabled} onClick={revise}>Revise offer</Btn> : null}
    </> : <Hint>Version {proposal.versions.find(v => v.id === proposal.acceptedVersionId)?.number} was accepted.</Hint>}
  </>
  if (version.status === 'declined') return <>
    <Hint>Declined{version.decidedAt ? ` on ${shortDate(version.decidedAt)}` : ''}.</Hint>
    {version.id === latest.id && !settled ? <Btn disabled={disabled} onClick={revise}>Revise offer</Btn> : null}
  </>
  // Accepted: the one explicit step to an invoice.
  if (target && target.status !== 'missing') return <>
    <Callout $tone="ok"><Icon.check /><span>{target.status === 'issued' ? <>Invoiced as <b>{target.numberText}</b>.</> : <>An invoice draft was made from this version.</>}</span></Callout>
    <Btn disabled={disabled} onClick={() => p.openDraft(target.invoiceId)}>{target.status === 'issued' ? 'Open invoice' : 'Open invoice draft'}</Btn>
  </>
  return <>
    <Btn $acc disabled={disabled} onClick={convert}><Icon.plus />Create invoice draft</Btn>
    <Hint>{target?.status === 'missing' ? 'The earlier draft was discarded; this makes a new one. ' : ''}Copies the customer, items, prices, currency and payment terms of version {version.number}. The invoice is numbered only when you issue it.</Hint>
  </>
}
