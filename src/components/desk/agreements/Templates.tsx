import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { styled } from 'styled-components'
import type { InvoiceProduct } from '../../../hooks/useInvoiceProduct'
import { KINDS_FOR, KIND_LABEL } from '../../../lib/invoices/agreements'
import { SOURCE_LABEL, feeShape, previewTemplate, templateCounts, templateProblems } from '../../../lib/invoices/templates'
import { invoiceCommands } from '../../../lib/invoices/workspace'
import type { AgreementDirection, AgreementKind, AgreementTemplate, InvoiceStore, TemplateField, TemplateFieldSource } from '../../../lib/invoices/types'
import { Icon, scrollWithin } from '../bits'
import { Body, Btn, Chip, Field, Input, Kicker, Meta, Mono, Panel, Sec, SecHead, Select, TopBar } from '../deskStyles'

const TONE: Record<AgreementDirection, { bg: string; ink: string }> = { client: { bg: 'var(--d-info-bg)', ink: 'var(--d-info-ink)' }, contractor: { bg: 'color-mix(in srgb, #4B5A9E 14%, transparent)', ink: '#4B5A9E' } }

/**
 * The template library: SOW, contractor and other agreement templates, the
 * default for each kind first. Use starts a new agreement from one; Edit
 * opens it; a kind with no template offers to make one.
 */
export function TemplatesLibrary({ product: p, store, disabled, onUse, onEdit, onMake }: {
  product: InvoiceProduct; store: InvoiceStore; disabled: boolean
  onUse: (template: AgreementTemplate) => void; onEdit: (templateId: string) => void; onMake: (preset: { kind?: AgreementKind; direction?: AgreementDirection }) => void
}): React.ReactElement {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLocaleLowerCase()
  const all = Object.values(store.templates ?? {}).filter(t => !needle || [t.name, t.description ?? '', KIND_LABEL[t.kind]].some(v => v.toLocaleLowerCase().includes(needle)))
  return (
    <Main>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>Templates</div>
          <Meta>Choose one to start a new agreement, or make one from an agreement you are happy with.</Meta>
        </div>
        <span style={{ flex: 1 }} />
        <Search><Icon.search /><input aria-label="Search templates" placeholder="Search templates" value={query} onChange={event => setQuery(event.target.value)} /></Search>
        <Btn $acc disabled={disabled} onClick={() => onMake({})}><Icon.plus />New template</Btn>
      </div>
      {(['client', 'contractor'] as const).map(direction => {
        const kinds = KINDS_FOR[direction]
        const mine = all.filter(t => t.direction === direction).sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || Number(!!b.isDefault) - Number(!!a.isDefault) || a.name.localeCompare(b.name))
        const missing = needle ? [] : kinds.filter(kind => !mine.some(t => t.kind === kind))
        return (
          <Fragment key={direction}>
            <Kicker style={{ marginTop: 6 }}>{direction === 'client' ? 'For clients · Pure Science does the work' : 'For contractors · they do work for Pure Science'}</Kicker>
            <Grid>
              {mine.map(t => {
                const counts = templateCounts(t), problems = templateProblems(t)
                return (
                  <Card key={t.id}>
                    <div className="tags"><span className="tag" style={{ background: TONE[direction].bg, color: TONE[direction].ink }}>{KIND_LABEL[t.kind]}</span>{t.isDefault ? <Chip $tone="ok">Default</Chip> : null}{problems.length ? <Chip $tone="warn">Needs attention</Chip> : null}</div>
                    <div><div className="name">{t.name}</div><Meta>{t.description || t.origin || 'Your wording'}</Meta></div>
                    <dl>
                      <div><dt>Fee</dt><dd>{feeShape(t)}</dd></div>
                      <div><dt>Wording</dt><dd>{counts.sections} section{counts.sections === 1 ? '' : 's'} · {counts.fields} field{counts.fields === 1 ? '' : 's'} · {counts.prompts} prompt{counts.prompts === 1 ? '' : 's'}</dd></div>
                      <div><dt>Payment</dt><dd>{t.paymentDays === 'parent' ? 'as the agreement it sits under' : t.paymentDays === 'client' ? 'the client’s usual terms' : t.paymentDays !== undefined ? `${t.paymentDays} days` : 'not set'}</dd></div>
                    </dl>
                    <div className="actions">
                      <Btn $acc $sm style={{ flex: 1 }} disabled={disabled || problems.length > 0} title={problems.join('\n') || undefined} onClick={() => onUse(t)}>Use</Btn>
                      <Btn $sm disabled={disabled} onClick={() => onEdit(t.id)}>Edit</Btn>
                      <Btn $sm $quiet disabled={disabled} title="Make a copy to change" onClick={() => p.act(async () => { const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = t; const copy = await invoiceCommands.saveAgreementTemplate({ template: { ...rest, name: `${t.name} (copy)`, isDefault: false } }); onEdit(copy.id) }, 'Copy made.')}>Copy</Btn>
                    </div>
                  </Card>
                )
              })}
              {!mine.length ? <Card className="missing"><div className="name" style={{ fontSize: 14.5 }}>No templates yet</div><Meta>{direction === 'client' ? 'Make one from a SOW you are happy with, or from your own document.' : 'Make one from your contractor agreement, or from the built-in headings.'}</Meta><div className="actions"><Btn $sm disabled={disabled} onClick={() => onMake({ kind: KINDS_FOR[direction][0], direction })}>Make one</Btn></div></Card> : null}
            </Grid>
            {missing.length && mine.length ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Meta>No template yet for</Meta>
                {missing.map(kind => <Btn key={kind} $sm $quiet style={{ border: '1px dashed var(--d-line)' }} disabled={disabled} onClick={() => onMake({ kind, direction })}><Icon.plus />{KIND_LABEL[kind]}</Btn>)}
              </div>
            ) : null}
          </Fragment>
        )
      })}
      <Meta style={{ marginTop: 4 }}>Templates hold your wording with <b>fields</b> the app fills (the client, dates, the fee) and <b>[prompts]</b> you write each time. Changing a template never changes agreements already made from it.</Meta>
    </Main>
  )
}

