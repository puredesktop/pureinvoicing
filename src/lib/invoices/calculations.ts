import { supportedCurrencies } from './defaults'
import type { Diagnostic, InvoiceContent } from './types'
// Decimal fractions are exact, including exponential notation emitted by Number.toString().
type Fraction = { n: bigint; d: bigint }
function decimal(value: number): Fraction {
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e')
  const [whole, fraction = ''] = mantissa.split('.')
  const scale = fraction.length - Number(exponent)
  return scale >= 0 ? { n: BigInt(whole + fraction), d: 10n ** BigInt(scale) }
    : { n: BigInt(whole + fraction) * 10n ** BigInt(-scale), d: 1n }
}
const multiply = (a: Fraction, b: Fraction): Fraction => ({ n: a.n * b.n, d: a.d * b.d })
const percent = (n: number): Fraction => multiply(decimal(n), { n: 1n, d: 100n })
function round(a: Fraction, precision: number): bigint {
  const n = a.n * 10n ** BigInt(precision)
  return (2n * n + a.d) / (2n * a.d)
}
function money(minor: bigint, precision: number): string {
  if (!precision) return String(minor)
  const text = String(minor).padStart(precision + 1, '0')
  return `${text.slice(0, -precision)}.${text.slice(-precision)}`
}
export function validDate(value: string | null): boolean {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function calculateInvoice(content: InvoiceContent, currencyReviewRequired = false) {
  const diagnostics: Diagnostic[] = []
  const issue = (field: string, message: string) => diagnostics.push({ field, message })
  for (const name of ['sender', 'recipient'] as const) {
    for (const field of ['name', 'address'] as const) {
      if (!content[name][field].trim()) issue(`${name}.${field}`, 'Required before issuing.')
    }
  }
  if (!validDate(content.invoiceDate)) issue('invoiceDate', 'Enter a valid invoice date.')
  if (!validDate(content.dueDate)) issue('dueDate', 'Enter a valid due date.')
  if (validDate(content.invoiceDate) && validDate(content.dueDate) && content.dueDate! < content.invoiceDate!) {
    issue('dueDate', 'Due date cannot precede invoice date.')
  }
  const currencyValid = !!content.currency && supportedCurrencies.includes(content.currency)
  if (!currencyValid) issue('currency', 'Select a supported currency.')
  const precision = currencyValid ? new Intl.NumberFormat('en', { style: 'currency', currency: content.currency! }).resolvedOptions().maximumFractionDigits! : 2
  let subtotal = 0n, discount = 0n, net = 0n, tax = 0n
  const breakdown = new Map<number, bigint>()
  if (!content.lineItems.length) issue('lineItems', 'Add at least one line item.')
  const lines = content.lineItems.map((line, index) => {
    let valid = true
    if (!line.description.trim()) issue(`lineItems.${index}.description`, 'Enter a description.')
    for (const field of ['quantity', 'unitPrice', 'discountPercent', 'taxPercent'] as const) {
      const value = line[field] ?? (field === 'discountPercent' || field === 'taxPercent' ? 0 : null)
      if (value === null || !Number.isFinite(value) || (field === 'quantity' ? value <= 0 : value < 0) || (field === 'discountPercent' && value > 100)) {
        issue(`lineItems.${index}.${field}`, 'Enter a valid amount.'); valid = false
      }
    }
    if (!valid) return { index, gross: null, discount: null, net: null, tax: null, total: null }
    const grossExact = multiply(decimal(line.quantity!), decimal(line.unitPrice!))
    const discounted = percent(line.discountPercent ?? 0)
    const netExact = multiply(grossExact, { n: discounted.d - discounted.n, d: discounted.d })
    const grossMinor = round(grossExact, precision)
    const netMinor = round(netExact, precision)
    // Tax uses the displayed discounted line amount; invoice totals sum displayed amounts.
    const taxMinor = round(multiply({ n: netMinor, d: 10n ** BigInt(precision) }, percent(line.taxPercent ?? 0)), precision)
    const discountMinor = grossMinor - netMinor
    subtotal += grossMinor; discount += discountMinor; net += netMinor; tax += taxMinor
    const rate = line.taxPercent ?? 0
    breakdown.set(rate, (breakdown.get(rate) ?? 0n) + taxMinor)
    return { index, gross: money(grossMinor, precision), discount: money(discountMinor, precision),
      net: money(netMinor, precision), tax: money(taxMinor, precision), total: money(netMinor + taxMinor, precision) }
  })
  return { currency: content.currency, precision, lines, subtotal: money(subtotal, precision),
    totalDiscount: money(discount, precision), net: money(net, precision), tax: money(tax, precision),
    total: money(net + tax, precision), taxBreakdown: [...breakdown].sort(([a], [b]) => a - b).map(([rate, amount]) => ({ rate, amount: money(amount, precision) })),
    diagnostics, complete: diagnostics.length === 0, warnings: currencyReviewRequired
      ? [{ field: 'currency', message: 'Currency changed without conversion. Review every price before issuing.' }] : [] }
}
