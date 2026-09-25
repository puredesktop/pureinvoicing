import fontCss from './fonts/embedded.css?raw'
import { calculateInvoice } from './calculations'
import { formatAmount, formatMoney, isZeroMoney } from './money'
import { termsLabel } from './lifecycle'
import { longDate } from './dates'
import type { Diagnostic, InvoiceContent, Presentation } from './types'
export const escapeHtml = (text: unknown) => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export function presentationDiagnostics(p: Presentation): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const add = (field: string, message: string) => diagnostics.push({ field: `presentation.${field}`, message })
  if (!['A4', 'Letter'].includes(p.pageSize)) add('pageSize', 'Choose A4 or Letter.')
  if (!['sans', 'serif', 'mono'].includes(p.typeStyle)) add('typeStyle', 'Choose sans, serif, or mono.')
  for (const field of ['logoPlacement', 'letterheadAlignment', 'footerAlignment'] as const) if (!['left', 'center', 'right'].includes(p[field])) add(field, 'Choose left, center, or right.')
  if (!/^#[0-9a-f]{6}$/i.test(p.accentColor)) add('accentColor', 'Choose a six-digit hex color.')
  for (const field of ['bodyTextSizePt', 'letterheadTextSizePt', 'footerTextSizePt'] as const) if (!Number.isFinite(p[field]) || p[field] < 8 || p[field] > 36) add(field, 'Use readable text between 8 and 36 points.')
  if (!Number.isFinite(p.lineSpacing) || p.lineSpacing < 1.15 || p.lineSpacing > 3) add('lineSpacing', 'Use line spacing between 1.15 and 3.')
  if (!Number.isFinite(p.sectionSpacingMm) || p.sectionSpacingMm < 0 || p.sectionSpacingMm > 40) add('sectionSpacingMm', 'Use section spacing between 0 and 40 mm.')
  const width = p.pageSize === 'Letter' ? 215.9 : 210, height = p.pageSize === 'Letter' ? 279.4 : 297
  const m = p.marginsMm
  for (const [side, value] of Object.entries(m)) if (!Number.isFinite(value) || value < 8) add(`marginsMm.${side}`, 'Use at least 8 mm for the printable area.')
  if (width - m.left - m.right < 100 || height - m.top - m.bottom < 100) add('marginsMm', 'Leave at least 100 mm of content width and height.')
  if (m.top < 12) add('marginsMm.top', 'Allow 12 mm for continuation-page identity.')
  if (!Number.isFinite(p.logoWidthMm) || p.logoWidthMm <= 0 || p.logoWidthMm > width - m.left - m.right) add('logoWidthMm', 'The logo must fit the printable width.')
  const footerWidth = width - m.left - m.right - (p.showPageNumbers ? 24 : 0)
  const footerLines = p.footerText.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length * p.footerTextSizePt * .3528 * .65 / footerWidth)), 0)
  if (p.footerText && footerLines * p.footerTextSizePt * .3528 * p.lineSpacing + 6 > m.bottom) add('footerText', 'The footer needs more bottom margin or shorter text.')
  return diagnostics
}
export function fontDiagnostics(content: InvoiceContent): Diagnostic[] {
  const ranges: [number, number][] = []
  for (const rule of fontCss.split('}')) {
    if (!rule.includes(`'Invoice-${content.presentation.typeStyle}'`)) continue
    const list = /unicode-range:\s*([^;]+)/.exec(rule)?.[1] ?? ''
    for (const range of list.split(',')) {
      const match = /U\+([0-9A-F]+)(?:-([0-9A-F]+))?/i.exec(range)
      if (match) ranges.push([parseInt(match[1], 16), parseInt(match[2] ?? match[1], 16)])
    }
  }
  const values = [Object.values(content.sender).join(''), Object.values(content.recipient).join(''), content.reference,
    content.notes, content.paymentInstructions, content.presentation.letterheadText, content.presentation.footerText,
    ...content.lineItems.map(line => line.description)]
  const unsupported = [...new Set([...values.join('')].filter(c => !/\s/u.test(c) && !ranges.some(([start, end]) => c.codePointAt(0)! >= start && c.codePointAt(0)! <= end)))]
  return unsupported.length ? [{ field: 'presentation.typeStyle', message: `The retained fonts do not support these characters: ${unsupported.slice(0, 20).join(' ')}. Replace them before finalization.` }] : []
}
/**
 * The retained document. One header row (letterhead and sender on one side,
 * the word INVOICE, the label and the facts on the other), a bill-to block,
 * the lines with only the columns that carry a value, totals kept together,
 * then the note and the payment block. Money is written with its currency's
 * grouping and precision; the currency is named once in the totals.
 */
