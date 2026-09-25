import { useState } from 'react'
import type { InvoiceProduct } from '../../hooks/useInvoiceProduct'
import { IMPORT_FORMAT, importTemplate } from '../../lib/invoices/importFormat'
import { formatMoney } from '../../lib/invoices/money'
import { Icon, shortDate } from './bits'
import { Area, Btn, Callout, Chip, Hint, Kicker, List, Meta, Mono, Scrim, Sheet, Stat, Switch } from './deskStyles'

/**
 * Bulk import: one file in, one preview, one confirmation. Every row shows
 * what it becomes; nothing is written until Import is pressed.
 */
export function ImportSheet({ product: p, disabled }: { product: InvoiceProduct; disabled: boolean }): React.ReactElement | null {
  const [pasted, setPasted] = useState('')
  const [skipConflicts, setSkipConflicts] = useState(false)
  if (!p.importOpen) return null
  const preview = p.importPreview
  const plan = preview?.plan ?? null
  const readPasted = () => { try { void p.previewImport({ document: JSON.parse(pasted) }, skipConflicts) } catch { void p.previewImport({ document: pasted }, skipConflicts) } }
  const reSkip = (value: boolean) => { setSkipConflicts(value); if (preview) void p.previewImport(preview.source, value) }
  const sourceWords = preview ? ('path' in preview.source ? preview.source.path.split('/').pop() : 'pasted document') : null
  return (
    <Scrim>
      <Sheet role="dialog" aria-label="Import invoices" style={{ width: 'min(960px, 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 22px 14px', borderBottom: '1px solid var(--d-line)' }}>
          <div><Kicker>Import</Kicker><div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', marginTop: 2 }}>Bring in invoices you issued before</div></div>
          <span style={{ flex: 1 }} />
          <Btn $quiet $sm onClick={p.closeImport} aria-label="Close"><Icon.x /></Btn>
        </div>
        <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto', minHeight: 0 }}>
          {!preview ? (
            <>
              <Meta>A <Mono>{IMPORT_FORMAT}</Mono> JSON file: your business, the number pattern, clients, and every invoice with its counter, lines, dates, sent and paid marks, and the original PDF beside it. Each invoice is registered with its original number; the app computes the totals.</Meta>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Btn $acc disabled={disabled} onClick={p.chooseImportFile}><Icon.file />Choose a file…</Btn>
                <Btn $quiet $sm onClick={() => setPasted(JSON.stringify(importTemplate(), null, 2))}>Show an example</Btn>
                <Btn $quiet $sm onClick={p.openAssistant}>Ask the assistant to write one from my PDFs</Btn>
              </div>
              <Area style={{ minHeight: 160, fontFamily: 'var(--d-mono)', fontSize: 11.5 }} placeholder="…or paste the JSON here" value={pasted} onChange={event => setPasted(event.target.value)} />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Btn $sm disabled={!pasted.trim()} onClick={readPasted}>Read pasted document</Btn></div>
            </>
          ) : !plan ? (
            <>
              <Callout $tone="bad"><Icon.warn /><span><b>The file could not be read.</b> Fix these and try again.</span></Callout>
              {preview.problems.map((problem, i) => <Hint key={i} $err><Mono>{problem.where}</Mono> · {problem.message}</Hint>)}
              <div><Btn $sm onClick={p.closeImport}>Back</Btn></div>
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                <Stat><span className="l">Invoices to import</span><span className="v">{plan.counts.importing}{plan.counts.conflicts ? <Hint> · {plan.counts.conflicts} already here</Hint> : null}</span></Stat>
                <Stat><span className="l">Clients</span><span className="v" style={{ fontSize: 14 }}>{plan.clients.creating.length} new · {plan.clients.linking.length} linked</span></Stat>
                <Stat><span className="l">Counter after</span><span className="v"><Mono>{plan.counter.before}</Mono> → <Mono>{plan.counter.after}</Mono></span></Stat>
                <Stat><span className="l">Number format</span><span className="v" style={{ fontSize: 14 }}><Mono>{plan.numberFormat ?? 'as set'}</Mono></span></Stat>
              </div>
              <Meta>From {sourceWords}. {plan.business === 'fill' ? 'Your business details are empty and will be filled from the file. ' : ''}Imported invoices are labelled historical; their PDFs are kept as unverified originals.</Meta>
              {plan.problems.map((problem, i) => <Callout key={i} $tone="bad"><Icon.warn /><span><b>{problem.where}:</b> {problem.message}</span></Callout>)}
              {plan.counts.conflicts ? <Switch $on={skipConflicts}><input type="checkbox" checked={skipConflicts} onChange={event => reSkip(event.target.checked)} /><i />Skip the {plan.counts.conflicts} row{plan.counts.conflicts === 1 ? '' : 's'} whose counter is already in the archive</Switch> : null}
              <List style={{ fontSize: 12.5 }}>
                <thead><tr><th>Label</th><th>Client</th><th>Issued</th><th className="num">Total</th><th>Standing</th><th>PDF</th><th /></tr></thead>
                <tbody>{plan.rows.map(row => (
                  <tr key={row.index} style={{ cursor: 'default', opacity: row.conflict && skipConflicts ? 0.5 : 1 }}>
                    <td><Mono>{row.label}</Mono><Hint style={{ display: 'block' }}>#{row.number}</Hint></td>
                    <td>{row.clientName}<Hint style={{ display: 'block' }}>{row.clientAction === 'create' ? 'new client' : row.clientAction === 'link' ? 'in directory' : 'on the invoice only'}</Hint></td>
                    <td>{shortDate(p.importDocumentRow(row.index)?.issuedAt)}</td>
                    <td className="num"><Mono>{formatMoney(row.total, row.currency)}</Mono></td>
                    <td><Chip $tone={row.standing === 'paid' ? 'ok' : row.standing === 'sent' ? 'info' : 'neutral'}>{row.standing}</Chip></td>
                    <td>{row.pdf ? <Hint>{row.pdf.split('/').pop()}</Hint> : <Meta>—</Meta>}</td>
                    <td>{row.errors.length ? <Hint $err>{row.errors.join(' ')}</Hint> : row.warnings.length ? <Hint>{row.warnings.join(' ')}</Hint> : <Chip $tone="ok">ready</Chip>}</td>
                  </tr>
                ))}</tbody>
              </List>
            </>
          )}
        </div>
        {plan ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--d-line)' }}>
            <Meta>{plan.ok ? 'Everything already issued stays as it is. This cannot be undone from the app.' : 'Fix the rows marked in red, or skip the conflicts, then import.'}</Meta>
            <span style={{ flex: 1 }} />
            <Btn onClick={() => p.previewImport(null)}>Choose another</Btn>
            <Btn $acc style={{ height: 34, padding: '0 16px' }} disabled={disabled || !plan.ok || p.importing} onClick={() => p.runImport(skipConflicts)}>{p.importing ? 'Importing…' : `Import ${plan.counts.importing} invoice${plan.counts.importing === 1 ? '' : 's'}`}</Btn>
          </div>
        ) : null}
      </Sheet>
    </Scrim>
  )
}
