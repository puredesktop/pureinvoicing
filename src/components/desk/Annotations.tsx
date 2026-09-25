import { useEffect, useRef, useState } from 'react'
import { styled } from 'styled-components'
import { DOCUMENT_KINDS, documentKindLabel } from '../../lib/invoices/annotations'
import type { InvoiceNote, LinkedDocument } from '../../lib/invoices/types'
import { Icon, shortDate } from './bits'
import { Btn, Kicker, Meta, Mono, Scrim, Select, Sheet } from './deskStyles'

type NoteChange = { done?: boolean; text?: string; remove?: boolean }

/**
 * Working notes on an invoice: open ones first, ticked-off ones folded away.
 * Enter adds a note; the round box ticks one off.
 */
export function NotesList({ notes, disabled, onAdd, onUpdate, autoFocus }: { notes: InvoiceNote[]; disabled: boolean; onAdd: (text: string) => void; onUpdate: (noteId: string, change: NoteChange) => void; autoFocus?: boolean }): React.ReactElement {
  const [draft, setDraft] = useState('')
  const [showDone, setShowDone] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) input.current?.focus() }, [autoFocus])
  const open = notes.filter(n => !n.doneAt), done = notes.filter(n => n.doneAt)
  const add = () => { if (!draft.trim()) return; onAdd(draft); setDraft('') }
  const row = (note: InvoiceNote) => (
    <li key={note.id} className={note.doneAt ? 'done' : undefined}>
      <button type="button" className="tick" role="checkbox" aria-checked={!!note.doneAt} aria-label={note.doneAt ? 'Mark not done' : 'Mark done'} disabled={disabled} onClick={() => onUpdate(note.id, { done: !note.doneAt })}>{note.doneAt ? <Icon.check /> : null}</button>
      <div className="body"><span>{note.text}</span><small>{note.doneAt ? `done ${shortDate(note.doneAt.slice(0, 10))}` : shortDate(note.at.slice(0, 10))}</small></div>
      <button type="button" className="rm" aria-label="Remove note" title="Remove note" disabled={disabled} onClick={() => onUpdate(note.id, { remove: true })}><Icon.x /></button>
    </li>
  )
  return (
    <Notes>
      {open.length ? <ul>{open.map(row)}</ul> : null}
      <form className="add" onSubmit={event => { event.preventDefault(); add() }}>
        <input ref={input} id="invoice-note" value={draft} placeholder={open.length ? 'Add another note' : 'Add a note, e.g. send the corrected PDF'} onChange={event => setDraft(event.target.value)} disabled={disabled} aria-label="New note" />
        <Btn type="submit" $sm disabled={disabled || !draft.trim()}>Add</Btn>
      </form>
      {done.length ? <>
        <button type="button" className="fold" aria-expanded={showDone} onClick={() => setShowDone(v => !v)}>{showDone ? 'Hide' : 'Show'} {done.length} done</button>
        {showDone ? <ul>{done.map(row)}</ul> : null}
      </> : null}
    </Notes>
  )
}

/** The notes of one invoice in a small sheet, opened from the invoice list. */
export function NotesDialog({ title, subtitle, notes, disabled, onAdd, onUpdate, onClose }: { title: string; subtitle: string; notes: InvoiceNote[]; disabled: boolean; onAdd: (text: string) => void; onUpdate: (noteId: string, change: NoteChange) => void; onClose: () => void }): React.ReactElement {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <Scrim onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <Sheet role="dialog" aria-label={`Notes on ${title}`} style={{ width: 'min(460px, 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 22px 14px', borderBottom: '1px solid var(--d-line)' }}>
          <div style={{ minWidth: 0 }}><Kicker>Notes</Kicker><div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}><Mono style={{ fontWeight: 500 }}>{title}</Mono></div><Meta>{subtitle} · never printed</Meta></div>
          <span style={{ flex: 1 }} />
          <Btn type="button" $quiet $sm onClick={onClose} aria-label="Close"><Icon.x /></Btn>
        </div>
        <div style={{ padding: '14px 22px 18px' }}><NotesList notes={notes} disabled={disabled} onAdd={onAdd} onUpdate={onUpdate} autoFocus /></div>
      </Sheet>
    </Scrim>
  )
}

/**
 * Contracts, SOWs and other agreements linked by path. Clicking one opens it;
 * the × unlinks it (the file stays). On an invoice, the client's documents are
 * listed too and marked as the client's.
 */
