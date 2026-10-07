import { useEffect, useState } from 'react'
import type { InvoiceProduct } from '../../hooks/useInvoiceProduct'
import { LIBRARY_KINDS, libraryExcerpt, libraryKindLabel, libraryRows } from '../../lib/invoices/library'
import type { InvoiceStore, LibraryDocument, LibraryKind } from '../../lib/invoices/types'
import { Icon, shortDate } from './bits'
import { Area, Body, Btn, Callout, Card, Chip, Field, Hint, Input, Meta, Panel, Rail, RailRow, SearchBox, Sec, SecHead, Select } from './deskStyles'

/**
 * The library: documents kept for invoicing (a client's invoice rules, a
 * process, a template, tax guidance), each a retained copy with its words
 * read once so the assistant can use them when it formats an invoice.
 * Filters by kind on the left, the documents in the middle, the chosen one
 * on the right: what it is, whose it is, its notes, and its words.
 */
export function LibraryView({ product: p, store, disabled }: { product: InvoiceProduct; store: InvoiceStore; disabled: boolean }): React.ReactElement {
  const [kind, setKind] = useState<LibraryKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const all = Object.values(store.library ?? {})
  const rows = libraryRows(store, { kind, query })
  const selected = p.selectedLibraryId && store.library?.[p.selectedLibraryId] ? store.library[p.selectedLibraryId] : null
  const clients = Object.values(store.clients).sort((a, b) => a.name.localeCompare(b.name))
  const count = (k: LibraryKind) => all.filter(d => d.kind === k).length
  return (
    <Body>
      <Rail aria-label="Kinds of document">
        <RailRow $on={kind === 'all'} onClick={() => setKind('all')}><span className="name">All documents</span><small>{all.length}</small></RailRow>
        {LIBRARY_KINDS.map(k => <RailRow key={k.id} $on={kind === k.id} onClick={() => setKind(k.id)} title={k.does}><span className="name">{k.label}</span><small>{count(k.id)}</small></RailRow>)}
      </Rail>
      <Panel style={{ flex: '0 0 380px', overflow: 'hidden' }}>
        <div style={{ padding: '12px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <SearchBox style={{ minWidth: 0, flex: 1 }}><Icon.search /><input placeholder="Search the library" value={query} onChange={e => setQuery(e.target.value)} /></SearchBox>
          <Btn $acc $sm disabled={disabled || adding} onClick={() => setAdding(true)}><Icon.plus />Document</Btn>
        </div>
        <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '0 10px 10px' }}>
          {adding ? <AddSheet clients={clients} disabled={disabled} onAdd={input => { setAdding(false); p.addLibraryDocument(input) }} onCancel={() => setAdding(false)} /> : null}
          {rows.map(d => (
            <Card key={d.id} role="button" tabIndex={0} style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', ...(d.id === selected?.id ? { borderColor: 'var(--d-acc)', boxShadow: '0 0 0 3px var(--d-acc-soft)' } : {}) }}
              onClick={() => p.openLibraryDocument(d.id)} onKeyDown={e => { if (e.key === 'Enter') p.openLibraryDocument(d.id) }}>
              <Icon.file />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                <Hint>{[libraryKindLabel(d.kind), d.clientId ? store.clients[d.clientId]?.name : null, shortDate(d.updatedAt.slice(0, 10))].filter(Boolean).join(' · ')}</Hint>
              </div>
              {!d.text ? <Chip $tone="warn" title="No words could be read from this file">no text</Chip> : null}
            </Card>
          ))}
          {!rows.length && !adding ? <Meta style={{ padding: '10px 4px' }}>{query || kind !== 'all' ? 'Nothing matches.' : 'Nothing kept yet. A client’s invoice rules, your own process, a template to follow: keep them here and the assistant reads them when it formats an invoice.'}</Meta> : null}
        </div>
      </Panel>
      <Panel $strong style={{ flex: '1 1 auto', overflow: 'auto' }}>
        {selected ? <DocumentPage key={selected.id} document={selected} store={store} product={p} disabled={disabled} /> : (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 240 }}><Meta>Choose a document, or keep a new one.</Meta></div>
        )}
      </Panel>
    </Body>
  )
}

