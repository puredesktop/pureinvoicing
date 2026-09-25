import { useEffect, useState } from 'react'
import type { InvoiceProduct } from '../../hooks/useInvoiceProduct'
import { calculateInvoice } from '../../lib/invoices/calculations'
import { invoiceStanding, termsLabel } from '../../lib/invoices/lifecycle'
import { formatMoney } from '../../lib/invoices/money'
import type { InvoiceStore } from '../../lib/invoices/types'
import { Icon, Money, StandingChip, longDate, shortDate } from './bits'
import { Body, Btn, Callout, Card, Chip, Field, Hint, Input, Main, Meta, Mono, Panel, Sec, SecHead, Timeline, TimelineItem, TopBar } from './deskStyles'
import { PreviewPane } from './PreviewPane'
import { PaymentDialog } from './PaymentDialog'
import { DocumentsList, NotesList } from './Annotations'
import { invoiceDocuments } from '../../lib/invoices/annotations'

/** An issued invoice: the document first, and beside it where it stands, its versions and what to do next. */
export function IssuedView({ product: p, store, disabled }: { product: InvoiceProduct; store: InvoiceStore; disabled: boolean }): React.ReactElement | null {
  const invoice = p.issued, version = p.version
  const [marking, setMarking] = useState<'sent' | null>(null)
  const [paying, setPaying] = useState(false)
  const [markDate, setMarkDate] = useState('')
  const [markExtra, setMarkExtra] = useState('')
  useEffect(() => { if (invoice && !p.preview && !p.busy) void p.preparePreview() }, [invoice?.id, version?.id])
  if (!invoice || !version) return null
  const c = version.content, superseded = version.id !== invoice.currentVersionId, calculation = calculateInvoice(c)
  const standing = invoiceStanding(invoice)
  const correction = Object.values(store.drafts).find(draft => draft.correctionOf === invoice.id)
  const source = invoice.source && store.invoices[invoice.source.invoiceId]
  const label = p.label
  const versionIndex = invoice.versions.findIndex(candidate => candidate.id === version.id) + 1
  const submitMark = () => {
    if (!marking) return
    const at = markDate || undefined
    void p.markInvoice({ kind: 'sent', at, to: markExtra || undefined })
    setMarking(null); setMarkDate(''); setMarkExtra('')
  }
  return (
    <>
      {paying ? <PaymentDialog target={{ id: invoice.id, numberText: label, client: c.recipient.name || 'Unnamed client', total: calculation.total, currency: c.currency ?? undefined, dueDate: standing.dueDate ?? undefined, marks: invoice.marks }} disabled={disabled} onSave={(request, id) => void p.markInvoice(request, id)} onClose={() => setPaying(false)} /> : null}
      <TopBar as="div" style={{ height: 44, borderTop: '1px solid var(--d-line)', background: 'transparent', backdropFilter: 'none' }}>
        <Mono style={{ fontSize: 14, fontWeight: 500 }}>{label}</Mono>
        <StandingChip mark={standing.mark} daysOverdue={standing.daysOverdue} paidAt={invoice.marks?.paidAt} sentAt={invoice.marks?.sentAt} />
        <Chip>{superseded ? `Superseded · v${versionIndex}` : `Issued ${shortDate(version.issuedAt.slice(0, 10))} · v${versionIndex}`}</Chip>
        {invoice.historical ? <Chip $tone="info">Historical</Chip> : null}
        <span style={{ flex: 1 }} />
        {!superseded && standing.mark !== 'paid' ? <Btn disabled={disabled} onClick={() => setPaying(true)}>Mark paid</Btn> : null}
        {!superseded && !invoice.marks?.sentAt ? <Btn disabled={disabled} onClick={() => setMarking('sent')}>Mark sent</Btn> : null}
        {!superseded ? <Btn disabled={disabled || !!correction} onClick={p.startCorrection} title="Same number, new version with a change note">Correct…</Btn> : null}
        <Btn $acc disabled={disabled} onClick={() => p.download({ kind: 'downloadVersion', versionId: version.id })}><Icon.download />{superseded ? 'Download superseded PDF' : 'Download PDF'}</Btn>
      </TopBar>
      <Body>
        <Main>
          {marking ? (
            <Callout style={{ alignItems: 'center', gap: 10 }}>
              <span><b>Mark {marking}</b></span>
              <Field style={{ width: 160 }}><span>Date</span><Input type="date" value={markDate} onChange={event => setMarkDate(event.target.value)} /></Field>
              <Field style={{ flex: 1 }}><span>Sent to</span><Input value={markExtra} placeholder={c.recipient.email ?? 'who received it'} onChange={event => setMarkExtra(event.target.value)} /></Field>
              <Btn $acc $sm onClick={submitMark}>Save mark</Btn>
              <Btn $quiet $sm onClick={() => setMarking(null)}>Cancel</Btn>
            </Callout>
          ) : null}
          {correction ? <Callout $tone="warn" style={{ alignItems: 'center' }}><Icon.info /><span><b>A correction is in progress.</b> The issued PDF stays as it is until you publish it.</span><span className="sp" /><Btn $sm disabled={disabled} onClick={() => p.openInvoice(correction.id)}>Continue correction</Btn></Callout> : null}
          {superseded ? <Callout $tone="info"><Icon.info /><span><b>Superseded version.</b> Kept for reference; downloading it never makes it current.{version.changeNote ? ` Replaced with the note: ${version.changeNote}` : ''}</span></Callout> : null}
          <PreviewPane pages={p.preview?.pages ?? null} diagnostics={p.preview?.diagnostics.filter(d => !d.field.startsWith('pages.')) ?? []} rendering={!p.preview && p.busy} caption="the PDF as issued" onRefresh={p.preparePreview} emptyText="Rendering the issued pages…" />
        </Main>
        <Panel $strong style={{ flex: '0 0 380px', overflow: 'auto' }}>
          <Sec>
            <SecHead><h3>Where it stands</h3><span className="sp" /><Meta>{standing.mark === 'paid' ? 'settled' : `${formatMoney(calculation.total, c.currency)} open`}</Meta></SecHead>
            <Timeline>
              <TimelineItem><span className="k"><i /><s /></span><div><b>{invoice.historical ? 'Registered' : 'Issued'}</b> · version {invoice.versions.length}{invoice.versions.length > 1 ? ' current' : ''}<div className="w">{longDate(invoice.versions[invoice.versions.length - 1].issuedAt.slice(0, 10))}{p.availability ? p.availability.available ? ' · PDF retained' : ' · PDF not yet retained' : ''}</div></div></TimelineItem>
              <TimelineItem $tone={invoice.marks?.sentAt ? 'info' : 'neutral'} $pending={!invoice.marks?.sentAt}><span className="k"><i /><s /></span><div>{invoice.marks?.sentAt ? <><b>Sent</b>{invoice.marks.sentTo ? ` to ${invoice.marks.sentTo}` : ''}<div className="w">{longDate(invoice.marks.sentAt)}<button style={{ marginLeft: 8, border: 0, background: 'none', color: 'var(--d-muted)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }} disabled={disabled} onClick={() => p.markInvoice({ kind: 'clear', which: 'sent' })}>clear</button></div></> : <><Meta>Sent</Meta><div className="w">Mark it when it goes out.</div></>}</div></TimelineItem>
              <TimelineItem $tone={standing.mark === 'overdue' ? 'bad' : standing.mark === 'paid' ? 'ok' : 'neutral'}><span className="k"><i /><s /></span><div><b style={{ color: standing.mark === 'overdue' ? 'var(--d-bad-ink)' : undefined }}>Due {longDate(c.dueDate)}</b>{c.termsDays !== null && c.termsDays !== undefined ? ` · ${termsLabel(c.termsDays)}` : ''}<div className="w">{standing.mark === 'overdue' ? `${standing.daysOverdue} day${standing.daysOverdue === 1 ? '' : 's'} overdue` : standing.mark === 'paid' ? 'Settled' : standing.daysUntilDue === null ? 'No due date' : standing.daysUntilDue === 0 ? 'Due today' : `Due in ${standing.daysUntilDue} day${standing.daysUntilDue === 1 ? '' : 's'}`}</div></div></TimelineItem>
              <TimelineItem $last $tone={invoice.marks?.paidAt ? 'ok' : 'neutral'} $pending={!invoice.marks?.paidAt}><span className="k"><i /></span><div>{invoice.marks?.paidAt ? <><b>Paid</b>{invoice.marks.paidReference ? ` · ${invoice.marks.paidReference}` : ''}<div className="w">{longDate(invoice.marks.paidAt)}<button style={{ marginLeft: 8, border: 0, background: 'none', color: 'var(--d-muted)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }} disabled={disabled} onClick={() => setPaying(true)}>edit</button></div>{invoice.marks.paidNote ? <div className="w" style={{ whiteSpace: 'pre-wrap' }}>{invoice.marks.paidNote}</div> : null}</> : <><Meta>Paid</Meta><div className="w">Mark it when the money lands; add a date and reference.</div></>}</div></TimelineItem>
            </Timeline>
          </Sec>
          <Sec>
            <SecHead><h3>Notes</h3><span className="sp" /><Meta>never printed</Meta></SecHead>
            <NotesList notes={invoice.notes ?? []} disabled={disabled} onAdd={text => p.addNote(invoice.id, text)} onUpdate={(noteId, change) => p.updateNote(invoice.id, noteId, change)} />
          </Sec>
          {(() => {
            const under = Object.values(store.agreements ?? {}).filter(x => x.invoiceIds.includes(invoice.id) || x.milestones.some(m => m.invoiceId === invoice.id))
            return under.length ? <Sec>
              <SecHead><h3>Billed against</h3></SecHead>
              {under.map(x => <Btn key={x.id} $sm style={{ alignSelf: 'flex-start' }} onClick={() => p.openAgreement(x.id)}>{x.title}{x.numberText ? ` · ${x.numberText}` : ''}{(() => { const m = x.milestones.find(y => y.invoiceId === invoice.id); return m ? ` · ${m.label}` : '' })()}</Btn>)}
            </Sec> : null
          })()}
          <Sec>
            <SecHead><h3>Documents</h3><span className="sp" /><Meta>contracts, SOWs, POs</Meta></SecHead>
            <DocumentsList documents={invoiceDocuments(store, invoice)} disabled={disabled} empty="Nothing linked. Link the contract or SOW this invoice bills against; the client’s documents show here too."
              onLink={kind => p.linkDocument({ invoiceId: invoice.id }, kind)} onOpen={doc => p.openDocument(doc.path, doc.name)} onUnlink={doc => p.unlinkDocument({ invoiceId: invoice.id }, doc.id)} />
          </Sec>
          <Sec>
            <SecHead><h3>Versions</h3><span className="sp" /><Meta>{invoice.versions.length}</Meta></SecHead>
            {invoice.versions.map((candidate, i) => (
              <Card key={candidate.id} style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderColor: candidate.id === version.id ? 'var(--d-acc)' : undefined }} onClick={() => p.selectVersion(candidate.id)}>
                <Chip $tone={candidate.id === invoice.currentVersionId ? 'acc' : 'neutral'}>{candidate.id === invoice.currentVersionId ? 'Current' : 'Superseded'}</Chip>
                <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 600 }}>Version {i + 1}</div><Hint>{shortDate(candidate.issuedAt.slice(0, 10))} · {formatMoney(calculateInvoice(candidate.content).total, candidate.content.currency)}{candidate.changeNote ? ` · ${candidate.changeNote}` : ''}</Hint></div>
                <Btn $quiet $sm disabled={disabled} onClick={event => { event.stopPropagation(); void p.download({ kind: 'downloadVersion', versionId: candidate.id }) }}>PDF</Btn>
              </Card>
            ))}
            <Hint>A correction keeps this number and adds a version with a change note. Earlier versions stay downloadable, labelled superseded.</Hint>
          </Sec>
          <Sec>
            <SecHead><h3>Do next</h3></SecHead>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Btn disabled={disabled} onClick={p.copyInvoice}>New invoice from this</Btn>
              {!superseded ? <Btn disabled={disabled} onClick={() => p.download({ kind: 'reissue' })} title="The same PDF again; records a reissue, claims no delivery">Reissue same PDF</Btn> : null}
              <Btn disabled={disabled} onClick={p.openAssistant} title="Ask the assistant to draft a reminder or a cover mail with this PDF">Ask the assistant</Btn>
              {invoice.historical ? <Btn disabled={disabled} onClick={p.importHistoricalPdf}>{invoice.historicalPdf ? 'Replace original PDF' : 'Attach original PDF'}</Btn> : null}
            </div>
            {invoice.historical ? (
              <Callout $tone="info"><Icon.info /><span><b>Historical record.</b> Entered by hand and not checked against an original.{invoice.historicalPdf ? <> Original attached as an unverified reference: {store.assets[invoice.historicalPdf.assetId]?.name}. <button style={{ border: 0, background: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }} disabled={disabled} onClick={() => p.download({ kind: 'downloadHistoricalReference' })}>Download original</button> · <button style={{ border: 0, background: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }} disabled={disabled} onClick={p.removeHistoricalPdf}>Remove reference</button></> : ' No original PDF attached.'}</span></Callout>
            ) : null}
          </Sec>
          <Sec style={{ flex: '1 1 auto' }}>
            <SecHead><h3>Details</h3></SecHead>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 12.5 }}>
              <Meta>Client</Meta><span>{c.recipient.name}{c.clientId && store.clients[c.clientId] ? <> · <button style={{ border: 0, background: 'none', color: 'var(--d-acc-ink)', cursor: 'pointer', font: 'inherit' }} onClick={() => p.selectClient(c.clientId!)}>directory</button></> : null}</span>
              {c.reference ? <><Meta>Reference</Meta><span>{c.reference}</span></> : null}
              <Meta>Dated</Meta><span>{longDate(c.invoiceDate)}</span>
              <Meta>Lines</Meta><span>{c.lineItems.length} · <Money amount={calculation.total} currency={c.currency} /></span>
              {source ? <><Meta>Source</Meta><span><button style={{ border: 0, background: 'none', color: 'var(--d-acc-ink)', cursor: 'pointer', font: 'inherit' }} onClick={() => p.openInvoice(source.id, undefined, invoice.source?.versionId)}>Copied from {p.labelFor(source.id)}</button></span></> : null}
              <Meta>History</Meta><span>{[...invoice.history].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6).map(entry => <div key={entry.id}><Hint>{shortDate(entry.at.slice(0, 10))}</Hint> {historyWords(entry.kind)}{entry.note ? <Hint> · {entry.note}</Hint> : null}</div>)}</span>
            </div>
          </Sec>
        </Panel>
      </Body>
    </>
  )
}

function historyWords(kind: string): string {
  return ({ issued: 'Issued', corrected: 'Correction published', reissued: 'PDF reissued', historical: 'Registered as historical', referenceChanged: 'Original reference changed', sent: 'Marked sent', paid: 'Marked paid', unmarked: 'Mark cleared' } as Record<string, string>)[kind] ?? kind
}
