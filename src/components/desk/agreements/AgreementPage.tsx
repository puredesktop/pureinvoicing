import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { styled } from 'styled-components'
import type { InvoiceProduct } from '../../../hooks/useInvoiceProduct'
import { askDrawer, chooseDocumentFile } from '../../../bridge/platformBridge'
import { KIND_LABEL, TRIGGER_LABEL, periodLabel } from '../../../lib/invoices/agreements'
import { agreementDetails } from '../../../lib/invoices/agreementCommands'
import { localToday } from '../../../lib/invoices/defaults'
import { searchInvoices } from '../../../lib/invoices/queries'
import { invoiceCommands } from '../../../lib/invoices/workspace'
import type { Agreement, AgreementMilestone, InvoiceStore } from '../../../lib/invoices/types'
import { DocumentsList, NotesList } from '../Annotations'
import { Icon, scrollWithin, shortDate } from '../bits'
import { Body, Btn, Chip, Field, Input, Kicker, Meta, Mono, Panel, Scrim, Sec, SecHead, Select, Sheet, TopBar } from '../deskStyles'
import { AgreementStatusChip, money, parseAmount } from './agreementBits'
import { NewAgreementSheet, type NewAgreementPreset } from './NewAgreementSheet'
import { MakeTemplateSheet } from './MakeTemplateSheet'

type Details = ReturnType<typeof agreementDetails>

/**
 * One agreement. A draft is written here on the page as it will print; the
 * side panel holds its terms, the milestones that become invoices, and what
 * stands between it and sending. Once sent the text is fixed, and the page
 * becomes its working record: signatures, milestones due and invoiced, what
 * has been billed, bills from a contractor, documents and notes.
 */
