import { formatAmount } from './money'
import { PROPOSAL_STATUS_LABEL, calculateProposal, getProposalVersion } from './proposals'
import type { InvoiceStore, Proposal } from './types'

/** Every piece of the person's text goes through here: markup in it shows as text and never becomes an element or attribute. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
const paragraphs = (value: string) => value.trim()
  ? value.trim().split(/\n{2,}/).map(block => `<p>${block.split('\n').map(escapeHtml).join('<br>')}</p>`).join('')
  : '<p class="none">Not stated.</p>'
const lines = (value: string) => value.split('\n').map(escapeHtml).join('<br>')
/** A unit price as entered (never rounded), with at least the currency's digits. */
export const unitPriceText = (value: number, precision: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: precision, maximumFractionDigits: 20 }).format(value)
const day = (iso: string | undefined) => iso ? iso.slice(0, 10) : ''

export function proposalFileName(proposal: Proposal, versionId: string): string {
  const version = getProposalVersion(proposal, versionId)
  const base = `Proposal-${version.content.customer.name || 'customer'}-${version.content.title || 'offer'}-v${version.number}`
  return `${base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90)}.html`
}

/**
 * One version of a proposal as a standalone page: no scripts, no external
 * files, styles inline, and a content policy that blocks anything else. It
 * shows what is on the version and nothing more: no signature lines and no
 * claim that opening or answering it binds anyone.
 */
export function proposalHtml(store: InvoiceStore, proposal: Proposal, versionId: string): string {
  const version = getProposalVersion(proposal, versionId)
  const c = version.content, calc = calculateProposal(c), currency = c.currency ?? ''
  const business = store.business
  const customer = [c.customer.contactName ? `Attn. ${c.customer.contactName}` : '', c.customer.email ?? '', c.customer.phone ?? '', c.customer.taxIdentifier ? `Tax ID ${c.customer.taxIdentifier}` : '']
    .filter(Boolean).map(v => `<div>${escapeHtml(v)}</div>`).join('')
  const sender = [business.email ?? '', business.phone ?? '', business.website ?? '', business.taxIdentifier ? `Tax ID ${business.taxIdentifier}` : '']
    .filter(Boolean).map(v => `<div>${escapeHtml(v)}</div>`).join('')
  const standing = version.status === 'draft' ? 'Draft — not yet offered' : `${PROPOSAL_STATUS_LABEL[version.status]} · offered ${escapeHtml(day(version.offeredAt))}${version.decidedAt ? ` · ${escapeHtml(PROPOSAL_STATUS_LABEL[version.status].toLowerCase())} ${escapeHtml(day(version.decidedAt))}` : ''}`
  const rows = c.items.map((item, index) => `<tr><td>${lines(item.description)}</td><td class="num">${escapeHtml(item.quantity ?? '')}</td><td class="num">${item.unitPrice === null ? '' : escapeHtml(unitPriceText(item.unitPrice, calc.precision))}</td><td class="num">${calc.lines[index].amount === null ? '—' : escapeHtml(formatAmount(calc.lines[index].amount!, c.currency))}</td></tr>`).join('')
  const terms = [c.paymentTerms.trim() ? lines(c.paymentTerms.trim()) : '', c.paymentTermsDays !== null ? `Invoices are due ${c.paymentTermsDays === 0 ? 'on receipt' : `${escapeHtml(c.paymentTermsDays)} days after the invoice date`}.` : '']
    .filter(Boolean).map(v => `<p>${v}</p>`).join('') || '<p class="none">Not stated.</p>'
  const title = c.title.trim() || 'Proposal'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(title)} — ${escapeHtml(c.customer.name)}</title>
<style>
body { margin: 0; background: #f4f3ef; color: #1d1d1b; font: 15px/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
main { max-width: 760px; margin: 32px auto; background: #fff; padding: 44px 48px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #284B63; padding-bottom: 18px; }
h1 { font-size: 26px; margin: 0 0 4px; } h2 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #284B63; margin: 26px 0 6px; }
.meta { color: #6b6b66; font-size: 13px; } .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 20px; }
.party b { display: block; } p { margin: 0 0 8px; } .none { color: #8a8a84; font-style: italic; }
table { width: 100%; border-collapse: collapse; margin-top: 6px; } th { text-align: left; font-size: 12px; color: #6b6b66; border-bottom: 1px solid #d9d8d2; padding: 6px 4px; }
td { border-bottom: 1px solid #ecebe6; padding: 8px 4px; vertical-align: top; } .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
tfoot td { border: 0; font-weight: 600; font-size: 16px; padding-top: 12px; }
footer { margin-top: 30px; color: #6b6b66; font-size: 12px; border-top: 1px solid #ecebe6; padding-top: 12px; }
@media (max-width: 640px) { main { margin: 0; padding: 24px 16px; border-radius: 0; } .parties { grid-template-columns: 1fr; } header { flex-direction: column; } }
</style>
</head>
<body>
<main>
<header>
<div><h1>${escapeHtml(title)}</h1><div class="meta" data-field="status">${standing}</div></div>
<div class="meta">Proposal version ${version.number}<br>Prices in <span data-field="currency">${escapeHtml(currency)}</span></div>
</header>
<section class="parties">
<div class="party" data-field="from"><h2>From</h2><b>${escapeHtml(business.name)}</b><div>${lines(business.address)}</div>${sender}</div>
<div class="party" data-field="customer"><h2>Prepared for</h2><b>${escapeHtml(c.customer.name)}</b><div>${lines(c.customer.address)}</div>${customer}</div>
</section>
<section data-field="scope"><h2>Scope</h2>${paragraphs(c.scope)}</section>
<section data-field="deliverables"><h2>Deliverables</h2>${paragraphs(c.deliverables)}</section>
<section data-field="exclusions"><h2>Not included</h2>${paragraphs(c.exclusions)}</section>
<section data-field="timing"><h2>Timing</h2>${paragraphs(c.timing)}</section>
<section data-field="items"><h2>Prices</h2>
<table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount (${escapeHtml(currency)})</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="3">Total</td><td class="num" data-field="total">${escapeHtml(currency)} ${escapeHtml(formatAmount(calc.total, c.currency))}</td></tr></tfoot></table>
</section>
<section data-field="paymentTerms"><h2>Payment terms</h2>${terms}</section>
<footer>This offer sets out the work and prices above. It is not an invoice.</footer>
</main>
</body>
</html>
`
}
