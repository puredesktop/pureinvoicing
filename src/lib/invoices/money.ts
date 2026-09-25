/** Exact decimal strings in, exact decimal strings out; display formatting is a separate, last step. */
function precisionOf(currency: string | null): number {
  try { return currency ? new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2 : 2 }
  catch { return 2 }
}

function toMinor(amount: string, precision: number): bigint {
  const negative = amount.startsWith('-')
  const [whole, fraction = ''] = amount.replace('-', '').split('.')
  const digits = (whole || '0') + fraction.padEnd(precision, '0').slice(0, precision)
  const value = BigInt(digits)
  return negative ? -value : value
}

function fromMinor(minor: bigint, precision: number): string {
  const negative = minor < 0n
  const text = String(negative ? -minor : minor).padStart(precision + 1, '0')
  const body = precision ? `${text.slice(0, -precision)}.${text.slice(-precision)}` : text
  return negative ? `-${body}` : body
}

/** Sum exact amounts in one currency. */
export function sumMoney(amounts: string[], currency: string | null): string {
  const precision = precisionOf(currency)
  return fromMinor(amounts.reduce((total, amount) => total + toMinor(amount, precision), 0n), precision)
}

export function isZeroMoney(amount: string): boolean { return /^-?0*(\.0*)?$/.test(amount) }

/** "15000.00" + USD → "$15,000.00"; without a currency, grouped digits only. */
export function formatMoney(amount: string, currency: string | null, options: { compact?: boolean } = {}): string {
  const value = Number(amount)
  if (!Number.isFinite(value)) return amount
  try {
    if (currency) return new Intl.NumberFormat('en-US', { style: 'currency', currency, ...(options.compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}) }).format(value)
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
  } catch { return amount }
}

/** Plain grouped digits, no symbol: for tables where the currency is stated once. */
export function formatAmount(amount: string, currency: string | null): string {
  const value = Number(amount)
  if (!Number.isFinite(value)) return amount
  const precision = precisionOf(currency)
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision }).format(value)
}
