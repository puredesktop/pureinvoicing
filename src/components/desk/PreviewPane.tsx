import { useEffect, useState } from 'react'
import { styled } from 'styled-components'
import type { PreviewPage } from '../../lib/invoices/rendering'
import type { Diagnostic } from '../../lib/invoices/types'
import { Icon } from './bits'
import { Btn, Callout, Kicker, Meta, Paper, Seg, SegBtn } from './deskStyles'

const Stage = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 6px 4px 12px;
`
const Waiting = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--d-muted);
  font-size: 12.5px;
`

export interface QuickFix { label: string; apply: () => void }

export interface PreviewPaneProps {
  pages: PreviewPage[] | null
  /** Diagnostics not tied to one page (content, presentation, pipeline). */
  diagnostics?: Diagnostic[]
  /** True while a fresh render is on its way. */
  rendering?: boolean
  caption?: string
  /** A fix for a diagnostic, by field prefix. */
  quickFix?: (diagnostic: Diagnostic) => QuickFix | null
  onOpenAppearance?: () => void
  onRefresh?: () => void
  emptyText?: string
}

/**
 * The pages as they will print: a pager, a zoom, and every problem as a
 * callout with the fix beside it. Never a stale image behind a refresh button.
 */
export function PreviewPane({ pages, diagnostics = [], rendering, caption, quickFix, onOpenAppearance, onRefresh, emptyText }: PreviewPaneProps): React.ReactElement {
  const [index, setIndex] = useState(0)
  const [zoom, setZoom] = useState<'fit' | 100 | 150>('fit')
  const count = pages?.length ?? 0
  useEffect(() => { if (index >= count) setIndex(Math.max(0, count - 1)) }, [count, index])
  const page = pages?.[Math.min(index, Math.max(0, count - 1))]
  const problems = [...diagnostics, ...(pages ?? []).flatMap(candidate => candidate.diagnostics.map(diagnostic => ({ ...diagnostic, page: candidate.pageNumber })))]
  const seen = new Set<string>()
  const unique = problems.filter(problem => { const key = `${problem.field}:${problem.message}`; if (seen.has(key)) return false; seen.add(key); return true })
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 30 }}>
        <Kicker>Pages</Kicker>
        {count > 1 ? <Seg>{pages!.map((candidate, i) => <SegBtn key={candidate.pageNumber} $on={i === index} onClick={() => setIndex(i)} aria-label={`Page ${candidate.pageNumber}`}>{candidate.pageNumber}</SegBtn>)}</Seg> : null}
        <Meta>{rendering ? 'Rendering…' : count ? `${count} page${count === 1 ? '' : 's'}${caption ? ` · ${caption}` : ''}` : caption ?? ''}</Meta>
        <span style={{ flex: 1 }} />
        {onRefresh ? <Btn $quiet $sm onClick={onRefresh} disabled={rendering}>Render again</Btn> : null}
        <Seg><SegBtn $on={zoom === 'fit'} onClick={() => setZoom('fit')}>Fit</SegBtn><SegBtn $on={zoom === 100} onClick={() => setZoom(100)}>100%</SegBtn><SegBtn $on={zoom === 150} onClick={() => setZoom(150)}>150%</SegBtn></Seg>
      </div>
      {unique.map((problem, i) => {
        const fix = quickFix?.(problem)
        const presentation = problem.field.startsWith('presentation.')
        return (
          <Callout key={i} $tone={presentation ? 'warn' : 'bad'} style={{ alignItems: 'center' }}>
            <Icon.warn />
            <span><b>{'page' in problem && problem.page ? `Page ${problem.page}: ` : ''}{problem.message}</b>{!presentation && !problem.field.startsWith('pages.') && problem.field !== 'preview' ? <> <span style={{ opacity: 0.8 }}>({fieldWords(problem.field)})</span></> : null}</span>
            <span className="sp" />
            {fix ? <Btn $sm onClick={fix.apply}>{fix.label}</Btn> : null}
            {presentation && onOpenAppearance ? <Btn $quiet $sm onClick={onOpenAppearance}>Open appearance</Btn> : null}
          </Callout>
        )
      })}
      {page?.imageDataUrl ? (
        <Stage tabIndex={0} aria-label={`Page ${page.pageNumber} of ${count}`}>
          <Paper style={{ width: zoom === 'fit' ? '100%' : zoom === 100 ? 794 : 1191, maxWidth: zoom === 'fit' ? 640 : 'none' }}>
            <img src={page.imageDataUrl} alt={`Invoice page ${page.pageNumber}`} />
          </Paper>
        </Stage>
      ) : (
        <Waiting>{rendering ? 'Laying out the pages…' : page ? 'This page could not be drawn. Render again.' : emptyText ?? 'The pages appear here as you type.'}</Waiting>
      )}
      {page?.text ? <details style={{ fontSize: 12, color: 'var(--d-muted)' }}><summary style={{ cursor: 'pointer' }}>Page text</summary><pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', margin: '6px 0 0' }}>{page.text}</pre></details> : null}
    </>
  )
}

function fieldWords(field: string): string {
  const line = /^lineItems\.(\d+)\.(\w+)/.exec(field)
  if (line) return `line ${Number(line[1]) + 1}, ${({ description: 'description', quantity: 'quantity', unitPrice: 'rate', discountPercent: 'discount', taxPercent: 'tax' } as Record<string, string>)[line[2]] ?? line[2]}`
  return ({ 'sender.name': 'your business name', 'sender.address': 'your address', 'recipient.name': 'client name', 'recipient.address': 'billing address', invoiceDate: 'invoice date', dueDate: 'due date', currency: 'currency', lineItems: 'lines' } as Record<string, string>)[field] ?? field
}
