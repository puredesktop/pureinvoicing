import { Fragment, useEffect, useMemo, useState } from 'react'
import { styled } from 'styled-components'
import type { InvoiceProduct } from '../../../hooks/useInvoiceProduct'
import { askDrawer, chooseDocumentFile } from '../../../bridge/platformBridge'
import { KINDS_FOR, KIND_LABEL, partyName } from '../../../lib/invoices/agreements'
import { findSpecifics, type Suggestion } from '../../../lib/invoices/templates'
import { invoiceCommands } from '../../../lib/invoices/workspace'
import type { AgreementDirection, AgreementKind, InvoiceStore } from '../../../lib/invoices/types'
import { Icon } from '../bits'
import { Btn, Field, Input, Kicker, Meta, Mono, Scrim, Select, Sheet } from '../deskStyles'

export interface MakeTemplatePreset { agreementId?: string; kind?: AgreementKind; direction?: AgreementDirection }
type Mode = 'agreement' | 'document' | 'outline'
type Choice = 'field' | 'prompt' | 'keep'

/**
 * Making a template. From an agreement: the parts that belong to that one deal
 * are found and each becomes a field, a [prompt], or stays; everything else
 * keeps the person's wording. From a document: the assistant writes it in the
 * drawer. From the built-in headings: prompts only, to write in the editor.
 */