export function DocumentsList({ documents, disabled, onLink, onOpen, onUnlink, empty }: {
  documents: (LinkedDocument & { from?: 'invoice' | 'client' })[]
  disabled: boolean
  onLink: (kind: LinkedDocument['kind']) => void
  onOpen: (doc: LinkedDocument) => void
  /** Only documents linked here can be unlinked here; a client's documents are unlinked on the client. */
  onUnlink: (doc: LinkedDocument) => void
  empty: string
}): React.ReactElement {
  const [kind, setKind] = useState<LinkedDocument['kind']>('contract')
  return (
    <Docs>
      {documents.length ? (
        <ul>
          {documents.map(doc => (
            <li key={doc.id}>
              <button type="button" className="open" title={doc.path} onClick={() => onOpen(doc)} disabled={disabled}>
                <Icon.file /><span className="name">{doc.name}</span>
                <span className="kind">{documentKindLabel(doc.kind)}{doc.from === 'client' ? ' · client' : ''}</span>
              </button>
              {doc.from === 'client' ? null : <button type="button" className="rm" aria-label={`Unlink ${doc.name}`} title="Unlink (the file is kept)" disabled={disabled} onClick={() => onUnlink(doc)}><Icon.x /></button>}
            </li>
          ))}
        </ul>
      ) : <Meta>{empty}</Meta>}
      <div className="link">
        <Select aria-label="Kind of document" value={kind} onChange={event => setKind(event.target.value as LinkedDocument['kind'])} style={{ width: 'auto', height: 28 }}>
          {DOCUMENT_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
        </Select>
        <Btn type="button" $sm disabled={disabled} onClick={() => onLink(kind)}><Icon.plus />Link a file…</Btn>
      </div>
    </Docs>
  )
}

const Notes = styled.div`
  display: flex; flex-direction: column; gap: 8px;
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  li { display: flex; align-items: flex-start; gap: 10px; padding: 6px 4px; border-radius: 8px; }
  li:hover { background: var(--d-well); }
  .tick { flex: 0 0 18px; width: 18px; height: 18px; margin-top: 1px; border-radius: 999px; border: 1.5px solid var(--d-faint); background: none; padding: 0; display: grid; place-items: center; cursor: pointer; color: var(--d-paper); }
  .tick:hover { border-color: var(--d-acc); }
  .tick svg { width: 11px; height: 11px; }
  li.done .tick { background: var(--d-ok-ink); border-color: var(--d-ok-ink); }
  .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .body span { font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
  .body small { font-size: 11px; color: var(--d-faint); }
  li.done .body span { color: var(--d-muted); text-decoration: line-through; text-decoration-color: var(--d-faint); }
  .rm { border: 0; background: none; color: var(--d-faint); cursor: pointer; padding: 2px; border-radius: 6px; opacity: 0; }
  li:hover .rm, .rm:focus-visible { opacity: 1; }
  .rm svg { width: 13px; height: 13px; }
  .add { display: flex; gap: 6px; }
  .add input { flex: 1; min-width: 0; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--d-line); background: var(--d-paper); color: var(--d-ink); font: inherit; font-size: 13px; }
  .add input:focus { outline: none; border-color: var(--d-acc); box-shadow: 0 0 0 3px var(--d-acc-soft); }
  .fold { align-self: flex-start; border: 0; background: none; padding: 2px 4px; color: var(--d-muted); font: inherit; font-size: 12px; cursor: pointer; }
`
const Docs = styled.div`
  display: flex; flex-direction: column; gap: 8px;
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  li { display: flex; align-items: center; gap: 4px; border-radius: 8px; }
  li:hover { background: var(--d-well); }
  .open { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; border: 0; background: none; padding: 6px 4px; color: var(--d-ink); font: inherit; text-align: left; cursor: pointer; }
  .open svg { flex: 0 0 auto; color: var(--d-muted); }
  .name { flex: 1; min-width: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .open:hover .name { color: var(--d-acc-ink, var(--d-acc)); text-decoration: underline; text-underline-offset: 2px; }
  .kind { flex: 0 0 auto; font-size: 11px; color: var(--d-muted); }
  .rm { border: 0; background: none; color: var(--d-faint); cursor: pointer; padding: 4px; border-radius: 6px; opacity: 0; }
  li:hover .rm, .rm:focus-visible { opacity: 1; }
  .rm svg { width: 13px; height: 13px; }
  .link { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
`