export function AgreementPage({ product: p, store, agreement: a, disabled }: { product: InvoiceProduct; store: InvoiceStore; agreement: Agreement; disabled: boolean }): React.ReactElement {
  const d = agreementDetails(store, a.id)
  const draft = a.status === 'draft'
  const termsEditable = draft || !!a.registered
  const [signing, setSigning] = useState(false)
  const [creating, setCreating] = useState<NewAgreementPreset | null>(null)
  const [making, setMaking] = useState(false)
  const blocks = d.checks.filter(c => c.level === 'block')
  const partyOwner = a.clientId ? { clientId: a.clientId } : { contractorId: a.contractorId }
  const ask = (text: string, done = 'Handed to the assistant in the drawer.') => p.act(async () => { if (!(await askDrawer(text))) p.openAssistant() }, done)
  const about = `In PureInvoicing, ${KIND_LABEL[a.kind].toLowerCase()} ${a.id} ("${a.title}" with ${d.party || 'no party yet'}${d.parent ? `, under ${d.parent.title}` : ''})`
  const exportPdf = () => p.act(() => invoiceCommands.exportAgreementPdf({ agreementId: a.id }), r => (r as { status: string }).status === 'saved' ? 'Agreement PDF saved.' : undefined)
  return (
    <>
      <TopBar as="div" style={{ height: 48, borderTop: '1px solid var(--d-line)', background: 'transparent', backdropFilter: 'none' }}>
        <Btn $quiet $sm onClick={() => p.openAgreement(null)}><Icon.back />Agreements</Btn>
        <Mono style={{ fontSize: 14, color: a.numberText ? undefined : 'var(--d-muted)' }}>{a.numberText ?? 'Draft'}</Mono>
        <AgreementStatusChip status={a.status} />
        {a.registered ? <Chip $tone="info">Signed elsewhere</Chip> : null}
        <span style={{ flex: 1 }} />
        {a.sections.length ? <Btn $quiet $sm disabled={disabled} onClick={() => setMaking(true)} title="Keep this wording as a template, with its specifics turned into fields">Make a template</Btn> : null}
        {draft ? <>
          {!a.numberText ? <Btn $quiet $sm disabled={disabled} onClick={() => p.act(async () => { await invoiceCommands.discardAgreement({ agreementId: a.id }); await p.openAgreement(null) }, 'Draft discarded.')}>Discard</Btn> : null}
          
          <Btn $sm disabled={disabled} onClick={exportPdf}>Preview PDF</Btn>
          <Btn $sm disabled={disabled || blocks.length > 0} onClick={() => setSigning(true)} title="Signed on paper or elsewhere already">Signed already…</Btn>
          <Btn $acc disabled={disabled || blocks.length > 0} title={blocks.length ? blocks.map(b => b.message).join('\n') : undefined} onClick={() => p.act(async () => { await invoiceCommands.sendAgreement({ agreementId: a.id }); await invoiceCommands.exportAgreementPdf({ agreementId: a.id }) }, 'Numbered and marked sent. Send the PDF for signature, then record the signatures here.')}>Send for signature…</Btn>
        </> : a.status === 'sent' ? <>
          <Btn $sm disabled={disabled} onClick={() => p.act(() => invoiceCommands.withdrawAgreement({ agreementId: a.id }), 'Back to a draft; the number is kept.')}>Back to draft</Btn>
          <Btn $sm disabled={disabled} onClick={exportPdf}><Icon.download />PDF</Btn>
          <Btn $acc disabled={disabled} onClick={() => setSigning(true)}>Record signatures…</Btn>
        </> : <>
          {a.signedPdfPath ? <Btn $sm disabled={disabled} onClick={() => p.openDocument(a.signedPdfPath!, 'Signed agreement')}><Icon.file />Signed PDF</Btn> : null}
          {!a.registered ? <Btn $sm disabled={disabled} onClick={exportPdf}><Icon.download />PDF</Btn> : null}
          {a.status === 'signed' && a.kind !== 'nda' && a.kind !== 'change-order' ? <Btn $sm disabled={disabled} onClick={() => setCreating({ kind: 'change-order', parentId: a.id, direction: a.direction, clientId: a.clientId, contractorId: a.contractorId })}>Change order…</Btn> : null}
          {a.status === 'signed' ? <>
            <Btn $sm disabled={disabled} onClick={() => p.act(() => invoiceCommands.closeAgreement({ agreementId: a.id, how: 'ended' }), 'Marked ended.')}>End</Btn>
            <Btn $acc $sm disabled={disabled} onClick={() => p.act(() => invoiceCommands.closeAgreement({ agreementId: a.id, how: 'complete' }), 'Marked complete.')}><Icon.check />Complete</Btn>
          </> : <Btn $sm disabled={disabled} onClick={() => p.act(() => invoiceCommands.reopenAgreement({ agreementId: a.id }), 'Active again.')}>Reopen</Btn>}
        </>}
      </TopBar>
      <Body style={{ gap: 0 }}>
        <Outline aria-label="Sections">
          <Kicker style={{ padding: '0 8px 6px' }}>Sections</Kicker>
          {a.sections.map(section => {
            const block = d.checks.find(c => c.sectionId === section.id)
            const state = block?.level === 'block' ? 'todo' : !section.body.trim() ? 'empty' : 'done'
            return <a key={section.id} href={`#section-${section.id}`} onClick={event => { event.preventDefault(); scrollWithin(document.getElementById(`section-${section.id}`)) }}><span className={`mark ${state}`}>{state === 'done' ? <Icon.check /> : null}</span><span className="name">{section.heading || 'Untitled section'}</span></a>
          })}
          {draft ? <Btn $quiet $sm style={{ marginTop: 6, border: '1px dashed var(--d-line)' }} disabled={disabled} onClick={() => p.act(() => invoiceCommands.editAgreementSection({ agreementId: a.id, heading: 'New section', body: '' }))}><Icon.plus />Section</Btn> : null}
          {!a.sections.length && !draft ? <Meta style={{ padding: '0 8px' }}>{a.registered ? 'Signed elsewhere: its text is the signed file.' : 'No sections.'}</Meta> : null}
          <span style={{ flex: 1 }} />
          {d.parent ? <div className="card"><b>{d.parent.kind === 'msa' ? 'Under' : 'Amends'}</b><button type="button" onClick={() => p.openAgreement(d.parent!.id)}>{d.parent.title}{d.parent.numberText ? ` · ${d.parent.numberText}` : ''}</button></div> : null}
          {d.children.length ? <div className="card"><b>Under this one</b>{d.children.map(c => <button key={c.id} type="button" onClick={() => p.openAgreement(c.id)}>{c.title}{c.numberText ? ` · ${c.numberText}` : ''}</button>)}</div> : null}
        </Outline>
        <Desk>
          <Paper>
            <div className="letterhead"><span className="kind">{KIND_LABEL[a.kind]}</span><span style={{ flex: 1 }} /><Mono>{a.numberText ?? 'Draft'}</Mono></div>
            {draft ? <LiveInput className="title" aria-label="Title" value={a.title} disabled={disabled} onCommit={title => { if (title.trim() && title !== a.title) void p.act(() => invoiceCommands.updateAgreement({ agreementId: a.id, changes: { title } })) }} /> : <h1 className="title">{a.title}</h1>}
            <p className="between">Between <b>{store.business.name || 'Pure Science'}</b> and <b>{d.party || '[party]'}</b>{d.parent ? <>, {d.parent.kind === 'msa' ? 'under' : 'amending'} {d.parent.title}{d.parent.numberText ? ` (${d.parent.numberText})` : ''}</> : null}{(d.parent ? d.parent.numberText ? ')' : d.parent.title : d.party).endsWith('.') ? '' : '.'}</p>
            {a.registered && !a.sections.length ? (
              <div className="registered">
                <b>Signed elsewhere{a.signedAt ? ` on ${shortDate(a.signedAt)}` : ''}.</b> Its text is the signed document; this page keeps its terms, milestones and the invoices billed against it.
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {a.signedPdfPath ? <Btn $sm onClick={() => p.openDocument(a.signedPdfPath!, 'Signed agreement')}><Icon.file />Open the signed file</Btn> : null}
                  <Btn $sm disabled={disabled} onClick={() => p.linkDocument({ agreementId: a.id }, a.kind === 'contractor' ? 'contract' : a.kind === 'msa' ? 'contract' : 'sow')}><Icon.paperclip />Link a file…</Btn>
                </div>
              </div>
            ) : null}
            {a.sections.map((section, index) => (
              <section key={section.id} id={`section-${section.id}`} className={d.checks.some(c => c.sectionId === section.id && c.level === 'block') ? 'todo' : undefined}>
                <div className="head">
                  <span className="num">{index + 1}</span>
                  {draft ? <LiveInput className="heading" aria-label="Section heading" value={section.heading} disabled={disabled} onCommit={heading => { if (heading !== section.heading) void p.act(() => invoiceCommands.editAgreementSection({ agreementId: a.id, sectionId: section.id, heading })) }} /> : <h2 className="heading">{section.heading}</h2>}
                  {draft ? <span className="tools">
                    <button type="button" title="Ask the assistant to draft this section" aria-label={`Ask the assistant to draft ${section.heading}`} disabled={disabled} onClick={() => ask(`${about}: draft the section "${section.heading}" (sectionId ${section.id}) with editAgreementSection. Work from what you can read: the documents linked to ${d.party || 'the party'}${d.parent ? `, the ${d.parent.title}` : ''} and to this agreement. Keep [bracketed placeholders] for anything they do not say; never invent fees, dates or names. Tell me what you based it on.`)}><Icon.sparkle /></button>
                    <button type="button" title="Move up" aria-label="Move section up" disabled={disabled || index === 0} onClick={() => p.act(() => invoiceCommands.updateAgreement({ agreementId: a.id, changes: { sections: move(a.sections, index, -1) } }))}><Icon.up /></button>
                    <button type="button" title="Move down" aria-label="Move section down" disabled={disabled || index === a.sections.length - 1} onClick={() => p.act(() => invoiceCommands.updateAgreement({ agreementId: a.id, changes: { sections: move(a.sections, index, 1) } }))}><Icon.down /></button>
                    <button type="button" title="Remove section" aria-label={`Remove ${section.heading}`} disabled={disabled} onClick={() => p.act(() => invoiceCommands.editAgreementSection({ agreementId: a.id, sectionId: section.id, remove: true }), 'Section removed.')}><Icon.trash /></button>
                  </span> : null}
                </div>
                {draft ? <LiveArea aria-label={`${section.heading} text`} value={section.body} disabled={disabled} onCommit={body => { if (body !== section.body) void p.act(() => invoiceCommands.editAgreementSection({ agreementId: a.id, sectionId: section.id, body })) }} />
                  : <div className="prose">{section.body.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}</div>}
                {/fee|payment|milestone|invoic/i.test(section.heading) && a.milestones.some(m => m.trigger !== 'period') ? <ScheduleTable agreement={a} /> : null}
              </section>
            ))}
            <div className="signatures">
              {(['us', 'them'] as const).map(party => {
                const signed = a.signatures.find(s => s.party === party)
                return <div key={party}><Kicker>For {party === 'us' ? store.business.name || 'Pure Science' : d.party || 'the other party'}</Kicker><div className="line">{signed ? signed.name : ''}</div><Meta>{signed ? `Signed ${shortDate(signed.at)}` : 'Name, title, date'}</Meta></div>
              })}
            </div>
          </Paper>
        </Desk>
        <Panel $strong style={{ flex: '0 0 380px', overflow: 'auto', borderRadius: 0, borderWidth: '0 0 0 1px' }}>
          {draft ? <ChecksSection details={d} /> : null}
          <TermsSection p={p} a={a} d={d} store={store} editable={termsEditable} disabled={disabled} />
          {a.fee.kind === 'monthly' ? <RetainerSection p={p} a={a} d={d} disabled={disabled} /> : null}
          {(a.fee.kind !== 'monthly' && (termsEditable || a.milestones.length > 0)) || a.milestones.some(m => m.trigger !== 'period') ? <MilestonesSection p={p} a={a} editable={termsEditable} disabled={disabled} /> : null}
          {a.direction === 'client' && !draft ? <BilledSection p={p} a={a} d={d} store={store} disabled={disabled} /> : null}
          {a.direction === 'contractor' && (a.status === 'signed' || a.status === 'complete' || a.status === 'ended') ? <BillsSection p={p} a={a} d={d} disabled={disabled} /> : null}
          {draft ? (
            <Sec>
              <SecHead><h3>Hand it to the assistant</h3></SecHead>
              <Meta style={{ lineHeight: 1.45 }}>It works in the drawer from {d.party ? `${d.party}’s` : 'the'} documents and this agreement; each change lands here for you to read. The ✦ on a section drafts just that section.</Meta>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Btn $sm disabled={disabled} onClick={() => ask(`${about}: review this draft before it is sent. Read it with getAgreement. List gaps, vague scope with no limit, milestones without a clear trigger, and anything that contradicts ${d.parent ? `the ${d.parent.title}` : 'the rest of the agreement'}. Do not change it; suggest wording I can accept.`)}>Review before sending</Btn>
                {a.sections.some(s => /accept/i.test(s.heading)) ? <Btn $sm disabled={disabled} onClick={() => { const s = a.sections.find(x => /accept/i.test(x.heading))!; void ask(`${about}: write the "${s.heading}" section (sectionId ${s.id}) with editAgreementSection: who accepts each deliverable and milestone, within how many days, and what happens if nothing is said. Keep [placeholders] for names and numbers I have not given.`) }}>Write the acceptance section</Btn> : null}
                {d.parent ? <Btn $sm disabled={disabled} onClick={() => ask(`${about}: compare this draft with its parent agreement ${d.parent!.id} (${d.parent!.title}) and the documents linked to it. Report where they differ (payment days, IP, liability, termination) and which governs. Do not change anything.`)}>Compare with the {d.parent.kind === 'msa' ? 'MSA' : 'agreement'}</Btn> : null}
              </div>
            </Sec>
          ) : null}
          {!draft ? <SignaturesSection a={a} p={p} disabled={disabled} /> : null}
          <Sec>
            <SecHead><h3>Documents</h3><span className="sp" /><Meta>proposals, signed copies</Meta></SecHead>
            <DocumentsList documents={(a.documents ?? []).map(doc => ({ ...doc, from: 'invoice' as const }))} disabled={disabled} empty="Nothing linked. Link the proposal, the signed copy or anything this agreement refers to."
              onLink={kind => p.linkDocument({ agreementId: a.id }, kind)} onOpen={doc => p.openDocument(doc.path, doc.name)} onUnlink={doc => p.unlinkDocument({ agreementId: a.id }, doc.id)} />
            {partyOwner.clientId || partyOwner.contractorId ? <Meta>{d.party}’s own documents are on their {a.clientId ? 'client' : 'contractor'} page.</Meta> : null}
          </Sec>
          <Sec>
            <SecHead><h3>Notes</h3><span className="sp" /><Meta>never printed</Meta></SecHead>
            <NotesList notes={a.notes ?? []} disabled={disabled} onAdd={text => p.act(() => invoiceCommands.addAgreementNote({ agreementId: a.id, text }))} onUpdate={(noteId, change) => p.act(() => invoiceCommands.updateAgreementNote({ agreementId: a.id, noteId, ...change }))} />
          </Sec>
          <Sec>
            <SecHead><h3>History</h3></SecHead>
            {[...a.history].reverse().slice(0, 8).map(entry => <div key={entry.id} style={{ display: 'flex', gap: 10, fontSize: 12.5 }}><Meta style={{ flex: '0 0 64px' }}>{shortDate(entry.at.slice(0, 10))}</Meta><span>{entry.note}</span></div>)}
          </Sec>
        </Panel>
      </Body>
      {signing ? <SignDialog p={p} a={a} store={store} party={d.party} disabled={disabled} onClose={() => setSigning(false)} /> : null}
      {creating ? <NewAgreementSheet product={p} store={store} preset={creating} disabled={disabled} onClose={() => setCreating(null)} /> : null}
      {making ? <MakeTemplateSheet product={p} store={store} preset={{ agreementId: a.id }} disabled={disabled} onClose={() => setMaking(false)} onMade={() => undefined} /> : null}
    </>
  )
}

