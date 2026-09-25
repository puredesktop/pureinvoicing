import { useRef } from 'react'
import { styled } from 'styled-components'
import type { InvoiceProduct } from '../../hooks/useInvoiceProduct'
import { calculateInvoice } from '../../lib/invoices/calculations'
import { formatAmount } from '../../lib/invoices/money'
import type { LineItem } from '../../lib/invoices/types'
import { Icon } from './bits'
import { Btn, Hint, IconBtn, Meta, Mono, SecHead } from './deskStyles'

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  th { font: 500 10.5px var(--d-mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--d-faint); text-align: left; padding: 4px 6px 8px; border-bottom: 1px solid var(--d-line); white-space: nowrap; }
  td { padding: 4px 3px; border-bottom: 1px solid var(--d-line); vertical-align: top; }
  th.num, td.num { text-align: right; }
  tr.err td { background: var(--d-bad-bg); }
`
const Cell = styled.input<{ $num?: boolean }>`
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  font-size: 12.5px;
  ${({ $num }) => ($num ? 'text-align: right; font-variant-numeric: tabular-nums; font-family: var(--d-mono);' : '')}
  &:hover { border-color: var(--d-line); }
  &:focus { outline: none; border-color: var(--d-acc); background: var(--d-paper); box-shadow: 0 0 0 3px var(--d-acc-soft); }
  &::placeholder { color: var(--d-faint); }
`
const Desc = styled.textarea`
  width: 100%;
  min-width: 0;
  min-height: 30px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  font-size: 12.5px;
  line-height: 1.35;
  resize: none;
  field-sizing: content;
  &:hover { border-color: var(--d-line); }
  &:focus { outline: none; border-color: var(--d-acc); background: var(--d-paper); box-shadow: 0 0 0 3px var(--d-acc-soft); }
  &::placeholder { color: var(--d-faint); }
`

const NUMERIC = ['quantity', 'unitPrice', 'discountPercent', 'taxPercent'] as const

/** Lines as a table you type into. Enter on the rate adds a line; the amount follows every keystroke. */
export function LinesEditor({ product: p, reuseFrom }: { product: InvoiceProduct; reuseFrom?: { label: string; lines: LineItem[] } | null }): React.ReactElement | null {
  const region = useRef<HTMLTableSectionElement>(null)
  if (!p.content) return null
  const content = p.content, result = calculateInvoice(content), lines = content.lineItems
  const showDiscount = lines.some(line => (line.discountPercent ?? 0) > 0)
  const showTax = lines.some(line => (line.taxPercent ?? 0) > 0)
  const set = (next: LineItem[]) => p.editDraft({ lineItems: next })
  const patchLine = (index: number, patch: Partial<LineItem>) => set(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  const focus = (index: number, field: 'description' | 'rate') => requestAnimationFrame(() => {
    const row = region.current?.querySelectorAll('tr')[index]
    const target = row?.querySelector<HTMLElement>(field === 'description' ? 'textarea' : 'input[data-field="unitPrice"]')
    target?.focus()
  })
  const add = () => { set([...lines, { description: '', quantity: 1, unitPrice: null }]); focus(lines.length, 'description') }
  const move = (index: number, direction: -1 | 1) => { const next = [...lines]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; set(next) }
  const remove = (index: number) => set(lines.filter((_, i) => i !== index))
  const invalid = (index: number, field: string) => result.diagnostics.some(d => d.field === `lineItems.${index}.${field}`)
  return (
    <>
      <SecHead><h3>Lines</h3><Meta>{lines.length ? `${lines.length} line${lines.length === 1 ? '' : 's'}` : 'none yet'}</Meta><span className="sp" />
        {reuseFrom?.lines.length && !lines.length ? <Btn $quiet $sm onClick={() => set(structuredClone(reuseFrom.lines))}>Reuse lines from {reuseFrom.label}</Btn> : null}
        <Btn $sm onClick={add}><Icon.plus />Line</Btn>
      </SecHead>
      <Table>
        <thead><tr><th>Description</th><th className="num" style={{ width: 64 }}>Qty</th><th className="num" style={{ width: 110 }}>Rate</th>{showDiscount ? <th className="num" style={{ width: 70 }}>Disc %</th> : null}{showTax ? <th className="num" style={{ width: 64 }}>Tax %</th> : null}<th className="num" style={{ width: 110 }}>Amount</th><th style={{ width: 74 }} /></tr></thead>
        <tbody ref={region}>
          {lines.map((line, index) => (
            <tr key={index} className={NUMERIC.some(field => invalid(index, field)) || invalid(index, 'description') ? 'err' : undefined}>
              <td><Desc rows={1} value={line.description} placeholder="What was done" aria-invalid={invalid(index, 'description')} onChange={event => patchLine(index, { description: event.target.value })} /></td>
              <td className="num"><Cell $num inputMode="decimal" value={line.quantity ?? ''} aria-invalid={invalid(index, 'quantity')} aria-label="Quantity" onChange={event => patchLine(index, { quantity: event.target.value === '' ? null : Number(event.target.value) })} /></td>
              <td className="num"><Cell $num inputMode="decimal" data-field="unitPrice" value={line.unitPrice ?? ''} placeholder="0.00" aria-invalid={invalid(index, 'unitPrice')} aria-label="Rate" onChange={event => patchLine(index, { unitPrice: event.target.value === '' ? null : Number(event.target.value) })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (index === lines.length - 1) add(); else focus(index + 1, 'description') } }} /></td>
              {showDiscount ? <td className="num"><Cell $num inputMode="decimal" value={line.discountPercent ?? ''} placeholder="—" aria-invalid={invalid(index, 'discountPercent')} aria-label="Discount percent" onChange={event => patchLine(index, { discountPercent: event.target.value === '' ? null : Number(event.target.value) })} /></td> : null}
              {showTax ? <td className="num"><Cell $num inputMode="decimal" value={line.taxPercent ?? ''} placeholder="—" aria-invalid={invalid(index, 'taxPercent')} aria-label="Tax percent" onChange={event => patchLine(index, { taxPercent: event.target.value === '' ? null : Number(event.target.value) })} /></td> : null}
              <td className="num" style={{ paddingTop: 10 }}><Mono>{result.lines[index].total === null ? <Meta>—</Meta> : formatAmount(result.lines[index].total!, content.currency)}</Mono></td>
              <td style={{ whiteSpace: 'nowrap', paddingTop: 6 }}>
                <IconBtn aria-label={`Move line ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}><Icon.up /></IconBtn>
                <IconBtn aria-label={`Move line ${index + 1} down`} disabled={index === lines.length - 1} onClick={() => move(index, 1)}><Icon.down /></IconBtn>
                <IconBtn aria-label={`Remove line ${index + 1}`} onClick={() => remove(index)}><Icon.trash /></IconBtn>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Hint>{lines.length ? 'Enter on a rate adds the next line. Tax applies after the line discount.' : 'Add at least one line before issuing.'}</Hint>
        <span style={{ flex: 1 }} />
        {!showDiscount ? <Btn $quiet $sm onClick={() => lines.length && patchLine(0, { discountPercent: 0 })} disabled={!lines.length} title="Show a discount column">Discounts</Btn> : null}
        {!showTax ? <Btn $quiet $sm onClick={() => lines.length && patchLine(0, { taxPercent: 0 })} disabled={!lines.length} title="Show a tax column">Tax</Btn> : null}
      </div>
    </>
  )
}
