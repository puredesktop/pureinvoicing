import { useEffect, useState } from 'react'
import type { InvoiceProduct } from '../../../hooks/useInvoiceProduct'
import { askDrawer, chooseDocumentFile } from '../../../bridge/platformBridge'
import { KINDS_FOR, KIND_LABEL, nextAgreementNumber } from '../../../lib/invoices/agreements'
import { feeShape, previewTemplate, templateProblems, templatesFor } from '../../../lib/invoices/templates'
import { localToday } from '../../../lib/invoices/defaults'
import { invoiceCommands } from '../../../lib/invoices/workspace'
import type { AgreementDirection, AgreementKind, InvoiceStore } from '../../../lib/invoices/types'
import { Icon } from '../bits'
import { Btn, Field, Input, Kicker, Meta, Mono, Scrim, Select, Sheet } from '../deskStyles'

export interface NewAgreementPreset { direction?: AgreementDirection; kind?: AgreementKind; clientId?: string; contractorId?: string; parentId?: string; register?: boolean; templateId?: string }

const KIND_NOTE: Record<AgreementKind, string> = {
  msa: 'Standing terms every SOW sits under: IP, confidentiality, liability, payment days.',
  sow: 'One project: scope, deliverables, milestones and fee.',
  'change-order': 'Amends a signed agreement: what changes, the new fee and dates.',
  nda: 'Before either side shares confidential material.',
  contractor: 'Rate, cap, work product and confidentiality for someone working for you.',
}
type Start = 'tpl' | 'skeleton' | 'copy' | 'file' | 'register'