export function invoiceHtml(content: InvoiceContent, label: string, logoDataUrl?: string) {
  const p = content.presentation, m = p.marginsMm, totals = calculateInvoice(content)
  if (presentationDiagnostics(p).length) throw new Error('Correct presentation diagnostics before rendering.')
  const e = escapeHtml, cur = content.currency
  const partyLines = (value: InvoiceContent['sender']) => {
    const order: (keyof InvoiceContent['sender'])[] = ['name', 'address', 'contactName', 'email', 'phone', 'website', 'registrationIdentifier', 'taxIdentifier']
    return order.filter(key => value[key]).map(key => key === 'name' ? `<div class="name">${e(value[key])}</div>`
      : key === 'contactName' ? `<div>Attn: ${e(value[key])}</div>`
      : key === 'registrationIdentifier' ? `<div>Reg. ${e(value[key])}</div>`
      : key === 'taxIdentifier' ? `<div>Tax id ${e(value[key])}</div>` : `<div>${e(value[key])}</div>`).join('')
  }
  const showDiscount = content.lineItems.some(line => (line.discountPercent ?? 0) > 0)
  const showTax = content.lineItems.some(line => (line.taxPercent ?? 0) > 0)
  const rows = content.lineItems.map((line, i) => `<tr><td class="desc">${e(line.description)}</td><td class="n">${e(line.quantity)}</td><td class="n">${line.unitPrice === null ? '' : formatAmount(String(line.unitPrice), cur)}</td>${showDiscount ? `<td class="n">${e(line.discountPercent ?? 0)}%</td>` : ''}${showTax ? `<td class="n">${e(line.taxPercent ?? 0)}%</td>` : ''}<td class="n">${totals.lines[i].total === null ? '—' : formatAmount(totals.lines[i].total!, cur)}</td></tr>`).join('')
  const pageWidth = p.pageSize === 'Letter' ? 215.9 : 210
  const footerWidth = pageWidth - m.left - m.right - (p.showPageNumbers ? 24 : 0)
  const cols = showDiscount && showTax ? '44% 9% 15% 8% 8% 16%' : showDiscount || showTax ? '48% 9% 16% 10% 17%' : '55% 10% 17% 18%'
  const terms = content.termsDays !== null && content.termsDays !== undefined ? ` · ${e(termsLabel(content.termsDays))}` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${e(label)}</title><style>
${fontCss}
@page { size: ${p.pageSize}; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;
 @top-center { content: element(identity); vertical-align: middle; }
 @bottom-center { content: element(footer); vertical-align: middle; }
 @bottom-right { content: ${p.showPageNumbers ? 'counter(page) " / " counter(pages)' : 'none'}; font: 8pt 'Invoice-${p.typeStyle}'; width: 22mm; color: #6b6f78; }
}
@page:first { @top-center { content: none; } }
* { box-sizing: border-box; }
body { margin: 0; color: #171717; background: white; font-family: 'Invoice-${p.typeStyle}'; font-size: ${p.bodyTextSizePt}pt; line-height: ${p.lineSpacing}; }
.identity { position: running(identity); font-size: 8pt; color: #6b6f78; overflow-wrap: anywhere; }
.footer { position: running(footer); font-size: ${p.footerTextSizePt}pt; text-align: ${p.footerAlignment}; width: ${footerWidth}mm; white-space: pre-wrap; overflow-wrap: anywhere; color: #6b6f78; }
.head { display: flex; justify-content: space-between; gap: 10mm; align-items: flex-start; margin-bottom: ${p.sectionSpacingMm}mm; padding-bottom: ${Math.max(2, p.sectionSpacingMm / 2)}mm; border-bottom: 0.6mm solid ${p.accentColor}; }
.from { flex: 1 1 auto; min-width: 0; }
.logo { text-align: ${p.logoPlacement}; margin-bottom: 3mm; } .logo img { width: ${p.logoWidthMm}mm; height: auto; }
.letterhead { text-align: ${p.letterheadAlignment}; font-size: ${p.letterheadTextSizePt}pt; white-space: pre-wrap; margin-bottom: 2mm; }
.meta { flex: 0 0 auto; text-align: right; }
.doc { font-size: 9pt; letter-spacing: 0.18em; text-transform: uppercase; color: ${p.accentColor}; }
.no { font-size: 15pt; font-weight: bold; margin: 1mm 0 3mm; }
.facts { border-collapse: collapse; margin-left: auto; font-size: ${Math.max(8, p.bodyTextSizePt - 1)}pt; }
.facts th { text-align: right; font-weight: normal; color: #6b6f78; padding: 0 3mm 0.5mm 0; }
.facts td { text-align: right; padding: 0 0 0.5mm 0; }
.party, td, .text { white-space: pre-wrap; overflow-wrap: anywhere; }
.name { font-weight: bold; }
.h { font-size: 8pt; letter-spacing: 0.14em; text-transform: uppercase; color: #6b6f78; margin-bottom: 1mm; }
section, table, .totals { margin-bottom: ${p.sectionSpacingMm}mm; }
table.lines { border-collapse: collapse; width: 100%; table-layout: fixed; }
thead { display: table-header-group; } th { text-align: left; font-size: ${Math.max(7.5, p.bodyTextSizePt - 2)}pt; letter-spacing: 0.06em; text-transform: uppercase; color: #3c4049; border-bottom: 0.4mm solid ${p.accentColor}; }
th, td { padding: 2mm 1.5mm; vertical-align: top; } tr { break-inside: auto; } td { border-bottom: 0.2mm solid #e1e3e8; }
th.n, td.n { text-align: right; font-variant-numeric: tabular-nums; }
.totals { break-inside: avoid; page-break-inside: avoid; display: flex; justify-content: flex-end; }
.totals table { border-collapse: collapse; min-width: 62mm; margin: 0; }
.totals th { text-align: left; font-weight: normal; text-transform: none; letter-spacing: 0; font-size: inherit; color: #3c4049; border: 0; padding: 1mm 6mm 1mm 0; }
.totals td { text-align: right; border: 0; padding: 1mm 0; font-variant-numeric: tabular-nums; }
.totals tr.due th, .totals tr.due td { font-weight: bold; border-top: 0.5mm solid ${p.accentColor}; padding-top: 2mm; font-size: ${p.bodyTextSizePt + 1}pt; }
.pay { break-inside: avoid; }
</style></head><body>
<div class="identity">Invoice ${e(label)} · ${e(content.recipient.name)}</div><div class="footer">${e(p.footerText)}</div>
<header class="head"><div class="from">${logoDataUrl ? `<div class="logo"><img alt="Business logo" src="${logoDataUrl}"></div>` : ''}${p.letterheadText ? `<div class="letterhead">${e(p.letterheadText)}</div>` : ''}<div class="party">${partyLines(content.sender)}</div></div>
<div class="meta"><div class="doc">Invoice</div><div class="no">${e(label)}</div><table class="facts"><tr><th>Date</th><td>${e(longDate(content.invoiceDate))}</td></tr><tr><th>Due</th><td>${e(longDate(content.dueDate))}${terms}</td></tr>${content.reference ? `<tr><th>Reference</th><td>${e(content.reference)}</td></tr>` : ''}</table></div></header>
<section><div class="h">Bill to</div><div class="party">${partyLines(content.recipient)}</div></section>
<table class="lines"><colgroup>${cols.split(' ').map(width => `<col style="width:${width}">`).join('')}</colgroup><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Rate</th>${showDiscount ? '<th class="n">Disc.</th>' : ''}${showTax ? '<th class="n">Tax</th>' : ''}<th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals"><table><tr><th>Subtotal</th><td>${formatAmount(totals.subtotal, cur)}</td></tr>${isZeroMoney(totals.totalDiscount) ? '' : `<tr><th>Discount</th><td>−${formatAmount(totals.totalDiscount, cur)}</td></tr>`}${totals.taxBreakdown.filter(t => t.rate > 0).map(t => `<tr><th>Tax ${e(t.rate)}%</th><td>${formatAmount(t.amount, cur)}</td></tr>`).join('')}<tr class="due"><th>Total due${cur ? ` (${e(cur)})` : ''}</th><td>${formatMoney(totals.total, cur)}</td></tr></table></div>
${content.notes.trim() ? `<section class="text">${e(content.notes)}</section>` : ''}${content.paymentInstructions.trim() ? `<section class="pay"><div class="h">Payment</div><div class="text">${e(content.paymentInstructions)}</div></section>` : ''}</body></html>`
}
export { fontCss as embeddedFontCss }
