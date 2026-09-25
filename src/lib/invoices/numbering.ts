/**
 * Invoice numbers are one ascending whole-number sequence; the *label* a
 * client sees is that counter written through a pattern such as
 * `PS-{YYYY}-{NNN}`. The counter is the truth for uniqueness and order; the
 * label is frozen on each issued invoice so a later pattern change never
 * rewrites what was sent.
 */
export const DEFAULT_NUMBER_PATTERN = '{N}'
export interface NumberFormat { pattern: string }

const TOKEN = /\{(YYYY|YY|N{1,6})\}/g
const ALLOWED = /^[A-Za-z0-9 ._\/-]*$/

/** Why a pattern is unusable, or null when it is fine. */
export function validateNumberPattern(pattern: string): string | null {
  if (typeof pattern !== 'string' || !pattern.trim()) return 'Enter a pattern with a counter, such as INV-{NNNN}.'
  if (pattern.length > 32) return 'Keep the pattern under 32 characters.'
  const tokens = [...pattern.matchAll(TOKEN)].map(match => match[1])
  const counters = tokens.filter(token => token.startsWith('N'))
  if (counters.length !== 1) return 'Use exactly one counter token: {N}, {NN}, {NNN}, {NNNN} or longer.'
  if (tokens.filter(token => token.startsWith('Y')).length > 1) return 'Use at most one year token, {YYYY} or {YY}.'
  const rest = pattern.replace(TOKEN, '')
  if (rest.includes('{') || rest.includes('}')) return 'Only {YYYY}, {YY} and {N…} are tokens; other braces are not allowed.'
  if (!ALLOWED.test(rest)) return 'Use letters, digits, spaces, dots, dashes, underscores and slashes around the tokens.'
  return null
}

/** The label for a counter value, with the year taken from an ISO date when the pattern asks for one. */
export function formatInvoiceNumber(number: number, pattern: string = DEFAULT_NUMBER_PATTERN, date?: string | null): string {
  const safe = validateNumberPattern(pattern) ? DEFAULT_NUMBER_PATTERN : pattern
  const year = date && /^\d{4}/.test(date) ? date.slice(0, 4) : String(new Date().getFullYear())
  return safe.replace(TOKEN, (_, token: string) => {
    if (token === 'YYYY') return year
    if (token === 'YY') return year.slice(2)
    return String(number).padStart(token.length, '0')
  })
}

/** True when the pattern would show a year, so the label depends on the invoice date. */
export const patternUsesYear = (pattern: string): boolean => /\{YY(YY)?\}/.test(pattern)

/**
 * Read a pattern and counter back out of a number someone already uses,
 * e.g. "PS-2026-004" → PS-{YYYY}-{NNN} / 4, "INV0042" → INV{NNNN} / 42, "17" → {N} / 17.
 * The last run of digits is the counter; a four-digit run equal to a plausible
 * year before it becomes the year token.
 */
export function suggestNumberFormat(text: string): { pattern: string; number: number } | null {
  const trimmed = text.trim()
  const runs = [...trimmed.matchAll(/\d+/g)]
  if (!runs.length) return null
  const counter = runs[runs.length - 1]
  const number = Number(counter[0])
  if (!Number.isSafeInteger(number) || number < 1) return null
  // Leading zeros say how wide the counter is written; "17" is just a counter.
  const width = counter[0].startsWith('0') ? Math.min(6, counter[0].length) : 1
  let pattern = trimmed.slice(0, counter.index) + `{${'N'.repeat(width)}}` + trimmed.slice(counter.index! + counter[0].length)
  const year = runs.slice(0, -1).find(run => run[0].length === 4 && Number(run[0]) >= 1990 && Number(run[0]) <= 2100)
  if (year) pattern = pattern.slice(0, year.index) + '{YYYY}' + pattern.slice(year.index! + 4)
  return validateNumberPattern(pattern) ? null : { pattern, number }
}

/** Search matching against a label and its counter: "004", "2026-004", "ps-2026" and "4" all find PS-2026-004. */
export function numberMatches(label: string, number: number, needle: string): boolean {
  const query = needle.trim().toLocaleLowerCase()
  if (!query) return true
  if (label.toLocaleLowerCase().includes(query)) return true
  if (/^\d+$/.test(query)) return String(number) === String(Number(query))
  return false
}