const move = <T,>(list: T[], index: number, by: number): T[] => { const next = [...list]; const [item] = next.splice(index, 1); next.splice(index + by, 0, item); return next }

function ChecksSection({ details: d }: { details: Details }): React.ReactElement {
  const color = { block: 'var(--d-warn-ink)', warn: 'var(--d-faint)', ok: 'var(--d-ok-ink)' }
  const ordered = [...d.checks].sort((x, y) => ['block', 'warn', 'ok'].indexOf(x.level) - ['block', 'warn', 'ok'].indexOf(y.level))
  return (
    <Sec>
      <SecHead><h3>Before it can be sent</h3><span className="sp" />{d.checks.some(c => c.level === 'block') ? null : <Chip $tone="ok">Ready</Chip>}</SecHead>
      {ordered.length ? ordered.map((check, i) => (
        <button key={i} type="button" onClick={() => check.sectionId && scrollWithin(document.getElementById(`section-${check.sectionId}`))} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', border: 0, background: 'none', padding: 0, textAlign: 'left', font: 'inherit', fontSize: 12.5, color: 'var(--d-ink)', cursor: check.sectionId ? 'pointer' : 'default' }}>
          <span style={{ width: 7, height: 7, marginTop: 6, borderRadius: 999, background: color[check.level], flex: '0 0 auto' }} /><span>{check.message}</span>
        </button>
      )) : <Meta>Nothing stands in the way.</Meta>}
    </Sec>
  )
}

