import { KIND_LABEL, TRIGGER_LABEL } from './agreements'
import { embeddedFontCss, escapeHtml } from './presentation'
import { formatMoney, sumMoney } from './money'
import type { Agreement, Business, InvoiceStore, Party } from './types'

const e = escapeHtml
const longDate = (iso?: string) => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

/** A section's text: blank lines separate paragraphs, lines starting "- " become a list. */
function prose(body: string): string {
  return body.trim().split(/\n\s*\n/).map(block => {
    const lines = block.split('\n')
    if (lines.every(line => /^\s*[-•]\s+/.test(line))) return `<ul>${lines.map(line => `<li>${e(line.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`
    return `<p>${lines.map(e).join('<br>')}</p>`
  }).join('')
}
function partyBlock(role: string, party: Partial<Party> & { name: string }): string {
  const lines = [party.address, party.contactName ? `Attn: ${party.contactName}` : '', party.email].filter(Boolean)
  return `<div class="party"><div class="h">${e(role)}</div><div class="name">${e(party.name)}</div>${lines.map(line => `<div>${e(line)}</div>`).join('')}</div>`
}

/**
 * The agreement as it prints, in the invoice template's letterhead, colour,
 * typeface and footer: its parties, the terms at a glance, the sections as
 * written, the payment schedule after the fees section, and signature lines.
 */
export function agreementHtml(store: InvoiceStore, a: Agreement, logoDataUrl?: string): string {
  const p = store.template, m = p.marginsMm, b: Business = store.business
  const label = a.numberText ?? 'Draft'
  const other = a.clientId ? store.clients[a.clientId] : undefined
  const contractor = a.contractorId ? store.contractors?.[a.contractorId] : undefined
  const them = other ? { name: other.name, address: other.billingAddress, contactName: other.contactName, email: other.email }
    : contractor ? { name: contractor.name, address: contractor.address, contactName: contractor.contactName, email: contractor.email } : { name: '[Party]' }
  const parent = a.parentId ? store.agreements?.[a.parentId] : undefined
  const money = (n: number) => formatMoney(sumMoney([String(n)], a.currency), a.currency)
  const fee = a.fee.kind === 'fixed' && a.fee.amount !== undefined ? `${money(a.fee.amount)} fixed`
    : a.fee.kind === 'monthly' && a.fee.amount !== undefined ? `${money(a.fee.amount)} a month`
    : a.fee.kind === 'hourly' && a.fee.rate !== undefined ? `${money(a.fee.rate)} an hour${a.fee.cap ? `, capped at ${money(a.fee.cap)} a month` : ''}` : ''
  const facts = [
    a.startDate ? ['Starts', longDate(a.startDate)] : null, a.endDate ? ['Ends', longDate(a.endDate)] : null,
    fee ? ['Fee', fee] : null, a.paymentDays !== undefined ? ['Payment', `within ${a.paymentDays} days of invoice`] : null,
  ].filter((x): x is string[] => !!x)
  const planned = a.milestones.filter(x => x.trigger !== 'period')
  const schedule = planned.length ? `<table class="schedule"><thead><tr><th>Milestone</th><th>When invoiced</th><th class="n">Amount</th></tr></thead><tbody>${planned.map((x, i) => `<tr><td>${i + 1}. ${e(x.label)}</td><td>${e(TRIGGER_LABEL[x.trigger])}</td><td class="n">${money(x.amount)}</td></tr>`).join('')}<tr class="sum"><td colspan="2">Total</td><td class="n">${formatMoney(sumMoney(planned.map(x => String(x.amount)), a.currency), a.currency)}</td></tr></tbody></table>` : ''
  const feeIndex = a.sections.findIndex(x => /fee|payment|milestone|invoic/i.test(x.heading))
  const sections = a.sections.map((x, i) => `<section><h2><span class="num">${i + 1}.</span>${e(x.heading)}</h2>${prose(x.body)}${i === feeIndex ? schedule : ''}</section>`).join('')
  const signer = (party: 'us' | 'them', name: string) => {
    const signed = a.signatures.find(x => x.party === party)
    return `<div class="sign"><div class="h">For ${e(name)}</div><div class="line"></div><div class="row"><span>Name</span><span>${e(signed?.name ?? '')}</span></div><div class="row"><span>Title</span><span></span></div><div class="row"><span>Date</span><span>${e(longDate(signed?.at))}</span></div></div>`
  }
  const pageWidth = p.pageSize === 'Letter' ? 215.9 : 210
  const footerWidth = pageWidth - m.left - m.right - (p.showPageNumbers ? 24 : 0)
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(label)} ${e(a.title)}</title><style>
${embeddedFontCss}
@page { size: ${p.pageSize}; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;
 @top-center { content: element(identity); vertical-align: middle; }
 @bottom-center { content: element(footer); vertical-align: middle; }
 @bottom-right { content: ${p.showPageNumbers ? 'counter(page) " / " counter(pages)' : 'none'}; font: 8pt 'Invoice-${p.typeStyle}'; width: 22mm; color: #6b6f78; }
}
@page:first { @top-center { content: none; } }
* { box-sizing: border-box; }
body { margin: 0; color: #171717; background: white; font-family: 'Invoice-${p.typeStyle}'; font-size: ${p.bodyTextSizePt}pt; line-height: ${p.lineSpacing}; }
.identity { position: running(identity); font-size: 8pt; color: #6b6f78; }
.footer { position: running(footer); font-size: ${p.footerTextSizePt}pt; text-align: ${p.footerAlignment}; width: ${footerWidth}mm; white-space: pre-wrap; color: #6b6f78; }
.head { display: flex; justify-content: space-between; gap: 10mm; align-items: flex-end; padding-bottom: 3mm; border-bottom: 0.6mm solid ${p.accentColor}; margin-bottom: 7mm; }
.logo img { width: ${p.logoWidthMm}mm; height: auto; }
.doc { font-size: 9pt; letter-spacing: 0.18em; text-transform: uppercase; color: ${p.accentColor}; text-align: right; }
.no { font-size: 13pt; font-weight: bold; text-align: right; margin-top: 1mm; }
h1 { font-size: ${p.bodyTextSizePt + 8}pt; margin: 0 0 2mm; line-height: 1.2; }
.under { color: #3c4049; margin: 0 0 6mm; }
.parties { display: flex; gap: 10mm; margin-bottom: 6mm; } .party { flex: 1; } .name { font-weight: bold; }
.h { font-size: 8pt; letter-spacing: 0.14em; text-transform: uppercase; color: #6b6f78; margin-bottom: 1mm; }
.facts { border-collapse: collapse; margin-bottom: 7mm; width: 100%; } .facts th { text-align: left; font-weight: normal; color: #6b6f78; width: 28mm; padding: 1mm 0; vertical-align: top; } .facts td { padding: 1mm 0; border: 0; }
section { margin-bottom: 5mm; } h2 { font-size: ${p.bodyTextSizePt + 1}pt; margin: 0 0 1.5mm; break-after: avoid; } .num { display: inline-block; min-width: 7mm; color: ${p.accentColor}; }
p { margin: 0 0 2mm; } ul { margin: 0 0 2mm; padding-left: 6mm; }
table.schedule { border-collapse: collapse; width: 100%; margin: 2mm 0 3mm; break-inside: avoid; }
.schedule th { text-align: left; font-size: 8pt; letter-spacing: 0.06em; text-transform: uppercase; color: #3c4049; border-bottom: 0.4mm solid ${p.accentColor}; padding: 1.5mm; }
.schedule td { padding: 1.5mm; border-bottom: 0.2mm solid #e1e3e8; } .n { text-align: right; font-variant-numeric: tabular-nums; } .sum td { font-weight: bold; border-bottom: 0; }
.signatures { display: flex; gap: 12mm; margin-top: 12mm; break-inside: avoid; } .sign { flex: 1; } .line { height: 14mm; border-bottom: 0.3mm solid #171717; margin-bottom: 2mm; }
.row { display: flex; gap: 3mm; padding: 1mm 0; border-bottom: 0.2mm solid #e1e3e8; } .row span:first-child { width: 14mm; color: #6b6f78; }
</style></head><body>
<div class="identity">${e(label)} · ${e(a.title)} · ${e(them.name)}</div><div class="footer">${e(p.footerText)}</div>
<header class="head"><div class="logo">${logoDataUrl ? `<img alt="Logo" src="${logoDataUrl}">` : `<b>${e(b.name)}</b>`}</div><div><div class="doc">${e(KIND_LABEL[a.kind])}</div><div class="no">${e(label)}</div></div></header>
<h1>${e(a.title)}</h1>
${parent ? `<p class="under">Made under ${e(parent.title)}${parent.numberText ? ` (${e(parent.numberText)})` : ''}${parent.signedAt ? `, dated ${e(longDate(parent.signedAt))}` : ''}.</p>` : ''}
<div class="parties">${partyBlock(a.direction === 'client' ? 'Provider' : 'Company', { name: b.name, address: b.address, email: b.email })}${partyBlock(a.direction === 'client' ? 'Client' : 'Contractor', them)}</div>
${facts.length ? `<table class="facts">${facts.map(([k, v]) => `<tr><th>${e(k)}</th><td>${e(v)}</td></tr>`).join('')}</table>` : ''}
${sections}${feeIndex < 0 && schedule ? `<section><h2>Payment schedule</h2>${schedule}</section>` : ''}
<div class="signatures">${signer('us', b.name)}${signer('them', them.name)}</div>
</body></html>`
}