const PLURAL: Record<AgreementKind, string> = { msa: 'master services agreements', sow: 'statements of work', 'change-order': 'change orders', nda: 'NDAs', contractor: 'contractor agreements' }
const slug = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : '')).replace(/^[^a-z]+/, '') || 'field'
type TemplateInput = Omit<AgreementTemplate, 'id' | 'createdAt' | 'updatedAt'>

/**
 * Editing a template: the wording on the page with its fields as chips (blue
 * fill themselves, amber are asked) and [prompts] marked; click a section to
 * write it. The side panel holds its name, fields, fee and milestone shares.
 * "Preview with" shows it filled for a real client.
 */
export function TemplateEditor({ product: p, store, template: t, disabled, onBack, onUse }: { product: InvoiceProduct; store: InvoiceStore; template: AgreementTemplate; disabled: boolean; onBack: () => void; onUse: (template: AgreementTemplate) => void }): React.ReactElement {
  const [editing, setEditing] = useState<number | 'title' | null>(null)
  const [previewParty, setPreviewParty] = useState('')
  const problems = templateProblems(t)
  const { id: _id, createdAt: _c, updatedAt: _u, ...base } = t
  const save = (patch: Partial<TemplateInput>, done?: string) => p.act(() => invoiceCommands.saveAgreementTemplate({ templateId: t.id, template: { ...base, ...patch } }), done)
  const parties = t.direction === 'client' ? Object.values(store.clients) : Object.values(store.contractors ?? {})
  const partyUse = previewParty ? (t.direction === 'client' ? { clientId: previewParty } : { contractorId: previewParty }) : null
  const parent = partyUse && (t.kind === 'sow' || t.kind === 'change-order') ? Object.values(store.agreements ?? {}).filter(a => (a.clientId ?? a.contractorId) === previewParty && (t.kind === 'sow' ? a.kind === 'msa' : a.status !== 'draft')).sort((a, b) => (b.signedAt ?? '').localeCompare(a.signedAt ?? ''))[0] : undefined
  const preview = partyUse ? previewTemplate(store, t, { ...partyUse, ...(parent ? { parentId: parent.id } : {}) }) : null
  const fieldOf = (key: string) => t.fields.find(f => f.key === key)
  const asked = t.fields.filter(f => f.source === 'ask')
  const total = Math.round(t.milestones.reduce((sum, m) => sum + m.share, 0) * 100) / 100
  return (
    <>
      <TopBar as="div" style={{ height: 48, borderTop: '1px solid var(--d-line)', background: 'transparent', backdropFilter: 'none' }}>
        <Btn $quiet $sm onClick={onBack}><Icon.back />Templates</Btn>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</span>
        <Chip $tone="info">{KIND_LABEL[t.kind]} · {t.direction === 'client' ? 'for clients' : 'for contractors'}</Chip>
        {problems.length ? <Chip $tone="warn" title={problems.join('\n')}>{problems.length} to fix before use</Chip> : <Chip $tone="ok">Ready to use</Chip>}
        <span style={{ flex: 1 }} />
        <Btn $quiet $sm disabled={disabled} onClick={() => p.act(async () => { await invoiceCommands.deleteAgreementTemplate({ templateId: t.id }); onBack() }, 'Template deleted; agreements made from it are unchanged.')}>Delete</Btn>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><Meta>Preview with</Meta>
          <Select aria-label="Preview with" value={previewParty} onChange={event => { setPreviewParty(event.target.value); setEditing(null) }} style={{ width: 'auto', height: 30 }}>
            <option value="">Fields shown as fields</option>{parties.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </label>
        <Btn $acc disabled={disabled || problems.length > 0} title={problems.join('\n') || undefined} onClick={() => onUse(t)}>Use this template</Btn>
      </TopBar>
      <Body style={{ gap: 0 }}>
        <Outline aria-label="Sections">
          <Kicker style={{ padding: '0 8px 6px' }}>Sections</Kicker>
          {t.sections.map((s, i) => <a key={i} href={`#tsection-${i}`} onClick={event => { event.preventDefault(); scrollWithin(document.getElementById(`tsection-${i}`)) }}><Mono className="n">{i + 1}</Mono><span className="name">{s.heading || 'Untitled'}</span></a>)}
          <Btn $quiet $sm style={{ marginTop: 6, border: '1px dashed var(--d-line)' }} disabled={disabled} onClick={() => p.act(async () => { await save({ sections: [...t.sections, { heading: 'New section', body: '' }] }); setEditing(t.sections.length) })}><Icon.plus />Section</Btn>
        </Outline>
        <DeskArea>
          <Paper>
            <div className="letterhead"><span className="kind">{KIND_LABEL[t.kind]}</span><span style={{ flex: 1 }} /><span>numbered when sent</span></div>
            {preview ? <h1 className="title">{preview.title}</h1> : editing === 'title'
              ? <EditTitle value={t.title} fields={t.fields} onDone={title => { setEditing(null); if (title !== t.title) void save({ title }) }} />
              : <button type="button" className="title editable" onClick={() => setEditing('title')} disabled={disabled}><Rich text={t.title} fieldOf={fieldOf} /></button>}
            {preview ? <Meta>Filled for {(() => { const text = `${parties.find(x => x.id === previewParty)?.name ?? ''}${parent ? `, under ${parent.title}` : ''}`; return text.endsWith('.') ? text : `${text}.` })()} {preview.missing.length ? `Not filled: ${preview.missing.join(', ')}.` : ''} {preview.prompts ? `${preview.prompts} prompt${preview.prompts === 1 ? '' : 's'} left to write.` : ''}</Meta> : null}
            {t.sections.map((s, i) => (
              <section key={i} id={`tsection-${i}`} className={editing === i ? 'editing' : undefined}>
                {editing === i && !preview ? (
                  <SectionEditor section={s} fields={t.fields} onCancel={() => setEditing(null)} onDone={next => { setEditing(null); if (next.heading !== s.heading || next.body !== s.body) void save({ sections: t.sections.map((x, j) => j === i ? next : x) }) }}
                    onRemove={() => { setEditing(null); void save({ sections: t.sections.filter((_, j) => j !== i) }, 'Section removed.') }} />
                ) : (
                  <button type="button" className="show" disabled={disabled || !!preview} onClick={() => setEditing(i)} aria-label={`Edit ${s.heading}`}>
                    <h2><span className="num">{i + 1}</span>{preview ? preview.sections[i]?.heading : <Rich text={s.heading} fieldOf={fieldOf} />}</h2>
                    <div className="body">{(preview ? preview.sections[i]?.body ?? '' : s.body).split(/\n\s*\n/).map((para, k) => <p key={k}>{preview ? <Rich text={para} fieldOf={() => undefined} /> : <Rich text={para} fieldOf={fieldOf} />}</p>)}</div>
                    {t.fee.kind === 'fixed' && t.milestones.length && /fee|payment|milestone|invoic/i.test(s.heading) ? (
                      <table className="schedule"><tbody>{t.milestones.map((m, k) => <tr key={k}><td>{k + 1}. {m.label}</td><td className="n">{preview?.milestones[k] && preview.fee.amount !== undefined ? `${m.share}% · ${preview.milestones[k].amount.toLocaleString('en-US', { style: 'currency', currency: preview.currency })}` : `${m.share}%`}</td></tr>)}</tbody></table>
                    ) : null}
                  </button>
                )}
              </section>
            ))}
          </Paper>
        </DeskArea>
        <Panel $strong style={{ flex: '0 0 390px', overflow: 'auto', borderRadius: 0, borderWidth: '0 0 0 1px' }}>
          {problems.length ? <Sec><SecHead><h3>Before it can be used</h3></SecHead>{problems.map(x => <div key={x} style={{ display: 'flex', gap: 8, fontSize: 12.5 }}><span style={{ width: 7, height: 7, marginTop: 6, borderRadius: 999, background: 'var(--d-warn-ink)', flex: '0 0 auto' }} />{x}</div>)}</Sec> : null}
          <Sec>
            <SecHead><h3>About this template</h3></SecHead>
            <Field><span>Name</span><Commit value={t.name} disabled={disabled} onCommit={name => { if (name.trim() && name !== t.name) void save({ name }) }} /></Field>
            <Field><span>When to use it</span><Commit value={t.description ?? ''} placeholder="e.g. Several workshops, paid in three steps" disabled={disabled} onCommit={description => { if (description !== (t.description ?? '')) void save({ description }) }} /></Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" checked={!!t.isDefault} disabled={disabled} onChange={event => void save({ isDefault: event.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--d-acc)' }} />Default for new {PLURAL[t.kind]}{t.direction === 'contractor' ? ' with contractors' : ''}</label>
            {t.origin ? <Meta>{t.origin}</Meta> : null}
          </Sec>
          <Sec>
            <SecHead><h3>Fields</h3><span className="sp" /><Btn $sm disabled={disabled} onClick={() => { const label = `Field ${t.fields.length + 1}`; let key = slug(label); while (t.fields.some(f => f.key === key)) key += '2'; void save({ fields: [...t.fields, { key, label, source: 'ask', type: 'text' }] }) }}><Icon.plus />Field</Btn></SecHead>
            {t.fields.map((f, i) => (
              <FieldRow key={f.key}>
                <FieldChip field={f} />
                <Commit aria-label="Label" value={f.label} disabled={disabled} onCommit={label => { if (label.trim() && label !== f.label) void save({ fields: t.fields.map((x, j) => j === i ? { ...x, label } : x) }) }} />
                <select aria-label="Where it comes from" value={f.source} disabled={disabled} onChange={event => void save({ fields: t.fields.map((x, j) => j === i ? { ...x, source: event.target.value as TemplateFieldSource } : x) })}>
                  {(Object.keys(SOURCE_LABEL) as TemplateFieldSource[]).map(src => <option key={src} value={src}>{SOURCE_LABEL[src]}</option>)}
                </select>
                {f.source === 'ask' ? <>
                  <select aria-label="Kind of answer" value={f.type ?? 'text'} disabled={disabled} onChange={event => void save({ fields: t.fields.map((x, j) => j === i ? { ...x, type: event.target.value as TemplateField['type'] } : x) })}><option value="text">text</option><option value="number">number</option><option value="money">money</option><option value="date">date</option></select>
                  <Commit aria-label="Default answer" placeholder="default" value={f.default ?? ''} disabled={disabled} onCommit={value => { if (value !== (f.default ?? '')) void save({ fields: t.fields.map((x, j) => j === i ? { ...x, default: value || undefined } : x) }) }} />
                </> : null}
                <button type="button" className="rm" aria-label={`Remove ${f.label}`} disabled={disabled} onClick={() => void save({ fields: t.fields.filter((_, j) => j !== i) })}><Icon.x /></button>
              </FieldRow>
            ))}
            <Meta style={{ lineHeight: 1.45 }}><Legend $tone="auto">Blue</Legend> fill themselves; <Legend $tone="ask">amber</Legend> are asked once when the template is used; <Legend $tone="ask" style={{ background: 'none', borderBottom: '1.5px dashed var(--d-warn-ink)', borderRadius: 0 }}>[prompts]</Legend> stay in the draft for you to write. In the wording a field is written <Mono>{'{{key}}'}</Mono>; editing a section offers them as buttons.</Meta>
          </Sec>
          <Sec>
            <SecHead><h3>Money</h3></SecHead>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <Field><span>Fee</span><Select value={t.fee.kind} disabled={disabled} onChange={event => void save({ fee: { ...t.fee, kind: event.target.value as AgreementTemplate['fee']['kind'] } })}><option value="fixed">Fixed</option><option value="monthly">Monthly retainer</option><option value="hourly">Hourly</option><option value="none">No fee</option></Select></Field>
              <Field><span>Payment days</span><Select value={typeof t.paymentDays === 'number' ? 'number' : t.paymentDays ?? ''} disabled={disabled} onChange={event => { const v = event.target.value; void save({ paymentDays: v === 'number' ? 30 : v === '' ? undefined : v as 'parent' | 'client' }) }}>
                <option value="">Not set</option><option value="parent">From the agreement it sits under</option><option value="client">The client’s usual terms</option><option value="number">A number of days</option></Select></Field>
              {typeof t.paymentDays === 'number' ? <Field><span>Days</span><Commit value={String(t.paymentDays)} inputMode="numeric" disabled={disabled} onCommit={v => { const n = Number(v); if (Number.isInteger(n) && n >= 0 && n !== t.paymentDays) void save({ paymentDays: n }) }} /></Field> : null}
              {(t.fee.kind === 'fixed' || t.fee.kind === 'monthly') ? <Field><span>Amount from</span><Select value={t.fee.amountField ?? ''} disabled={disabled} onChange={event => void save({ fee: { ...t.fee, amountField: event.target.value || undefined } })}><option value="">Choose an asked field</option>{asked.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</Select></Field> : null}
              {t.fee.kind === 'hourly' ? <>
                <Field><span>Rate from</span><Select value={t.fee.rateField ?? ''} disabled={disabled} onChange={event => void save({ fee: { ...t.fee, rateField: event.target.value || undefined } })}><option value="">Not asked</option>{asked.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</Select></Field>
                <Field><span>Cap from</span><Select value={t.fee.capField ?? ''} disabled={disabled} onChange={event => void save({ fee: { ...t.fee, capField: event.target.value || undefined } })}><option value="">No cap</option>{asked.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</Select></Field>
              </> : null}
            </div>
            {t.fee.kind === 'fixed' ? <>
              <Kicker style={{ marginTop: 4 }}>Milestones · shares of the fee</Kicker>
              {t.milestones.map((m, i) => (
                <FieldRow key={i}>
                  <Commit aria-label="Milestone" value={m.label} disabled={disabled} onCommit={label => { if (label.trim() && label !== m.label) void save({ milestones: t.milestones.map((x, j) => j === i ? { ...x, label } : x) }) }} />
                  <select aria-label="When it is invoiced" value={m.trigger} disabled={disabled} onChange={event => void save({ milestones: t.milestones.map((x, j) => j === i ? { ...x, trigger: event.target.value as 'signature' } : x) })}><option value="signature">on signature</option><option value="done">when done</option><option value="acceptance">on acceptance</option></select>
                  <Commit aria-label="Share in percent" className="share" value={String(m.share)} inputMode="decimal" disabled={disabled} onCommit={v => { const n = Number(v); if (Number.isFinite(n) && n !== m.share) void save({ milestones: t.milestones.map((x, j) => j === i ? { ...x, share: n } : x) }) }} /><Meta>%</Meta>
                  <button type="button" className="rm" aria-label={`Remove ${m.label}`} disabled={disabled} onClick={() => void save({ milestones: t.milestones.filter((_, j) => j !== i) })}><Icon.x /></button>
                </FieldRow>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Btn $sm $quiet disabled={disabled} onClick={() => void save({ milestones: [...t.milestones, { label: t.milestones.length ? 'Next milestone' : 'On signature', share: Math.max(0, Math.round((100 - total) * 100) / 100), trigger: t.milestones.length ? 'done' : 'signature' }] })}><Icon.plus />Milestone</Btn>
                <span style={{ flex: 1 }} />
                {t.milestones.length ? <Meta style={{ color: total === 100 ? 'var(--d-ok-ink)' : 'var(--d-warn-ink)' }}>{total === 100 ? 'Shares add up to 100%; amounts follow the fee.' : `Shares add up to ${total}%.`}</Meta> : null}
              </div>
            </> : null}
          </Sec>
        </Panel>
      </Body>
    </>
  )
}

/** Wording with {{fields}} as chips and [prompts] marked. */
function Rich({ text, fieldOf }: { text: string; fieldOf: (key: string) => TemplateField | undefined }): React.ReactElement {
  const parts = text.split(/(\{\{\s*[a-zA-Z][\w-]*\s*\}\}|\[[^\]\n]{1,120}\])/g)
  return <>{parts.map((part, i) => {
    const token = part.match(/^\{\{\s*([a-zA-Z][\w-]*)\s*\}\}$/)
    if (token) { const f = fieldOf(token[1]); return f ? <FieldChip key={i} field={f} /> : <span key={i} className="chip unknown" title="Not a field of this template">{token[1]}</span> }
    if (/^\[[^\]]+\]$/.test(part)) return <span key={i} className="prompt">{part}</span>
    return <Fragment key={i}>{part}</Fragment>
  })}</>
}
function FieldChip({ field }: { field: TemplateField }): React.ReactElement {
  return <span className={`chip ${field.source === 'ask' ? 'ask' : 'auto'}`} title={`${field.label}: ${SOURCE_LABEL[field.source]}`}>{field.label}</span>
}

function SectionEditor({ section, fields, onDone, onCancel, onRemove }: { section: { heading: string; body: string }; fields: TemplateField[]; onDone: (next: { heading: string; body: string }) => void; onCancel: () => void; onRemove: () => void }): React.ReactElement {
  const [heading, setHeading] = useState(section.heading)
  const [body, setBody] = useState(section.body)
  const area = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => { const el = area.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px` } }, [body])
  const insert = (text: string) => {
    const el = area.current
    if (!el) { setBody(body + text); return }
    const start = el.selectionStart ?? body.length, end = el.selectionEnd ?? body.length
    const next = body.slice(0, start) + text + body.slice(end)
    setBody(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length) })
  }
  return (
    <div className="editor">
      <input aria-label="Section heading" className="heading" value={heading} onChange={event => setHeading(event.target.value)} autoFocus />
      <textarea ref={area} aria-label="Section wording" value={body} onChange={event => setBody(event.target.value)} placeholder="Write this section in your own wording…" />
      <div className="insert">
        <Meta>Insert</Meta>
        {fields.map(f => <button key={f.key} type="button" className={`chip ${f.source === 'ask' ? 'ask' : 'auto'}`} onMouseDown={event => event.preventDefault()} onClick={() => insert(`{{${f.key}}}`)}>{f.label}</button>)}
        <button type="button" className="prompt" onMouseDown={event => event.preventDefault()} onClick={() => insert('[describe this]')}>[prompt]</button>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Btn type="button" $sm $quiet onClick={onRemove}><Icon.trash />Remove section</Btn>
        <span style={{ flex: 1 }} />
        <Btn type="button" $sm $quiet onClick={onCancel}>Cancel</Btn>
        <Btn type="button" $sm $acc onClick={() => onDone({ heading: heading.trim() || 'Untitled', body })}>Done</Btn>
      </div>
    </div>
  )
}
function EditTitle({ value, fields, onDone }: { value: string; fields: TemplateField[]; onDone: (value: string) => void }): React.ReactElement {
  const [text, setText] = useState(value)
  return (
    <div className="editor">
      <input aria-label="Title" className="heading" style={{ fontSize: 20 }} value={text} onChange={event => setText(event.target.value)} autoFocus onKeyDown={event => { if (event.key === 'Enter') onDone(text) }} />
      <div className="insert"><Meta>Insert</Meta>{fields.map(f => <button key={f.key} type="button" className={`chip ${f.source === 'ask' ? 'ask' : 'auto'}`} onClick={() => setText(`${text}{{${f.key}}}`)}>{f.label}</button>)}<span style={{ flex: 1 }} /><Btn type="button" $sm $acc onClick={() => onDone(text)}>Done</Btn></div>
    </div>
  )
}
/** A text input that keeps its own value while focused and commits on blur or Enter. */
function Commit({ value, onCommit, ...rest }: { value: string; onCommit: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>): React.ReactElement {
  const [local, setLocal] = useState<string | null>(null)
  return <Input {...rest} value={local ?? value} onFocus={() => setLocal(value)} onChange={event => setLocal(event.target.value)} onBlur={() => { if (local !== null) onCommit(local); setLocal(null) }} onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur() }} />
}

const chipCss = `
  .chip { display: inline-block; font-family: var(--d-ui, system-ui, sans-serif); font-size: .82em; line-height: 1.3; padding: 1px 7px; border-radius: 6px; border: 0; vertical-align: baseline; white-space: nowrap; }
  .chip.auto { background: var(--d-info-bg); color: var(--d-info-ink); }
  .chip.ask { background: var(--d-warn-bg); color: var(--d-warn-ink); }
  .chip.unknown { background: var(--d-bad-bg); color: var(--d-bad-ink); }
  .prompt { background: color-mix(in srgb, var(--d-warn-bg) 60%, transparent); border-bottom: 1.5px dashed var(--d-warn-ink); padding: 0 2px; }
`
const Main = styled.main`
  flex: 1 1 auto; min-width: 0; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 12px; padding-right: 4px;
`
const Search = styled.label`
  display: flex; align-items: center; gap: 8px; width: 240px; height: 34px; padding: 0 12px; border-radius: 999px; background: var(--d-paper); border: 1px solid var(--d-line);
  input { border: 0; outline: 0; background: none; font: inherit; font-size: 13px; color: var(--d-ink); flex: 1; min-width: 0; }
  svg { color: var(--d-faint); }
`
const Grid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;
`
const Card = styled.article`
  background: var(--d-paper); border: 1px solid var(--d-line); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 10px;
  &.missing { background: transparent; border-style: dashed; }
  .tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .tag { padding: 2px 8px; border-radius: 999px; font-size: 11.5px; }
  .name { font-size: 15.5px; font-weight: 600; }
  dl { margin: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
  dl div { display: flex; gap: 8px; } dt { width: 66px; flex: 0 0 auto; color: var(--d-faint); } dd { margin: 0; }
  .actions { display: flex; gap: 6px; margin-top: auto; }
`
const Outline = styled.nav`
  flex: 0 0 220px; display: flex; flex-direction: column; gap: 1px; padding: 14px 10px; border-right: 1px solid var(--d-line); overflow: auto; min-height: 0;
  a { display: flex; align-items: center; gap: 9px; padding: 6px 8px; border-radius: 8px; color: var(--d-ink); text-decoration: none; font-size: 13px; }
  a:hover { background: var(--d-well); }
  .n { font-size: 11px; color: var(--d-faint); width: 16px; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`
const DeskArea = styled.main`
  flex: 1 1 auto; min-width: 0; min-height: 0; overflow: auto; padding: 22px 26px 60px; display: flex; justify-content: center;
`
const Paper = styled.article`
  width: min(680px, 100%); height: max-content; box-sizing: border-box; padding: 38px 50px 46px; background: #fff; color: #1c242c; border-radius: 4px;
  box-shadow: 0 2px 10px rgba(22, 32, 42, 0.1), 0 0 0 1px rgba(22, 32, 42, 0.05);
  font-family: 'Newsreader Variable', 'Source Serif 4', Georgia, serif; font-size: 14px; line-height: 1.75; display: flex; flex-direction: column; gap: 8px;
  ${chipCss}
  .letterhead { display: flex; gap: 10px; padding-bottom: 10px; border-bottom: 2px solid var(--d-acc); font-family: var(--d-mono); font-size: 11px; color: #5f6b76; }
  .kind { letter-spacing: .14em; text-transform: uppercase; }
  .title { margin: 8px 0 0; font-family: inherit; font-size: 24px; font-weight: 600; line-height: 1.3; text-align: left; border: 0; background: none; padding: 2px 4px; margin-left: -4px; color: inherit; border-radius: 6px; }
  button.title:hover:not(:disabled), .show:hover:not(:disabled) { background: #f6f9fa; cursor: text; }
  section { margin: 0 -12px; border-radius: 10px; scroll-margin-top: 20px; }
  section.editing { box-shadow: 0 0 0 2px var(--d-acc-soft); background: #fbfdfb; }
  .show { display: block; width: 100%; text-align: left; font: inherit; color: inherit; border: 0; background: none; padding: 8px 12px; border-radius: 10px; }
  .show:disabled { cursor: default; }
  h2 { margin: 0 0 4px; font-size: 15.5px; font-weight: 600; display: flex; gap: 8px; align-items: baseline; }
  .num { font-family: var(--d-mono); font-size: 11px; color: var(--d-acc-ink, var(--d-acc)); min-width: 16px; }
  .body p { margin: 0 0 8px; white-space: pre-wrap; }
  table.schedule { width: 100%; border-collapse: collapse; font-size: 13px; } .schedule td { padding: 4px 0; border-bottom: 1px solid #e3e8ec; } .schedule .n { text-align: right; font-family: var(--d-mono); }
  .editor { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; }
  .editor .heading { font: inherit; font-size: 16px; font-weight: 600; border: 1px solid #e3e8ec; border-radius: 6px; padding: 4px 8px; color: inherit; }
  .editor textarea { font: inherit; line-height: 1.7; border: 1px solid #e3e8ec; border-radius: 6px; padding: 8px 10px; resize: none; overflow: hidden; color: inherit; }
  .editor .heading:focus, .editor textarea:focus { outline: none; border-color: var(--d-acc); box-shadow: 0 0 0 3px var(--d-acc-soft); }
  .insert { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-family: var(--d-ui, system-ui, sans-serif); }
  .insert .chip, .insert .prompt { cursor: pointer; font-size: 12px; border: 0; font-family: inherit; }
`
const FieldRow = styled.div`
  display: flex; align-items: center; gap: 6px; font-size: 12.5px;
  ${chipCss}
  input { height: 28px; font-size: 12.5px; padding: 0 8px; min-width: 0; flex: 1; }
  input.share { flex: 0 0 56px; text-align: right; }
  select { height: 28px; border: 1px solid var(--d-line); border-radius: 7px; background: var(--d-paper); font: inherit; font-size: 12px; color: var(--d-ink); max-width: 150px; }
  .chip { flex: 0 0 auto; max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
  .rm { border: 0; background: none; color: var(--d-faint); padding: 3px; cursor: pointer; border-radius: 6px; } .rm svg { width: 12px; height: 12px; }
`
const Legend = styled.span<{ $tone: 'auto' | 'ask' }>`
  padding: 0 5px; border-radius: 5px; background: ${({ $tone }) => ($tone === 'auto' ? 'var(--d-info-bg)' : 'var(--d-warn-bg)')}; color: ${({ $tone }) => ($tone === 'auto' ? 'var(--d-info-ink)' : 'var(--d-warn-ink)')};
`