/** Who does the work, what kind of agreement, with whom, and what it starts from. Nothing is numbered until it is sent. */
export function NewAgreementSheet({ product: p, store, preset, disabled, onClose }: { product: InvoiceProduct; store: InvoiceStore; preset: NewAgreementPreset; disabled: boolean; onClose: () => void }): React.ReactElement {
  const presetTemplate = preset.templateId ? store.templates?.[preset.templateId] : undefined
  const [direction, setDirection] = useState<AgreementDirection>(presetTemplate?.direction ?? preset.direction ?? (preset.contractorId ? 'contractor' : 'client'))
  const [kind, setKind] = useState<AgreementKind>(presetTemplate?.kind ?? preset.kind ?? (direction === 'contractor' ? 'contractor' : 'sow'))
  const clients = Object.values(store.clients).sort((a, b) => a.name.localeCompare(b.name))
  const contractors = Object.values(store.contractors ?? {}).sort((a, b) => a.name.localeCompare(b.name))
  const [clientId, setClientId] = useState(preset.clientId ?? clients[0]?.id ?? '')
  const [contractorId, setContractorId] = useState(preset.contractorId ?? contractors[0]?.id ?? '')
  const [newContractor, setNewContractor] = useState('')
  const party = direction === 'client' ? { clientId } : { contractorId }
  const partyId = direction === 'client' ? clientId : contractorId
  const theirs = Object.values(store.agreements ?? {}).filter(a => (direction === 'client' ? a.clientId === clientId : a.contractorId === contractorId))
  const parents = kind === 'sow' ? theirs.filter(a => a.kind === 'msa') : kind === 'change-order' ? theirs.filter(a => a.status !== 'draft' && a.kind !== 'change-order' && a.kind !== 'nda') : []
  const [parentId, setParentId] = useState(preset.parentId ?? '')
  const copies = Object.values(store.agreements ?? {}).filter(a => a.kind === kind && a.sections.length)
  const offered = templatesFor(store, kind, direction)
  const [start, setStart] = useState<Start>(preset.register ? 'register' : offered.length ? 'tpl' : 'skeleton')
  const [templateId, setTemplateId] = useState(presetTemplate?.id ?? offered[0]?.id ?? '')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const template = start === 'tpl' ? offered.find(t => t.id === templateId) : undefined
  const [copyId, setCopyId] = useState('')
  const [file, setFile] = useState<string | null>(null)
  const [numberText, setNumberText] = useState('')
  const [signedAt, setSignedAt] = useState(localToday())
  useEffect(() => { if (!KINDS_FOR[direction].includes(kind)) setKind(direction === 'contractor' ? 'contractor' : 'sow') }, [direction])
  useEffect(() => { if (parentId && !parents.some(a => a.id === parentId)) setParentId(kind === 'change-order' || kind === 'sow' ? parents[0]?.id ?? '' : '') }, [kind, partyId])
  useEffect(() => { if (!parentId && parents.length) setParentId(parents[0].id) }, [parents.length])
  useEffect(() => { if (start === 'copy') setCopyId(copies[0]?.id ?? '') }, [kind, start])
  // Changing the kind or who it is with offers that pair's templates, the default first.
  useEffect(() => {
    if (preset.register) return
    if (!offered.some(t => t.id === templateId)) setTemplateId(offered[0]?.id ?? '')
    if (offered.length && (start === 'skeleton' || start === 'tpl')) setStart('tpl')
    if (!offered.length && start === 'tpl') setStart('skeleton')
  }, [kind, direction])
  useEffect(() => { setAnswers(Object.fromEntries((template?.fields ?? []).filter(f => f.source === 'ask' && f.default).map(f => [f.key, f.default!]))) }, [template?.id])
  const use = { ...party, ...(parentId && (kind === 'sow' || kind === 'change-order') ? { parentId } : {}), answers }
  const preview = template && partyId ? previewTemplate(store, template, use) : null
  const problems = template ? templateProblems(template) : []
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  const needsParent = kind === 'change-order'
  const ready = !!partyId && (!needsParent || !!parentId) && (start !== 'copy' || !!copyId) && (start !== 'file' || !!file) && (start !== 'tpl' || (!!template && !problems.length)) && (start !== 'register' || (!!numberText.trim() && /^\d{4}-\d{2}-\d{2}$/.test(signedAt)))
  const create = () => p.act(async () => {
    const created = start === 'tpl' && template ? await invoiceCommands.createAgreementFromTemplate({ templateId: template.id, ...use }) : await invoiceCommands.createAgreement({
      kind, direction, ...party, ...(parentId && (kind === 'sow' || kind === 'change-order') ? { parentId } : {}),
      startFrom: start === 'copy' ? { kind: 'copy', agreementId: copyId } : { kind: 'skeleton' },
      ...(start === 'register' ? { registered: { numberText, signedAt, ...(file ? { signedPdfPath: file } : {}) } } : {}),
    })
    onClose()
    await p.openAgreement(created.id)
    if (start === 'file' && file) {
      const handed = await askDrawer(`In PureInvoicing, draft agreement ${created.id} ("${created.title}" with ${created.party}) is open. Read the file ${file} and fill each section of the agreement from it with editAgreementSection, one section at a time, in the section's own words from the file. Where the file does not say something (fees, dates, names), keep a [bracketed placeholder]. Then set the fee and milestones with updateAgreement only if the file states them. Tell me what you filled and what is still in brackets.`)
      if (!handed) p.openAssistant()
    }
  }, start === 'tpl' && template ? `Drafted from “${template.name}”.` : start === 'register' ? 'Signed agreement recorded.' : start === 'file' ? 'Draft started; the assistant is filling it from the file in the drawer.' : 'Draft started.')
  const addContractor = () => p.act(async () => {
    const saved = await invoiceCommands.saveContractor({ details: { name: newContractor.trim() } })
    setContractorId(saved.contractor.id); setNewContractor('')
  }, 'Contractor added.')
  const Choice = ({ on, onClick, title, note, big }: { on: boolean; onClick: () => void; title: string; note: string; big?: boolean }) => (
    <button type="button" aria-pressed={on} onClick={onClick} style={{ textAlign: 'left', padding: big ? 16 : 12, borderRadius: 12, border: on ? '2px solid var(--d-acc)' : '1px solid var(--d-line)', background: on ? 'var(--d-acc-soft)' : 'var(--d-paper)', color: 'var(--d-ink)', font: 'inherit', display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer', margin: on ? 0 : 1 }}>
      <span style={{ fontWeight: 600, fontSize: big ? 15 : 13.5 }}>{title}</span><span style={{ fontSize: 12, color: 'var(--d-muted)', lineHeight: 1.4 }}>{note}</span>
    </button>
  )
  const pill = (value: Start, label: string, enabled = true) => enabled ? <Btn key={value} type="button" $sm aria-pressed={start === value} onClick={() => setStart(value)} style={start === value ? { background: 'var(--d-acc-soft)', color: 'var(--d-acc-ink, var(--d-acc))', borderColor: 'var(--d-acc)' } : undefined}>{label}</Btn> : null
  return (
    <Scrim onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <Sheet role="dialog" aria-label={preset.register ? 'Record a signed agreement' : 'New agreement'} style={{ width: 'min(900px, 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 22px 14px', borderBottom: '1px solid var(--d-line)' }}>
          <div><Kicker>{start === 'register' ? 'Record a signed agreement' : 'New agreement'}</Kicker><div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', marginTop: 2 }}>Who is doing the work?</div></div>
          <span style={{ flex: 1 }} />
          <Btn type="button" $quiet $sm onClick={onClose} aria-label="Close"><Icon.x /></Btn>
        </div>
        <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto', minHeight: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <Choice big on={direction === 'client'} onClick={() => setDirection('client')} title="We do it, for a client" note="Pure Science delivers and invoices. Milestones become invoice drafts when they fall due." />
            <Choice big on={direction === 'contractor'} onClick={() => setDirection('contractor')} title="A contractor does it, for us" note="We engage and pay. Their bills are checked against the rate and cap agreed here." />
          </div>
          <Kicker>Kind of agreement</Kicker>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
            {KINDS_FOR[direction].map(k => <Choice key={k} on={kind === k} onClick={() => setKind(k)} title={k === 'sow' && direction === 'contractor' ? 'Statement of work' : KIND_LABEL[k]} note={KIND_NOTE[k]} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, padding: 14, borderRadius: 12, background: 'var(--d-well)' }}>
            {direction === 'client' ? (
              <Field><span>Client</span><Select value={clientId} onChange={event => setClientId(event.target.value)}>{clients.length ? clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>) : <option value="">Add a client in Clients first</option>}</Select></Field>
            ) : (
              <Field as="div"><span>Contractor</span>
                {contractors.length ? <Select aria-label="Contractor" value={contractorId} onChange={event => setContractorId(event.target.value)}>{contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select> : null}
                <div style={{ display: 'flex', gap: 6, marginTop: contractors.length ? 6 : 0 }}><Input aria-label="New contractor's name" placeholder={contractors.length ? 'Or add one: name' : 'Name of the person or firm'} value={newContractor} onChange={event => setNewContractor(event.target.value)} /><Btn type="button" $sm disabled={disabled || !newContractor.trim()} onClick={addContractor}>Add</Btn></div>
              </Field>
            )}
            {kind === 'sow' || kind === 'change-order' ? (
              <Field><span>{kind === 'sow' ? 'Under' : 'Amends'}</span>
                <Select value={parentId} onChange={event => setParentId(event.target.value)}>
                  {kind === 'sow' ? <option value="">No master agreement</option> : null}
                  {parents.map(a => <option key={a.id} value={a.id}>{a.title}{a.numberText ? ` · ${a.numberText}` : ''}</option>)}
                  {kind === 'change-order' && !parents.length ? <option value="">Nothing signed to amend yet</option> : null}
                </Select>
              </Field>
            ) : <div />}
            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Meta>Start from</Meta>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {pill('tpl', offered.length > 1 ? `A template (${offered.length})` : 'Your template', offered.length > 0)}
                {pill('skeleton', 'Headings with prompts')}
                {pill('copy', 'A copy of another', copies.length > 0)}
                {pill('file', 'A file: the assistant drafts it')}
                {pill('register', 'Already signed: record it')}
              </div>
              {start === 'tpl' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                    {offered.map(t => <Choice key={t.id} on={t.id === templateId} onClick={() => setTemplateId(t.id)} title={`${t.name}${t.isDefault ? ' · default' : ''}`} note={`${feeShape(t)}${t.origin ? ` · ${t.origin}` : ''}`} />)}
                  </div>
                  {template && problems.length ? <Meta style={{ color: 'var(--d-warn-ink)' }}>This template needs attention before use: {problems.join(' ')}</Meta> : null}
                  {template && template.fields.some(f => f.source === 'ask') ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                      {template.fields.filter(f => f.source === 'ask').map(f => (
                        <Field key={f.key} style={f.type === 'text' || !f.type ? { gridColumn: '1 / -1' } : undefined}><span>{f.label}{f.type === 'money' ? ` (${preview?.currency ?? 'USD'})` : ''}</span>
                          <Input type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'money' || f.type === 'number' ? 'decimal' : undefined} value={answers[f.key] ?? ''} placeholder={f.type === 'money' ? 'e.g. 16000' : 'leave empty to write it in the draft'} onChange={event => setAnswers({ ...answers, [f.key]: event.target.value })} />
                        </Field>
                      ))}
                    </div>
                  ) : null}
                  {preview ? (
                    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--d-acc-soft)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <b style={{ fontSize: 13 }}>{preview.title}</b>
                      {preview.milestones.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{preview.milestones.map((m, i) => <span key={i} style={{ display: 'flex', gap: 8, padding: '5px 9px', borderRadius: 8, background: 'var(--d-paper)', fontSize: 12.5 }}>{m.label}<Mono>{m.amount ? m.amount.toLocaleString('en-US', { style: 'currency', currency: preview.currency }) : `${m.share}%`}</Mono></span>)}</div> : null}
                      <Meta>{template!.sections.length} sections{preview.paymentDays !== undefined ? ` · payment in ${preview.paymentDays} days` : ''}{preview.missing.length ? ` · not filled yet: ${preview.missing.join(', ')}` : ''}{preview.prompts ? ` · ${preview.prompts} prompt${preview.prompts === 1 ? '' : 's'} left for you to write` : ' · nothing left to write'}.</Meta>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {start === 'copy' ? <Select aria-label="Agreement to copy" value={copyId} onChange={event => setCopyId(event.target.value)}>{copies.map(a => <option key={a.id} value={a.id}>{a.title} · {store.clients[a.clientId ?? '']?.name ?? store.contractors?.[a.contractorId ?? '']?.name ?? ''}{a.numberText ? ` · ${a.numberText}` : ''}</option>)}</Select> : null}
              {start === 'file' || start === 'register' ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Btn type="button" $sm disabled={disabled} onClick={() => void chooseDocumentFile().then(path => { if (path) setFile(path) }).catch(() => undefined)}><Icon.file />{file ? 'Choose another file…' : start === 'register' ? 'Link the signed PDF…' : 'Choose a proposal or document…'}</Btn>
                  {file ? <Mono style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }} title={file}>{file.split('/').pop()}</Mono> : <Meta>{start === 'register' ? 'optional; linked, not copied' : 'a proposal, an earlier SOW, meeting notes'}</Meta>}
                </div>
              ) : null}
              {start === 'register' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  <Field><span>Its number</span><Input value={numberText} placeholder="As written on it, e.g. SOW #1" onChange={event => setNumberText(event.target.value)} /></Field>
                  <Field><span>Signed on</span><Input type="date" value={signedAt} max={localToday()} onChange={event => setSignedAt(event.target.value)} /></Field>
                </div>
              ) : null}
              <Meta style={{ lineHeight: 1.45 }}>{start === 'copy' ? 'The copy keeps the structure and the wording of general sections; scope, background, timeline and fee start empty so nothing from the other agreement goes out by mistake.'
                : start === 'file' ? 'The draft opens with headings, and the assistant fills each section from the file in the drawer. You read and change every section before sending.'
                : start === 'register' ? 'Recorded as active with its own number. Add its fee and milestones on its page so invoices can be counted against it.'
                : start === 'tpl' ? 'Your wording with its fields filled in. Anything left in brackets waits for you before the draft can be sent.' : 'Headings with [bracketed] prompts; sending waits until none are left.'}</Meta>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--d-line)' }}>
          <Meta>{start === 'register' ? 'Nothing is printed or sent.' : <>Numbered <Mono style={{ color: 'var(--d-ink)' }}>{nextAgreementNumber(store, kind)}</Mono> when it is sent for signature.</>}</Meta>
          <span style={{ flex: 1 }} />
          <Btn type="button" $quiet onClick={onClose}>Cancel</Btn>
          <Btn type="button" $acc disabled={disabled || !ready} onClick={create}>{start === 'register' ? 'Record it' : start === 'tpl' ? 'Generate draft' : 'Start drafting'}</Btn>
        </div>
      </Sheet>
    </Scrim>
  )
}