function TermsSection({ p, a, d, store, editable, disabled }: { p: InvoiceProduct; a: Agreement; d: Details; store: InvoiceStore; editable: boolean; disabled: boolean }): React.ReactElement {
  const save = (changes: Parameters<typeof invoiceCommands.updateAgreement>[0]['changes']) => p.act(() => invoiceCommands.updateAgreement({ agreementId: a.id, changes }))
  const amountField = (label: string, key: 'amount' | 'rate' | 'cap', value: number | undefined) => (
    <Field><span>{label}</span><LiveInput value={value === undefined ? '' : String(value)} inputMode="decimal" placeholder={a.currency} disabled={disabled || !editable} onCommit={text => {
      const n = parseAmount(text)
      if (n !== undefined && Number.isNaN(n)) { p.act(async () => { throw new Error(`${label}: type a number, like 16000.`) }); return }
      if (n !== value) void save({ fee: { ...a.fee, [key]: n } })
    }} /></Field>
  )
  const parents = a.kind === 'sow' ? Object.values(store.agreements ?? {}).filter(x => x.kind === 'msa' && (x.clientId ?? x.contractorId) === (a.clientId ?? a.contractorId)) : []
  return (
    <Sec>
      <SecHead><h3>Terms</h3><span className="sp" />{!editable ? <Meta>fixed once sent</Meta> : null}</SecHead>
      <Field as="div"><span>{a.direction === 'client' ? 'Client' : 'Contractor'}</span><div style={{ fontSize: 13.5, fontWeight: 600 }}>{d.party || '—'}</div></Field>
      {a.kind === 'sow' && a.status === 'draft' ? <Field><span>Under</span><Select value={a.parentId ?? ''} disabled={disabled} onChange={event => void save({ parentId: event.target.value || null })}><option value="">No master agreement</option>{parents.map(x => <option key={x.id} value={x.id}>{x.title}{x.numberText ? ` · ${x.numberText}` : ''}</option>)}</Select></Field> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <Field><span>Fee</span><Select value={a.fee.kind} disabled={disabled || !editable} onChange={event => void save({ fee: { kind: event.target.value as Agreement['fee']['kind'], ...(a.fee.amount !== undefined ? { amount: a.fee.amount } : {}), ...(a.fee.rate !== undefined ? { rate: a.fee.rate } : {}), ...(a.fee.cap !== undefined ? { cap: a.fee.cap } : {}) } })}>
          <option value="fixed">Fixed fee</option><option value="monthly">Monthly retainer</option><option value="hourly">Hourly</option><option value="none">No fee (terms only)</option></Select></Field>
        <Field><span>Currency</span><LiveInput value={a.currency} disabled={disabled || !editable} onCommit={currency => { const c = currency.trim().toUpperCase(); if (c && c !== a.currency) void save({ currency: c }) }} /></Field>
        {a.fee.kind === 'fixed' ? amountField('Fixed fee', 'amount', a.fee.amount) : null}
        {a.fee.kind === 'monthly' ? amountField('A month', 'amount', a.fee.amount) : null}
        {a.fee.kind === 'hourly' ? <>{amountField('Hourly rate', 'rate', a.fee.rate)}{amountField('Monthly cap', 'cap', a.fee.cap)}</> : null}
        <Field><span>Payment days</span><LiveInput value={a.paymentDays === undefined ? '' : String(a.paymentDays)} inputMode="numeric" placeholder={d.parent?.paymentDays !== null && d.parent?.paymentDays !== undefined ? `as parent: ${d.parent.paymentDays}` : 'e.g. 30'} disabled={disabled || !editable}
          onCommit={text => { const n = text.trim() === '' ? null : Number(text); if (n !== null && (!Number.isInteger(n) || n < 0)) { p.act(async () => { throw new Error('Payment days: a whole number of days.') }); return } if ((n ?? undefined) !== a.paymentDays) void save({ paymentDays: n }) }} /></Field>
        <Field><span>Starts</span><Input type="date" value={a.startDate ?? ''} disabled={disabled || !editable} onChange={event => void save({ startDate: event.target.value || null })} /></Field>
        <Field><span>Ends</span><Input type="date" value={a.endDate ?? ''} disabled={disabled || !editable} onChange={event => void save({ endDate: event.target.value || null })} /></Field>
      </div>
    </Sec>
  )
}

function ScheduleTable({ agreement: a }: { agreement: Agreement }): React.ReactElement {
  const planned = a.milestones.filter(m => m.trigger !== 'period')
  return (
    <table className="schedule"><tbody>
      {planned.map((m, i) => <tr key={m.id}><td>{i + 1}. {m.label}</td><td className="when">{TRIGGER_LABEL[m.trigger]}</td><td className="n">{money(m.amount, a.currency)}</td></tr>)}
    </tbody></table>
  )
}

function MilestonesSection({ p, a, editable, disabled }: { p: InvoiceProduct; a: Agreement; editable: boolean; disabled: boolean }): React.ReactElement {
  const planned = a.milestones.filter(m => m.trigger !== 'period')
  const total = planned.reduce((sum, m) => sum + m.amount, 0)
  const commit = (next: { id?: string; label: string; amount: number; trigger: 'signature' | 'done' | 'acceptance' }[]) => p.act(() => invoiceCommands.updateAgreement({ agreementId: a.id, changes: { milestones: next } }))
  const current = () => planned.map(m => ({ id: m.id, label: m.label, amount: m.amount, trigger: m.trigger as 'signature' | 'done' | 'acceptance' }))
  const signed = a.status === 'signed' || a.status === 'complete'
  return (
    <Sec>
      <SecHead><h3>{a.direction === 'client' ? 'Milestones become invoices' : 'Milestones'}</h3><span className="sp" /><Mono style={{ fontSize: 12.5 }}>{money(total, a.currency)}</Mono></SecHead>
      {planned.map((m, index) => {
        const invoiced = !!m.invoiceId
        const due = !!m.doneAt && !invoiced
        return (
          <MilestoneRow key={m.id} className={invoiced ? 'invoiced' : due ? 'due' : undefined}>
            <span className="n">{index + 1}</span>
            <div className="body">
              {editable && !invoiced ? <LiveInput aria-label="Milestone" value={m.label} disabled={disabled} onCommit={label => { if (label.trim() && label !== m.label) void commit(current().map(x => x.id === m.id ? { ...x, label } : x)) }} /> : <div className="label">{m.label}</div>}
              <div className="meta">
                {editable && !invoiced ? <select aria-label="When it is invoiced" value={m.trigger} disabled={disabled} onChange={event => void commit(current().map(x => x.id === m.id ? { ...x, trigger: event.target.value as 'signature' } : x))}><option value="signature">On signature</option><option value="done">When marked done</option><option value="acceptance">On acceptance</option></select>
                  : <span>{invoiced ? 'Invoiced' : m.doneAt ? `Due since ${shortDate(m.doneAt)}` : TRIGGER_LABEL[m.trigger]}</span>}
              </div>
            </div>
            {editable && !invoiced ? <LiveInput className="amount" aria-label="Amount" value={String(m.amount)} inputMode="decimal" disabled={disabled} onCommit={text => { const n = parseAmount(text) ?? 0; if (!Number.isNaN(n) && n !== m.amount) void commit(current().map(x => x.id === m.id ? { ...x, amount: n } : x)) }} /> : <Mono className="amount-text">{money(m.amount, a.currency)}</Mono>}
            <div className="actions">
              {signed && !m.doneAt && m.trigger !== 'signature' ? <Btn $sm disabled={disabled} onClick={() => p.act(() => invoiceCommands.setMilestoneDone({ agreementId: a.id, milestoneId: m.id, done: true }), `${m.label}: ${m.trigger === 'acceptance' ? 'accepted' : 'done'}.`)}>{m.trigger === 'acceptance' ? 'Accepted' : 'Done'}</Btn> : null}
              {signed && due && a.direction === 'client' ? <Btn $acc $sm disabled={disabled} onClick={() => p.act(async () => { const r = await invoiceCommands.invoiceAgreementMilestone({ agreementId: a.id, milestoneId: m.id }); await p.openDraft(r.draftId) }, `Invoice drafted for ${m.label}; check it and issue.`)}>Invoice</Btn> : null}
              {invoiced ? <Btn $sm $quiet disabled={disabled} onClick={() => p.openDraft(m.invoiceId!)}>Open</Btn> : null}
              {editable && !invoiced ? <button type="button" className="rm" aria-label={`Remove ${m.label}`} disabled={disabled} onClick={() => void commit(current().filter(x => x.id !== m.id))}><Icon.x /></button> : null}
            </div>
          </MilestoneRow>
        )
      })}
      {editable ? <Btn $quiet $sm style={{ alignSelf: 'flex-start' }} disabled={disabled} onClick={() => void commit([...current(), { label: planned.length ? 'Next milestone' : 'On signature', amount: 0, trigger: planned.length ? 'done' : 'signature' }])}><Icon.plus />Milestone</Btn> : null}
      {!planned.length && !editable ? <Meta>No milestones.</Meta> : null}
    </Sec>
  )
}

function RetainerSection({ p, a, d, disabled }: { p: InvoiceProduct; a: Agreement; d: Details; disabled: boolean }): React.ReactElement {
  const months = a.milestones.filter(m => m.trigger === 'period').sort((x, y) => (y.period ?? '').localeCompare(x.period ?? ''))
  return (
    <Sec>
      <SecHead><h3>Monthly invoices</h3><span className="sp" /><Mono style={{ fontSize: 12.5 }}>{money(a.fee.amount, a.currency)}/mo</Mono></SecHead>
      {a.status !== 'signed' ? <Meta>{a.status === 'draft' || a.status === 'sent' ? 'Each month gets an invoice draft once the agreement is signed and has a start date.' : 'Closed.'}</Meta>
        : !a.startDate ? <Meta>Set the start date so the months can be counted.</Meta> : null}
      {d.unbilledPeriods.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{d.unbilledPeriods.map(period => <Btn key={period} $sm $acc={period === d.unbilledPeriods[d.unbilledPeriods.length - 1]} disabled={disabled} onClick={() => p.act(async () => { const r = await invoiceCommands.invoiceAgreementMonth({ agreementId: a.id, period }); await p.openDraft(r.draftId) }, `Invoice drafted for ${periodLabel(period)}.`)}>Invoice {periodLabel(period)}</Btn>)}</div> : a.status === 'signed' && a.startDate ? <Meta>Every month so far is invoiced.</Meta> : null}
      {months.map(m => <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><Icon.check /><span style={{ flex: 1 }}>{m.label}</span><Btn $sm $quiet onClick={() => p.openDraft(m.invoiceId!)}>Open invoice</Btn></div>)}
    </Sec>
  )
}

function BilledSection({ p, a, d, store, disabled }: { p: InvoiceProduct; a: Agreement; d: Details; store: InvoiceStore; disabled: boolean }): React.ReactElement {
  const billing = d.billing!
  const linked = new Set(billing.lines.map(l => l.invoiceId))
  const candidates = a.clientId ? searchInvoices(store, { clientId: a.clientId, limit: 100, sortBy: 'invoiceDate' }).items.filter(row => !linked.has(row.id)) : []
  const tone = { draft: 'neutral', issued: 'warn', paid: 'ok', missing: 'bad' } as const
  return (
    <Sec>
      <SecHead><h3>Invoiced against it</h3><span className="sp" /><Mono style={{ fontSize: 12.5 }}>{money(billing.invoiced, a.currency)}{billing.agreed ? ` of ${money(billing.agreed, a.currency)}` : ''}</Mono></SecHead>
      {billing.agreed ? <div style={{ height: 6, borderRadius: 999, background: 'var(--d-line)', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, Number(billing.invoiced) / Number(billing.agreed) * 100)}%`, height: 6, background: 'var(--d-ok-ink)' }} /></div> : null}
      {billing.lines.map(line => (
        <div key={line.invoiceId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
          <Mono style={{ flex: 1 }}>{line.label}</Mono><Chip $tone={tone[line.status]}>{line.status === 'issued' ? 'open' : line.status}</Chip><Mono>{money(line.total, a.currency)}</Mono>
          {line.status !== 'missing' ? <Btn $sm $quiet onClick={() => p.openDraft(line.invoiceId)}>Open</Btn> : null}
          {!line.milestoneId ? <button type="button" aria-label="Unlink" title="Stop counting it against this agreement" style={{ border: 0, background: 'none', color: 'var(--d-faint)', cursor: 'pointer' }} disabled={disabled} onClick={() => p.act(() => invoiceCommands.linkInvoiceToAgreement({ agreementId: a.id, invoiceId: line.invoiceId, link: false }))}><Icon.x /></button> : null}
        </div>
      ))}
      {billing.toBill !== null ? <Meta>{Number(billing.toBill) > 0 ? `${money(billing.toBill, a.currency)} still to bill.` : 'Fully billed.'}</Meta> : null}
      {candidates.length ? <Select aria-label="Count an existing invoice against this agreement" value="" disabled={disabled} onChange={event => { const id = event.target.value; if (id) void p.act(() => invoiceCommands.linkInvoiceToAgreement({ agreementId: a.id, invoiceId: id }), 'Invoice counted against this agreement.') }}>
        <option value="">Count an existing invoice against it…</option>
        {candidates.map(row => <option key={row.id} value={row.id}>{row.status === 'draft' ? 'Draft' : row.numberText} · {row.invoiceDate ?? ''} · {money(row.total, row.currency ?? a.currency)}</option>)}
      </Select> : null}
    </Sec>
  )
}

function BillsSection({ p, a, d, disabled }: { p: InvoiceProduct; a: Agreement; d: Details; disabled: boolean }): React.ReactElement {
  const [form, setForm] = useState<{ reference: string; period: string; hours: string; amount: string; path?: string } | null>(null)
  const thisMonth = localToday().slice(0, 7)
  const submit = () => {
    if (!form) return
    const amount = parseAmount(form.amount), hours = parseAmount(form.hours)
    void p.act(async () => {
      if (amount === undefined || Number.isNaN(amount)) throw new Error('Amount: type the bill’s total, like 4000.')
      if (hours !== undefined && Number.isNaN(hours)) throw new Error('Hours: a number, or leave it empty.')
      await invoiceCommands.addContractorBill({ agreementId: a.id, reference: form.reference, period: form.period, amount, ...(hours !== undefined ? { hours } : {}), ...(form.path ? { path: form.path } : {}) })
      setForm(null)
    }, 'Bill recorded.')
  }
  const unpaid = d.bills.filter(b => !b.paidAt).reduce((sum, b) => sum + b.amount, 0)
  return (
    <Sec>
      <SecHead><h3>Their bills</h3><span className="sp" />{unpaid ? <Mono style={{ fontSize: 12.5 }}>{money(unpaid, a.currency)} unpaid</Mono> : null}</SecHead>
      {d.bills.map(b => (
        <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 10, background: 'var(--d-paper)', border: '1px solid var(--d-line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><Mono style={{ fontWeight: 600 }}>{b.reference}</Mono><Meta>{periodLabel(b.period)}{b.hours !== undefined ? ` · ${b.hours} h` : ''}</Meta><span style={{ flex: 1 }} /><Mono>{money(b.amount, a.currency)}</Mono></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Chip $tone={b.check.level === 'ok' ? 'ok' : 'warn'}>{b.check.message}</Chip>
            {b.check.level === 'warn' && /cap/i.test(b.check.message) ? <Btn $sm $quiet disabled={disabled} onClick={() => p.act(() => invoiceCommands.updateContractorBill({ agreementId: a.id, billId: b.id, approvedOverCap: true }), 'Approved over the cap.')}>Approve anyway</Btn> : null}
            <span style={{ flex: 1 }} />
            {b.path ? <Btn $sm $quiet onClick={() => p.openDocument(b.path!, b.reference)}><Icon.file /></Btn> : null}
            {b.paidAt ? <Meta>Paid {shortDate(b.paidAt)}</Meta> : <Btn $sm disabled={disabled} onClick={() => p.act(() => invoiceCommands.updateContractorBill({ agreementId: a.id, billId: b.id, paidAt: localToday() }), `${b.reference} marked paid today; change the date on the bill if it was another day.`)}>Mark paid</Btn>}
          </div>
        </div>
      ))}
      {form ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10, background: 'var(--d-well)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <Field><span>Their number</span><Input value={form.reference} onChange={event => setForm({ ...form, reference: event.target.value })} placeholder="INV-0008" /></Field>
            <Field><span>Month billed</span><Input type="month" value={form.period} onChange={event => setForm({ ...form, period: event.target.value })} /></Field>
            <Field><span>Hours</span><Input inputMode="decimal" value={form.hours} onChange={event => setForm({ ...form, hours: event.target.value })} placeholder="optional" /></Field>
            <Field><span>Amount</span><Input inputMode="decimal" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} placeholder={a.currency} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Btn $sm $quiet disabled={disabled} onClick={() => void chooseDocumentFile().then(path => { if (path) setForm(f => f && { ...f, path }) }).catch(() => undefined)}><Icon.paperclip />{form.path ? form.path.split('/').pop() : 'Link their PDF'}</Btn>
            <span style={{ flex: 1 }} />
            <Btn $sm $quiet onClick={() => setForm(null)}>Cancel</Btn>
            <Btn $sm $acc disabled={disabled || !form.reference.trim() || !form.amount.trim()} onClick={submit}>Record bill</Btn>
          </div>
        </div>
      ) : <Btn $sm style={{ alignSelf: 'flex-start' }} disabled={disabled} onClick={() => setForm({ reference: '', period: thisMonth, hours: '', amount: '' })}><Icon.plus />A bill they sent</Btn>}
      {a.fee.kind === 'hourly' ? <Meta>Checked against {money(a.fee.rate, a.currency)} an hour{a.fee.cap ? ` and a ${money(a.fee.cap, a.currency)} monthly cap` : ''}.</Meta> : null}
    </Sec>
  )
}

function SignaturesSection({ a, p, disabled }: { a: Agreement; p: InvoiceProduct; disabled: boolean }): React.ReactElement {
  return (
    <Sec>
      <SecHead><h3>Signatures</h3><span className="sp" />{a.signedAt ? <Meta>signed {shortDate(a.signedAt)}</Meta> : a.sentAt ? <Meta>sent {shortDate(a.sentAt.slice(0, 10))}</Meta> : null}</SecHead>
      {a.signatures.length ? a.signatures.map(s => <div key={s.party} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{s.name}</span><Meta>{shortDate(s.at)}</Meta></div>) : <Meta>{a.status === 'sent' ? 'Waiting for signatures. Record them when both have signed.' : a.registered ? 'Signed elsewhere.' : 'None recorded.'}</Meta>}
      {a.signedPdfPath ? <Btn $sm style={{ alignSelf: 'flex-start' }} onClick={() => p.openDocument(a.signedPdfPath!, 'Signed agreement')}><Icon.file />{a.signedPdfPath.split('/').pop()}</Btn>
        : a.status !== 'sent' ? <Btn $sm $quiet style={{ alignSelf: 'flex-start' }} disabled={disabled} onClick={() => p.linkDocument({ agreementId: a.id }, 'contract')}><Icon.paperclip />Link the signed copy…</Btn> : null}
    </Sec>
  )
}

function SignDialog({ p, a, store, party, disabled, onClose }: { p: InvoiceProduct; a: Agreement; store: InvoiceStore; party: string; disabled: boolean; onClose: () => void }): React.ReactElement {
  const them = a.clientId ? store.clients[a.clientId]?.contactName : a.contractorId ? store.contractors?.[a.contractorId]?.contactName ?? store.contractors?.[a.contractorId]?.name : ''
  const [ours, setOurs] = useState({ name: store.business.contactName ?? '', at: localToday() })
  const [theirs, setTheirs] = useState({ name: them ?? '', at: localToday() })
  const [path, setPath] = useState<string | null>(null)
  const ok = ours.name.trim() && theirs.name.trim() && ours.at && theirs.at && ours.at <= localToday() && theirs.at <= localToday()
  const dueOnSignature = a.milestones.filter(m => m.trigger === 'signature')
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <Scrim onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <Sheet role="dialog" aria-label="Record signatures" style={{ width: 'min(520px, 100%)' }}>
        <form onSubmit={event => { event.preventDefault(); if (!ok) return; void p.act(() => invoiceCommands.markAgreementSigned({ agreementId: a.id, ours, theirs, ...(path ? { signedPdfPath: path } : {}) }), 'Signed. The agreement is active.'); onClose() }}>
          <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--d-line)' }}><Kicker>Record signatures</Kicker><div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{a.title}</div><Meta>{a.numberText ?? 'Numbered when recorded'} · with {party}</Meta></div>
          <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {([['For ' + (store.business.name || 'Pure Science'), ours, setOurs], ['For ' + party, theirs, setTheirs]] as const).map(([label, value, set]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 10 }}>
                <Field><span>{label}: who signed</span><Input value={value.name} onChange={event => set({ ...value, name: event.target.value })} /></Field>
                <Field><span>On</span><Input type="date" max={localToday()} value={value.at} onChange={event => set({ ...value, at: event.target.value })} /></Field>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Btn type="button" $sm disabled={disabled} onClick={() => void chooseDocumentFile().then(chosen => { if (chosen) setPath(chosen) }).catch(() => undefined)}><Icon.paperclip />{path ? 'Another file…' : 'Link the signed PDF…'}</Btn>
              <Meta style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path ? path.split('/').pop() : 'optional; linked, not copied'}</Meta>
            </div>
            {dueOnSignature.length && a.direction === 'client' ? <Meta>{dueOnSignature.map(m => m.label).join(', ')} becomes due: invoice it from the milestones.</Meta> : null}
          </div>
          <div style={{ display: 'flex', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--d-line)' }}><span style={{ flex: 1 }} /><Btn type="button" $quiet onClick={onClose}>Cancel</Btn><Btn type="submit" $acc disabled={disabled || !ok}><Icon.check />Record signatures</Btn></div>
        </form>
      </Sheet>
    </Scrim>
  )
}

/** A text field that keeps its own value while focused and commits on blur or Enter; outside changes show when it is not being edited. */
function LiveInput({ value, onCommit, className, ...rest }: { value: string; onCommit: (value: string) => void; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>): React.ReactElement {
  const [local, setLocal] = useState<string | null>(null)
  return <input {...rest} className={className} value={local ?? value} onFocus={() => setLocal(value)} onChange={event => setLocal(event.target.value)}
    onBlur={() => { if (local !== null) onCommit(local); setLocal(null) }} onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); if (event.key === 'Escape') { setLocal(null); (event.target as HTMLInputElement).blur() } }} style={{ ...(rest.style ?? {}) }} data-live />
}
function LiveArea({ value, onCommit, ...rest }: { value: string; onCommit: (value: string) => void } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>): React.ReactElement {
  const [local, setLocal] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const shown = local ?? value
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px` } }, [shown])
  return <textarea {...rest} ref={ref} rows={2} value={shown} placeholder="Write this section…" onFocus={() => setLocal(value)} onChange={event => setLocal(event.target.value)} onBlur={() => { if (local !== null) onCommit(local); setLocal(null) }} />
}