export function MakeTemplateSheet({ product: p, store, preset, disabled, onClose, onMade }: { product: InvoiceProduct; store: InvoiceStore; preset: MakeTemplatePreset; disabled: boolean; onClose: () => void; onMade: (templateId: string) => void }): React.ReactElement {
  const sources = Object.values(store.agreements ?? {}).filter(a => a.sections.length).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const [mode, setMode] = useState<Mode>(preset.agreementId || (!preset.kind && sources.length) ? 'agreement' : 'outline')
  const [agreementId, setAgreementId] = useState(preset.agreementId ?? sources[0]?.id ?? '')
  const [direction, setDirection] = useState<AgreementDirection>(preset.direction ?? 'client')
  const [kind, setKind] = useState<AgreementKind>(preset.kind ?? (direction === 'contractor' ? 'contractor' : 'sow'))
  const [extra, setExtra] = useState<string[]>([])
  const [phrase, setPhrase] = useState('')
  const [choices, setChoices] = useState<Record<string, { as: Choice; label: string }>>({})
  const [file, setFile] = useState<string | null>(null)
  const source = agreementId ? store.agreements?.[agreementId] : undefined
  const found = useMemo(() => { try { return source ? findSpecifics(store, source.id, extra) : [] } catch { return [] } }, [source?.id, source?.updatedAt, extra.join('\n')])
  useEffect(() => {
    setChoices(current => Object.fromEntries(found.map(item => [item.text, current[item.text] ?? { as: item.suggestion.as, label: item.suggestion.as === 'field' ? item.suggestion.label : item.suggestion.as === 'prompt' ? item.suggestion.label : '' }])))
  }, [found])
  const defaultName = source ? `${source.title.replace(/\s*[—–-].*$/, '')} (${partyName(store, source)})` : `${KIND_LABEL[kind]}${direction === 'contractor' && kind !== 'contractor' ? ' for contractors' : ''}`
  const [name, setName] = useState('')
  useEffect(() => { setName('') }, [agreementId, mode, kind])
  useEffect(() => { if (!KINDS_FOR[direction].includes(kind)) setKind(direction === 'contractor' ? 'contractor' : 'sow') }, [direction])
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  const finalName = name.trim() || defaultName
  const becomes = (text: string): Suggestion => {
    const c = choices[text], item = found.find(x => x.text === text)
    if (!c || !item || c.as === 'keep') return { as: 'keep' }
    if (c.as === 'prompt') return { as: 'prompt', label: c.label || 'Describe this' }
    return item.suggestion.as === 'field' ? { ...item.suggestion, label: c.label || item.suggestion.label } : { as: 'field', key: `field${Math.abs([...text].reduce((h, ch) => h * 31 + ch.charCodeAt(0) | 0, 7))}`, label: c.label || text, source: 'ask', type: 'text' }
  }
  const save = () => p.act(async () => {
    if (mode === 'agreement') {
      const made = await invoiceCommands.makeTemplateFromAgreement({ agreementId, name: finalName, choices: found.map(item => ({ text: item.text, becomes: becomes(item.text) })) })
      onMade(made.id)
    } else {
      const made = await invoiceCommands.createOutlineTemplate({ kind, direction, name: finalName })
      onMade(made.id)
      if (mode === 'document' && file) {
        const handed = await askDrawer(`In PureInvoicing, template ${made.id} ("${finalName}", a ${KIND_LABEL[kind].toLowerCase()} ${direction === 'client' ? 'for clients' : 'for contractors'}) was just made from the built-in headings. Read ${file} and rewrite the template in that document's own wording, section by section, with editTemplateSection (add or remove sections to match it). Replace what belongs to one deal with the template's fields ({{party}}, {{fee}}, {{project}} and so on; add asked fields with saveAgreementTemplate if you need new ones) or with [bracketed prompts]. Set milestone shares if the document has a payment schedule. Keep its legal wording exactly; never add terms of your own. Tell me what became fields and prompts.`)
        if (!handed) p.openAssistant()
      }
    }
    onClose()
  }, mode === 'document' ? 'Template made; the assistant is writing it from the document in the drawer.' : 'Template saved in Agreements › Templates.')
  const counts = found.reduce((acc, item) => { const c = choices[item.text]?.as ?? 'keep'; acc[c]++; return acc }, { field: 0, prompt: 0, keep: 0 } as Record<Choice, number>)
  const ready = mode === 'agreement' ? !!source : mode === 'document' ? !!file : true
  return (
    <Scrim onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <Sheet role="dialog" aria-label="Make a template" style={{ width: 'min(1080px, 100%)', height: 'min(760px, calc(100% - 24px))' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 22px 14px', borderBottom: '1px solid var(--d-line)' }}>
          <div><Kicker>Make a template</Kicker><div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', marginTop: 2 }}>{mode === 'agreement' && source ? `From ${source.title.replace(/\s*[—–-].*$/, '')} with ${partyName(store, source)}` : mode === 'document' ? 'From a document' : 'From the built-in headings'}</div></div>
          <span style={{ flex: 1 }} />
          <div role="tablist" aria-label="Start from" style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 999, background: 'var(--d-well)' }}>
            {([['agreement', 'An agreement'], ['document', 'A document'], ['outline', 'Built-in headings']] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={mode === id} disabled={id === 'agreement' && !sources.length} title={id === 'agreement' && !sources.length ? 'No agreement with text yet' : undefined} onClick={() => setMode(id)}
                style={{ height: 30, padding: '0 12px', borderRadius: 999, border: 0, background: mode === id ? 'var(--d-paper)' : 'none', boxShadow: mode === id ? '0 1px 2px rgba(22,32,42,.12)' : 'none', font: 'inherit', fontSize: 12.5, fontWeight: mode === id ? 600 : 500, color: 'var(--d-ink)', cursor: 'pointer' }}>{label}</button>
            ))}
          </div>
          <Btn type="button" $quiet $sm onClick={onClose} aria-label="Close"><Icon.x /></Btn>
        </div>
        {mode === 'agreement' ? (
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
            <div style={{ flex: '1 1 auto', minWidth: 0, padding: '16px 22px', background: 'var(--d-well)', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Meta>Agreement</Meta>
                <Select aria-label="Agreement to make it from" value={agreementId} onChange={event => { setAgreementId(event.target.value); setExtra([]) }} style={{ width: 'auto', maxWidth: 440 }}>
                  {sources.map(a => <option key={a.id} value={a.id}>{a.title} · {partyName(store, a)}{a.numberText ? ` · ${a.numberText}` : ''}</option>)}
                </Select>
              </div>
              <Meta>What stays as your wording, and what becomes a field. Change any of them on the right.</Meta>
              {source ? <Paper>
                <div className="title"><Marked text={source.title} found={found} choices={choices} /></div>
                {source.sections.map(s => <Fragment key={s.id}><div className="heading"><Marked text={s.heading} found={found} choices={choices} /></div>{s.body.split(/\n\s*\n/).map((para, i) => <p key={i}><Marked text={para} found={found} choices={choices} /></p>)}</Fragment>)}
              </Paper> : null}
            </div>
            <aside style={{ flex: '0 0 390px', borderLeft: '1px solid var(--d-line)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{found.length ? `Found ${found.length} thing${found.length === 1 ? '' : 's'} specific to ${source ? partyName(store, source) : 'this deal'}` : 'Nothing specific found'}</div>
              {found.map(item => {
                const c = choices[item.text] ?? { as: 'keep' as Choice, label: '' }
                return (
                  <Item key={item.text} className={c.as}>
                    <div className="top"><b title={item.text}>{item.text}</b>{item.count > 1 ? <Meta>×{item.count}</Meta> : null}<span style={{ flex: 1 }} />
                      <select aria-label={`What ${item.text} becomes`} value={c.as} onChange={event => setChoices({ ...choices, [item.text]: { ...c, as: event.target.value as Choice } })}>
                        <option value="field">{item.suggestion.as === 'field' && item.suggestion.source !== 'ask' ? 'Field, fills itself' : 'Field, asked each time'}</option><option value="prompt">Prompt</option><option value="keep">Keep as written</option>
                      </select>
                    </div>
                    <Meta>{item.why}</Meta>
                    {c.as !== 'keep' ? <input aria-label={c.as === 'field' ? 'Field name' : 'Prompt text'} value={c.label} placeholder={c.as === 'field' ? 'Field name' : 'What to write, e.g. the team or process'} onChange={event => setChoices({ ...choices, [item.text]: { ...c, label: event.target.value } })} /> : null}
                  </Item>
                )
              })}
              <form onSubmit={event => { event.preventDefault(); if (phrase.trim()) { setExtra([...extra, phrase.trim()]); setPhrase('') } }} style={{ display: 'flex', gap: 6 }}>
                <Input value={phrase} placeholder="Another phrase to turn into a prompt" onChange={event => setPhrase(event.target.value)} aria-label="Another phrase to turn into a prompt" />
                <Btn type="submit" $sm disabled={!phrase.trim()}>Add</Btn>
              </form>
              {extra.length && found.length < extra.length ? <Meta style={{ color: 'var(--d-warn-ink)' }}>A phrase you added does not appear in the agreement exactly as typed.</Meta> : null}
              <Meta>{counts.field} field{counts.field === 1 ? '' : 's'}, {counts.prompt} prompt{counts.prompt === 1 ? '' : 's'}; everything else keeps your wording. Milestones become shares of the fee. The agreement itself is not changed.</Meta>
            </aside>
          </div>
        ) : (
          <div style={{ flex: '1 1 auto', minHeight: 0, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, maxWidth: 640 }}>
              <Field><span>For</span><Select value={direction} onChange={event => setDirection(event.target.value as AgreementDirection)}><option value="client">Clients · we do the work</option><option value="contractor">Contractors · they work for us</option></Select></Field>
              <Field><span>Kind</span><Select value={kind} onChange={event => setKind(event.target.value as AgreementKind)}>{KINDS_FOR[direction].map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</Select></Field>
            </div>
            {mode === 'document' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 640 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Btn type="button" disabled={disabled} onClick={() => void chooseDocumentFile().then(path => { if (path) setFile(path) }).catch(() => undefined)}><Icon.file />{file ? 'Choose another…' : 'Choose your document…'}</Btn>
                  {file ? <Mono style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file}>{file.split('/').pop()}</Mono> : <Meta>an agreement you use, your counsel’s draft, a Word or PDF file</Meta>}
                </div>
                <Meta style={{ lineHeight: 1.5 }}>The template opens with the built-in headings, and the assistant rewrites it in the document’s own wording in the drawer, turning names, dates and money into fields and prompts. You review it in the editor before using it.</Meta>
              </div>
            ) : <Meta style={{ maxWidth: 640, lineHeight: 1.5 }}>Headings with [bracketed] prompts and the fields every {KIND_LABEL[kind].toLowerCase()} needs. It opens in the editor for you to write in your own wording.</Meta>}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--d-line)' }}>
          <Field style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: '0 1 460px' }}><span style={{ whiteSpace: 'nowrap' }}>Template name</span><Input value={name} placeholder={defaultName} onChange={event => setName(event.target.value)} /></Field>
          <span style={{ flex: 1 }} />
          <Btn type="button" $quiet onClick={onClose}>Cancel</Btn>
          <Btn type="button" $acc disabled={disabled || !ready} onClick={save}>{mode === 'agreement' ? 'Save template' : 'Make and open it'}</Btn>
        </div>
      </Sheet>
    </Scrim>
  )
}

/** The agreement's text with each found specific marked the way it will be treated. */
function Marked({ text, found, choices }: { text: string; found: { text: string }[]; choices: Record<string, { as: Choice }> }): React.ReactElement {
  const targets = found.map(f => f.text).filter(Boolean).sort((a, b) => b.length - a.length)
  if (!targets.length) return <>{text}</>
  const pattern = new RegExp(`(${targets.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  return <>{text.split(pattern).map((part, i) => {
    const c = choices[part]?.as
    if (!c || !targets.includes(part)) return <Fragment key={i}>{part}</Fragment>
    return <span key={i} className={`mark ${c}`}>{part}</span>
  })}</>
}

const Paper = styled.article`
  padding: 24px 32px; background: #fff; color: #1c242c; border-radius: 4px; box-shadow: 0 1px 6px rgba(22, 32, 42, 0.08);
  font-family: 'Newsreader Variable', 'Source Serif 4', Georgia, serif; font-size: 13.5px; line-height: 1.75;
  .title { font-size: 19px; font-weight: 600; margin-bottom: 6px; } .heading { font-weight: 600; margin-top: 8px; } p { margin: 0 0 6px; white-space: pre-wrap; }
  .mark { padding: 0 3px; border-radius: 4px; }
  .mark.field { background: var(--d-info-bg); color: var(--d-info-ink); }
  .mark.prompt { background: color-mix(in srgb, var(--d-warn-bg) 70%, transparent); border-bottom: 1.5px dashed var(--d-warn-ink); }
  .mark.keep { background: none; box-shadow: inset 0 -1px 0 var(--d-line); }
`
const Item = styled.div`
  display: flex; flex-direction: column; gap: 4px; padding: 9px 10px; border-radius: 10px; border: 1px solid var(--d-line); background: var(--d-paper);
  &.field { border-color: color-mix(in srgb, var(--d-info-ink) 30%, transparent); } &.prompt { border-color: color-mix(in srgb, var(--d-warn-ink) 35%, transparent); } &.keep { opacity: .8; }
  .top { display: flex; align-items: center; gap: 6px; min-width: 0; }
  b { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  select { height: 28px; border: 1px solid var(--d-line); border-radius: 7px; background: var(--d-paper); font: inherit; font-size: 12px; color: var(--d-ink); }
  input { height: 28px; border: 1px solid var(--d-line); border-radius: 7px; padding: 0 8px; font: inherit; font-size: 12.5px; color: var(--d-ink); background: var(--d-paper); }
`