function AddSheet({ clients, disabled, onAdd, onCancel }: { clients: InvoiceStore['clients'][string][]; disabled: boolean; onAdd: (input: { title?: string; kind?: LibraryKind; clientId?: string; notes?: string }) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<LibraryKind>('invoice-rules')
  const [clientId, setClientId] = useState('')
  const [title, setTitle] = useState('')
  return (
    <Card style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <b>Keep a document</b>
      <Field><span>What it is</span><Select value={kind} onChange={e => setKind(e.target.value as LibraryKind)}>{LIBRARY_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</Select></Field>
      <Hint>{LIBRARY_KINDS.find(k => k.id === kind)?.does}</Hint>
      <Field><span>Whose</span><Select value={clientId} onChange={e => setClientId(e.target.value)}><option value="">Everyone’s</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      <Field><span>Title</span><Input value={title} placeholder="The file’s name unless you give one" onChange={e => setTitle(e.target.value)} /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn $acc $sm disabled={disabled} onClick={() => onAdd({ kind, clientId: clientId || undefined, title: title.trim() || undefined })}><Icon.plus />Choose the file…</Btn>
        <Btn $quiet $sm onClick={onCancel}>Cancel</Btn>
      </div>
    </Card>
  )
}

function DocumentPage({ document: d, store, product: p, disabled }: { document: LibraryDocument; store: InvoiceStore; product: InvoiceProduct; disabled: boolean }) {
  const [title, setTitle] = useState(d.title)
  const [notes, setNotes] = useState(d.notes ?? '')
  useEffect(() => { setTitle(d.title); setNotes(d.notes ?? '') }, [d.id, d.title, d.notes])
  const clients = Object.values(store.clients).sort((a, b) => a.name.localeCompare(b.name))
  const excerpt = libraryExcerpt(d, 20_000)
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <Sec>
        <SecHead>
          <Input value={title} style={{ fontWeight: 700, fontSize: 16, flex: 1 }} onChange={e => setTitle(e.target.value)} onBlur={() => { if (title.trim() && title.trim() !== d.title) p.updateLibraryDocument(d.id, { title }) }} aria-label="Title" />
          <Btn $sm disabled={disabled} onClick={() => p.openLibraryFile(d.id)} title="Opens the kept copy in its own window"><Icon.file />Open</Btn>
          <Btn $quiet $sm disabled={disabled} onClick={() => setConfirming(true)} title="Takes it out of the library"><Icon.trash />Remove</Btn>
        </SecHead>
        {confirming ? <Callout $tone="warn" style={{ alignItems: 'center' }}><span>Take <b>{d.title}</b> out of the library? The kept copy stays on disk.</span><span className="sp" /><Btn $danger $sm onClick={() => p.removeLibraryDocument(d.id)}>Remove</Btn><Btn $quiet $sm onClick={() => setConfirming(false)}>Keep</Btn></Callout> : null}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field style={{ width: 200 }}><span>What it is</span><Select value={d.kind} disabled={disabled} onChange={e => p.updateLibraryDocument(d.id, { kind: e.target.value as LibraryKind })}>{LIBRARY_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</Select></Field>
          <Field style={{ width: 240 }}><span>Whose</span><Select value={d.clientId ?? ''} disabled={disabled} onChange={e => p.updateLibraryDocument(d.id, { clientId: e.target.value || null })}><option value="">Everyone’s</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        </div>
        <Meta>{d.fileName} · {d.mimeType} · kept {shortDate(d.addedAt.slice(0, 10))}{d.text ? ` · ${d.text.length.toLocaleString()} characters read` : ''}</Meta>
      </Sec>
      <Sec>
        <SecHead><h3>Notes</h3><span className="sp" /><Meta>for you and the assistant</Meta></SecHead>
        <Area rows={3} value={notes} placeholder="What to remember about it: which invoices it applies to, what matters most." disabled={disabled} onChange={e => setNotes(e.target.value)} onBlur={() => { if (notes.trim() !== (d.notes ?? '')) p.updateLibraryDocument(d.id, { notes: notes.trim() || null }) }} />
      </Sec>
      <Sec>
        <SecHead><h3>Its words</h3><span className="sp" /><Meta>{d.text ? 'as read when it was kept' : 'none could be read'}</Meta></SecHead>
        {d.text ? <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit', fontSize: 13, lineHeight: 1.5, color: 'var(--d-ink)' }}>{excerpt.text}</pre>
          : <Callout $tone="info"><Icon.info /><span>This file has no text that can be read here (a scan, or a picture). Open it to read it; the assistant cannot.</span></Callout>}
      </Sec>
    </>
  )
}
