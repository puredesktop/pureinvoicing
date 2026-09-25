import type { InvoiceProduct } from '../../hooks/useInvoiceProduct'
import { formatMoney } from '../../lib/invoices/money'
import { Icon, longDate } from './bits'
import { Btn, Callout, Chip, Kicker, Meta, Mono, Paper, Scrim, Sheet, Stat } from './deskStyles'

/**
 * The one confirmation: what number it gets, who it is to, what it totals,
 * and every page as it will print. Nothing is assigned until Issue is pressed.
 */
export function IssueSheet({ product: p, disabled }: { product: InvoiceProduct; disabled: boolean }): React.ReactElement | null {
  const confirmation = p.confirmation
  if (!confirmation || !p.selected) return null
  const correction = !!p.selected.correctionOf
  const kind = confirmation.ready ? confirmation.action.kind : correction ? 'publishCorrection' : p.registering ? 'registerHistorical' : 'issue'
  const title = kind === 'publishCorrection' ? 'Publish correction' : kind === 'registerHistorical' ? 'Register past invoice' : 'Issue invoice'
  const verb = kind === 'publishCorrection' ? 'Publish' : kind === 'registerHistorical' ? 'Register' : 'Issue'
  return (
    <Scrim>
      <Sheet role="dialog" aria-label={title}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 22px 14px', borderBottom: '1px solid var(--d-line)' }}>
          <div><Kicker>{title}</Kicker><div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', marginTop: 2 }}>{confirmation.ready ? <>{kind === 'publishCorrection' ? 'Keep' : 'Assign'} <Mono style={{ fontWeight: 500 }}>{confirmation.numberText}</Mono>{kind === 'publishCorrection' ? ' and add a version' : ' and lock this version'}</> : 'Not ready to issue'}</div></div>
          <span style={{ flex: 1 }} />
          <Btn $quiet $sm onClick={p.cancelPublication} aria-label="Cancel review"><Icon.x /></Btn>
        </div>
        {confirmation.ready ? (
          <>
            <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto', minHeight: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                <Stat><span className="l">To</span><span className="v" style={{ fontSize: 14 }} title={confirmation.recipient.address}>{confirmation.recipient.name}</span></Stat>
                <Stat><span className="l">Total due{confirmation.currency ? ` · ${confirmation.currency}` : ''}</span><span className="v">{formatMoney(confirmation.total, confirmation.currency)}</span></Stat>
                <Stat><span className="l">Dated</span><span className="v" style={{ fontSize: 14 }}>{longDate(confirmation.invoiceDate)}</span></Stat>
                <Stat><span className="l">Due</span><span className="v" style={{ fontSize: 14 }}>{longDate(confirmation.dueDate)}</span></Stat>
              </div>
              <Meta>{confirmation.recipient.address.split('\n').join(' · ')}</Meta>
              {kind === 'issue' ? <Callout><Icon.clock /><span><b>The number is final once you confirm.</b> Later edits become a same-number correction with a change note; this PDF stays as version 1. Sequence after this: {confirmation.sequenceImpact.after}.</span></Callout> : null}
              {kind === 'publishCorrection' && confirmation.correctionDifferences ? (
                <Callout $tone="warn"><Icon.warn /><span><b>Change note: {confirmation.action.kind === 'publishCorrection' ? confirmation.action.changeNote : ''}</b><br />Before: {confirmation.correctionDifferences.before.recipient.name} · {longDate(confirmation.correctionDifferences.before.invoiceDate)} · due {longDate(confirmation.correctionDifferences.before.dueDate)} · {formatMoney(confirmation.correctionDifferences.before.total, confirmation.correctionDifferences.before.currency)}<br />After: {confirmation.correctionDifferences.after.recipient.name} · {longDate(confirmation.correctionDifferences.after.invoiceDate)} · due {longDate(confirmation.correctionDifferences.after.dueDate)} · {formatMoney(confirmation.correctionDifferences.after.total, confirmation.correctionDifferences.after.currency)}<br />{confirmation.correctionDifferences.warning}</span></Callout>
              ) : null}
              {kind === 'registerHistorical' ? (
                <Callout $tone="info"><Icon.info /><span><b>Registered with its original number.</b> Next proposed number {confirmation.sequenceImpact.before} → {confirmation.sequenceImpact.after}{confirmation.sequenceImpact.after > confirmation.sequenceImpact.before ? '; earlier gaps are not filled automatically' : '; the next number is unchanged'}. {confirmation.historicalReferenceProvenance ? `Unverified original PDF attached: ${p.historicalAsset?.name ?? ''}.` : 'No original PDF attached.'} Entered contents were not extracted from or checked against it.</span></Callout>
              ) : null}
              <div>
                <Kicker style={{ display: 'block', marginBottom: 8 }}>Every page, checked</Kicker>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {confirmation.preview.pages.map(page => (
                    <div key={page.pageNumber} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                      <Paper style={{ width: 150 }}>{page.imageDataUrl ? <img src={page.imageDataUrl} alt={`Page ${page.pageNumber}`} /> : <div style={{ height: 200 }} />}</Paper>
                      <Meta>Page {page.pageNumber}</Meta>
                    </div>
                  ))}
                  <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, paddingTop: 4 }}>
                    {['Nothing clipped, totals kept together', 'Footer clears the content on every page', 'Every character in the chosen typeface', 'Sender, recipient, dates, currency and lines present'].map(text => <div key={text} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Chip $tone="ok">✓</Chip>{text}</div>)}
                    <Meta style={{ marginTop: 4 }}>The PDF is rendered from these exact pages. Any change after this reopens the draft.</Meta>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--d-line)' }}>
              <Meta>{kind === 'registerHistorical' ? 'No PDF is produced for a registered invoice.' : 'After this, a folder picker saves the PDF.'}{p.dirty ? ' Unsaved edits: save before confirming.' : ''}</Meta>
              <span style={{ flex: 1 }} />
              <Btn onClick={p.cancelPublication}>Back to draft</Btn>
              <Btn $acc style={{ height: 34, padding: '0 16px' }} disabled={disabled || p.dirty} onClick={p.finalize}>{verb} {confirmation.numberText}</Btn>
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Meta>Fix these first. Everything you entered is kept.</Meta>
              {(confirmation.diagnostics ?? []).map((d, i) => <Callout key={i} $tone={d.field.startsWith('presentation.') ? 'warn' : 'bad'}><Icon.warn /><span>{d.message}<Meta> · {d.field.replace('presentation.', 'appearance: ')}</Meta></span></Callout>)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 22px', borderTop: '1px solid var(--d-line)' }}><Btn onClick={p.cancelPublication}>Back to draft</Btn></div>
          </>
        )}
      </Sheet>
    </Scrim>
  )
}