const Outline = styled.nav`
  flex: 0 0 228px; display: flex; flex-direction: column; gap: 1px; padding: 14px 10px; border-right: 1px solid var(--d-line); overflow: auto; min-height: 0;
  a { display: flex; align-items: center; gap: 9px; padding: 6px 8px; border-radius: 8px; color: var(--d-ink); text-decoration: none; font-size: 13px; }
  a:hover { background: var(--d-well); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mark { flex: 0 0 14px; width: 14px; height: 14px; border-radius: 999px; box-sizing: border-box; border: 2px solid var(--d-line); display: grid; place-items: center; color: var(--d-paper); }
  .mark.todo { border-color: var(--d-warn-ink); } .mark.done { background: var(--d-ok-ink); border-color: var(--d-ok-ink); }
  .mark svg { width: 8px; height: 8px; }
  .card { margin-top: 8px; padding: 10px; border-radius: 10px; background: var(--d-paper); border: 1px solid var(--d-line); display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
  .card button { border: 0; background: none; padding: 0; text-align: left; font: inherit; color: var(--d-acc-ink, var(--d-acc)); cursor: pointer; }
`
const Desk = styled.main`
  flex: 1 1 auto; min-width: 0; min-height: 0; overflow: auto; padding: 22px 26px 60px; display: flex; justify-content: center;
`
const Paper = styled.article`
  width: min(700px, 100%); height: max-content; box-sizing: border-box; padding: 40px 54px 48px; background: #fff; color: #1c242c; border-radius: 4px;
  box-shadow: 0 2px 10px rgba(22, 32, 42, 0.1), 0 0 0 1px rgba(22, 32, 42, 0.05);
  font-family: 'Newsreader Variable', 'Source Serif 4', Georgia, serif; font-size: 14px; line-height: 1.6; display: flex; flex-direction: column; gap: 10px;
  .letterhead { display: flex; align-items: baseline; gap: 10px; padding-bottom: 10px; border-bottom: 2px solid var(--d-acc); font-family: var(--d-mono); font-size: 11px; color: #5f6b76; }
  .kind { letter-spacing: .14em; text-transform: uppercase; }
  .title { margin: 10px 0 0; font-family: inherit; font-size: 26px; font-weight: 600; line-height: 1.2; border: 0; padding: 2px 0; background: none; color: inherit; width: 100%; outline: none; border-radius: 4px; }
  input.title:focus, input.heading:focus { box-shadow: 0 0 0 2px var(--d-acc-soft); }
  .between { margin: 0 0 8px; color: #3b4a57; font-size: 13.5px; }
  .registered { padding: 14px 16px; border-radius: 10px; background: #f3f6f8; font-family: var(--d-ui, inherit); font-size: 13px; }
  section { display: flex; flex-direction: column; gap: 4px; padding: 6px 10px 8px; margin: 0 -10px; border-radius: 8px; scroll-margin-top: 20px; }
  section.todo { background: #fdf7e8; }
  .head { display: flex; align-items: center; gap: 8px; }
  .num { flex: 0 0 auto; min-width: 20px; font-family: var(--d-mono); font-size: 11px; color: var(--d-acc-ink, var(--d-acc)); }
  .heading { flex: 1; min-width: 0; margin: 0; font-family: inherit; font-size: 16px; font-weight: 600; border: 0; background: none; color: inherit; padding: 2px 0; outline: none; border-radius: 4px; }
  .tools { display: flex; gap: 2px; opacity: 0; transition: opacity .12s; }
  section:hover .tools, section:focus-within .tools { opacity: 1; }
  .tools button { border: 0; background: none; color: #8a949e; padding: 4px; border-radius: 6px; cursor: pointer; display: grid; place-items: center; }
  .tools button:hover:not(:disabled) { background: #eef2f4; color: #16202a; }
  .tools svg { width: 14px; height: 14px; }
  textarea { width: 100%; box-sizing: border-box; resize: none; border: 1px solid transparent; border-radius: 6px; padding: 4px 6px; margin: 0 -6px; font: inherit; color: inherit; background: none; line-height: 1.6; overflow: hidden; }
  textarea:hover { border-color: #e3e8ec; } textarea:focus { outline: none; border-color: var(--d-acc); box-shadow: 0 0 0 3px var(--d-acc-soft); background: #fff; }
  .prose p { margin: 0 0 8px; white-space: pre-wrap; }
  table.schedule { width: 100%; border-collapse: collapse; font-size: 13px; margin: 6px 0 2px; }
  .schedule td { padding: 5px 0; border-bottom: 1px solid #e3e8ec; } .schedule .when { color: #5f6b76; font-size: 12px; } .schedule .n { text-align: right; font-family: var(--d-mono); }
  .signatures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; margin-top: 24px; font-family: var(--d-ui, inherit); }
  .signatures .line { height: 34px; border-bottom: 1px solid #16202a; margin: 6px 0 4px; display: flex; align-items: flex-end; font-size: 13px; padding-bottom: 3px; }
`
const MilestoneRow = styled.div`
  display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border-radius: 10px; background: var(--d-paper); border: 1px solid var(--d-line);
  &.due { border-color: var(--d-acc); box-shadow: 0 0 0 2px var(--d-acc-soft); } &.invoiced { opacity: .8; }
  .n { font-family: var(--d-mono); font-size: 11px; color: var(--d-faint); padding-top: 5px; }
  .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .body input, .amount { border: 1px solid transparent; border-radius: 6px; background: none; font: inherit; font-size: 13px; color: var(--d-ink); padding: 2px 4px; margin-left: -4px; min-width: 0; }
  .body input:hover, .amount:hover { border-color: var(--d-line); } .body input:focus, .amount:focus { outline: none; border-color: var(--d-acc); }
  .label { font-size: 13px; }
  .meta { font-size: 11.5px; color: var(--d-muted); } .meta select { border: 0; background: none; font: inherit; color: var(--d-muted); padding: 0; margin-left: -2px; cursor: pointer; }
  .amount { width: 86px; text-align: right; font-family: var(--d-mono); } .amount-text { font-size: 12.5px; padding-top: 3px; }
  .actions { display: flex; align-items: center; gap: 4px; }
  .rm { border: 0; background: none; color: var(--d-faint); padding: 4px; cursor: pointer; border-radius: 6px; } .rm svg { width: 12px; height: 12px; }
`
