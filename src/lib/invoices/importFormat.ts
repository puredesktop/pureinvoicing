import { calculateInvoice, validDate } from './calculations'
import { localToday, newId, supportedCurrencies } from './defaults'
import { termsDueDate } from './lifecycle'
import { formatInvoiceNumber, suggestNumberFormat, validateNumberPattern } from './numbering'
import { issuedLabel, numberPattern } from './updates'
import type { Business, Client, InvoiceContent, InvoiceStore, IssuedInvoice, LineItem, Party } from './types'

/** Import schema and validation for user-supplied invoices. See docs/import-format.md. */
export const IMPORT_FORMAT = 'pure-invoicing/1'

export interface ImportBusiness extends Partial<Party> { paymentInstructions?: string; termsDays?: number }
export interface ImportClient { key?: string; name: string; billingAddress?: string; contactName?: string; email?: string; phone?: string; taxIdentifier?: string; termsDays?: number; currency?: string }
export interface ImportInvoice {
  number: number
  label?: string
  client?: string | (Partial<Party> & { name: string })
  issuedAt: string
  dueAt?: string
  termsDays?: number
  currency?: string
  reference?: string
  lines: LineItem[]
  notes?: string
  paymentInstructions?: string
  sentAt?: string
  sentTo?: string
  paidAt?: string
  paidReference?: string
  pdf?: string
  /** A stated total; the app recomputes and warns when they differ. */
  total?: number | string
}
export interface ImportDocument {
  format: typeof IMPORT_FORMAT
  business?: ImportBusiness
  numberFormat?: string
  clients?: ImportClient[]
  invoices: ImportInvoice[]
}

export interface ImportProblem { where: string; message: string }
export interface ImportRowPlan {
  index: number
  number: number
  label: string
  clientName: string
  clientAction: 'link' | 'create' | 'inline'
  total: string
  currency: string | null
  standing: 'paid' | 'sent' | 'issued'
  pdf: string | null
  errors: string[]
  warnings: string[]
  /** Skipped because the counter is already in the archive. */
  conflict: boolean
}
export interface ImportPlan {
  ok: boolean
  problems: ImportProblem[]
  rows: ImportRowPlan[]
  clients: { creating: string[]; linking: string[] }
  business: 'keep' | 'fill' | 'none'
  numberFormat: string | null
  counter: { before: number; after: number }
  counts: { importing: number; conflicts: number; invalid: number }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined)
const day = (v: unknown): string | undefined => {
  const text = str(v)
  if (!text) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : text
}

/** Read the raw JSON into the typed document, or say precisely what is wrong. */
export function parseImportDocument(raw: unknown): { document: ImportDocument | null; problems: ImportProblem[] } {
  const problems: ImportProblem[] = []
  const problem = (where: string, message: string) => problems.push({ where, message })
  let value: unknown = raw
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw) } catch { return { document: null, problems: [{ where: 'file', message: 'Not valid JSON.' }] } }
  }
  if (!isObject(value)) return { document: null, problems: [{ where: 'file', message: 'Expected a JSON object with "format" and "invoices".' }] }
  if (value.format !== IMPORT_FORMAT) problem('format', `Expected "format": "${IMPORT_FORMAT}".`)
  const business: ImportBusiness | undefined = isObject(value.business) ? {
    name: str(value.business.name), address: str(value.business.address), contactName: str(value.business.contactName), email: str(value.business.email), phone: str(value.business.phone), website: str(value.business.website),
    registrationIdentifier: str(value.business.registrationIdentifier), taxIdentifier: str(value.business.taxIdentifier), paymentInstructions: str(value.business.paymentInstructions), termsDays: num(value.business.termsDays),
  } : undefined
  const numberFormat = str(value.numberFormat)
  if (numberFormat !== undefined) { const bad = validateNumberPattern(numberFormat); if (bad) problem('numberFormat', bad) }
  const clients: ImportClient[] = []
  if (value.clients !== undefined) {
    if (!Array.isArray(value.clients)) problem('clients', 'Expected a list.')
    else value.clients.forEach((client, i) => {
      if (!isObject(client) || !str(client.name)?.trim()) { problem(`clients[${i}]`, 'Each client needs a name.'); return }
      clients.push({ key: str(client.key), name: str(client.name)!.trim(), billingAddress: str(client.billingAddress), contactName: str(client.contactName), email: str(client.email), phone: str(client.phone), taxIdentifier: str(client.taxIdentifier), termsDays: num(client.termsDays), currency: str(client.currency)?.toUpperCase() })
    })
  }
  const keys = new Set<string>()
  for (const client of clients) { if (client.key) { if (keys.has(client.key)) problem('clients', `Duplicate client key "${client.key}".`); keys.add(client.key) } }
  const invoices: ImportInvoice[] = []
  if (!Array.isArray(value.invoices) || !value.invoices.length) problem('invoices', 'Expected a non-empty list of invoices.')
  else value.invoices.forEach((row, i) => {
    const where = `invoices[${i}]`
    if (!isObject(row)) { problem(where, 'Each invoice must be an object.'); return }
    const number = num(row.number)
    if (number === undefined || !Number.isInteger(number) || number < 1) problem(where, 'number must be a positive whole number (the counter).')
    const issuedAt = day(row.issuedAt)
    if (!issuedAt || !validDate(issuedAt)) problem(where, 'issuedAt must be an ISO date (YYYY-MM-DD).')
    const dueAt = day(row.dueAt)
    if (dueAt !== undefined && !validDate(dueAt)) problem(where, 'dueAt must be an ISO date (YYYY-MM-DD).')
    let client: ImportInvoice['client']
    if (typeof row.client === 'string') client = row.client
    else if (isObject(row.client) && str(row.client.name)?.trim()) client = { name: str(row.client.name)!.trim(), address: str(row.client.address) ?? str(row.client.billingAddress) ?? '', contactName: str(row.client.contactName), email: str(row.client.email), phone: str(row.client.phone), taxIdentifier: str(row.client.taxIdentifier) }
    else problem(where, 'client must be a client key or an object with a name.')
    if (typeof client === 'string' && !keys.has(client)) problem(where, `client "${client}" is not in clients[].`)
    const lines: LineItem[] = []
    if (!Array.isArray(row.lines) || !row.lines.length) problem(where, 'lines must be a non-empty list.')
    else row.lines.forEach((line, j) => {
      if (!isObject(line) || !str(line.description)?.trim()) { problem(`${where}.lines[${j}]`, 'Each line needs a description.'); return }
      const quantity = num(line.quantity) ?? 1, unitPrice = num(line.unitPrice)
      if (unitPrice === undefined) problem(`${where}.lines[${j}]`, 'unitPrice is required.')
      lines.push({ description: str(line.description)!.trim(), quantity, unitPrice: unitPrice ?? null, discountPercent: num(line.discountPercent) ?? null, taxPercent: num(line.taxPercent) ?? null })
    })
    for (const key of ['sentAt', 'paidAt'] as const) { const d = day(row[key]); if (d !== undefined && !validDate(d)) problem(where, `${key} must be an ISO date.`) }
    const currency = str(row.currency)?.toUpperCase()
    if (currency !== undefined && !supportedCurrencies.includes(currency)) problem(where, `currency "${currency}" is not an ISO 4217 code.`)
    invoices.push({ number: number ?? 0, label: str(row.label)?.trim() || undefined, client, issuedAt: issuedAt ?? '', dueAt, termsDays: num(row.termsDays), currency, reference: str(row.reference), lines,
      notes: str(row.notes), paymentInstructions: str(row.paymentInstructions), sentAt: day(row.sentAt), sentTo: str(row.sentTo), paidAt: day(row.paidAt), paidReference: str(row.paidReference), pdf: str(row.pdf), total: num(row.total) ?? str(row.total) })
  })
  const seen = new Set<number>()
  for (const invoice of invoices) { if (seen.has(invoice.number)) problem('invoices', `Counter ${invoice.number} appears more than once.`); seen.add(invoice.number) }
  return { document: problems.length ? null : { format: IMPORT_FORMAT, business, numberFormat, clients, invoices }, problems }
}

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

function clientOf(document: ImportDocument, store: InvoiceStore, ref: ImportInvoice['client']): { name: string; existing: Client | null; details: ImportClient | null; inline: Party | null } {
  if (typeof ref === 'string') {
    const details = document.clients?.find(client => client.key === ref) ?? null
    const name = details?.name ?? ref
    return { name, existing: Object.values(store.clients).find(client => sameName(client.name, name)) ?? null, details, inline: null }
  }
  const inline: Party = { name: ref?.name ?? '', address: ref?.address ?? '', ...(ref?.contactName ? { contactName: ref.contactName } : {}), ...(ref?.email ? { email: ref.email } : {}), ...(ref?.phone ? { phone: ref.phone } : {}), ...(ref?.taxIdentifier ? { taxIdentifier: ref.taxIdentifier } : {}) }
  return { name: inline.name, existing: Object.values(store.clients).find(client => sameName(client.name, inline.name)) ?? null, details: null, inline }
}

function senderOf(store: InvoiceStore, document: ImportDocument): Party {
  const { defaultPaymentInstructions: _p, defaultTermsDays: _t, ...sender } = store.business
  if (sender.name.trim() && sender.address.trim()) return sender
  const b = document.business ?? {}
  return { ...sender, name: sender.name.trim() || b.name || '', address: sender.address.trim() || b.address || '', ...(b.email ? { email: b.email } : {}), ...(b.phone ? { phone: b.phone } : {}), ...(b.website ? { website: b.website } : {}), ...(b.registrationIdentifier ? { registrationIdentifier: b.registrationIdentifier } : {}), ...(b.taxIdentifier ? { taxIdentifier: b.taxIdentifier } : {}) }
}

function contentOf(store: InvoiceStore, document: ImportDocument, row: ImportInvoice, recipient: Party, clientId: string | undefined, client: ImportClient | null): InvoiceContent {
  const termsDays = row.termsDays ?? client?.termsDays ?? null
  const dueDate = row.dueAt ?? termsDueDate(row.issuedAt, termsDays)
  return { sender: senderOf(store, document), recipient, ...(clientId ? { clientId } : {}), invoiceDate: row.issuedAt, dueDate, termsDays: row.dueAt && row.termsDays === undefined ? null : termsDays,
    reference: row.reference ?? '', currency: row.currency ?? client?.currency ?? 'USD', lineItems: row.lines.map(line => ({ ...line })), notes: row.notes ?? '',
    paymentInstructions: row.paymentInstructions ?? (store.business.defaultPaymentInstructions.trim() || document.business?.paymentInstructions || ''), presentation: structuredClone(store.template) }
}

/** What the import would do, row by row, without touching the store. */
export function planImport(store: InvoiceStore, document: ImportDocument, options: { skipConflicts?: boolean } = {}): ImportPlan {
  const problems: ImportProblem[] = []
  const reserved = new Set(store.sequence.reservedNumbers)
  const pattern = document.numberFormat ?? numberPattern(store)
  const creating = new Set<string>(), linking = new Set<string>()
  const rows: ImportRowPlan[] = document.invoices.map((row, index) => {
    const errors: string[] = [], warnings: string[] = []
    const who = clientOf(document, store, row.client)
    const recipient: Party = who.inline ?? { name: who.name, address: who.existing?.billingAddress ?? who.details?.billingAddress ?? '', ...(who.details?.contactName ? { contactName: who.details.contactName } : {}), ...(who.details?.email ? { email: who.details.email } : {}), ...(who.details?.phone ? { phone: who.details.phone } : {}), ...(who.details?.taxIdentifier ? { taxIdentifier: who.details.taxIdentifier } : {}) }
    const content = contentOf(store, document, row, recipient, who.existing?.id ?? (who.details ? `pending:${who.name}` : undefined), who.details)
    const calculation = calculateInvoice({ ...content, clientId: undefined })
    for (const diagnostic of calculation.diagnostics) errors.push(diagnostic.message.replace(/ before issuing\.$/, '') + ` (${diagnostic.field})`)
    if (row.total !== undefined && Number(row.total).toFixed(calculation.precision) !== Number(calculation.total).toFixed(calculation.precision)) warnings.push(`Stated total ${row.total} differs from the lines (${calculation.total}).`)
    const conflict = reserved.has(row.number)
    if (conflict && !options.skipConflicts) errors.push(`Counter ${row.number} is already in the archive.`)
    const label = row.label ?? formatInvoiceNumber(row.number, pattern, row.issuedAt)
    if (!row.label && !document.numberFormat && pattern === '{N}') warnings.push('No label or numberFormat: the label is the bare counter.')
    if (who.inline) {} else if (who.existing) linking.add(who.existing.name); else creating.add(who.name)
    return { index, number: row.number, label, clientName: who.name, clientAction: who.inline ? 'inline' : who.existing ? 'link' : 'create', total: calculation.total, currency: content.currency,
      standing: row.paidAt ? 'paid' : row.sentAt ? 'sent' : 'issued', pdf: row.pdf ?? null, errors, warnings, conflict }
  })
  const business: ImportPlan['business'] = store.business.name.trim() && store.business.address.trim() ? 'keep' : document.business?.name && document.business.address ? 'fill' : 'none'
  if (business === 'none') problems.push({ where: 'business', message: 'Set up your business name and address first, or include "business" in the file.' })
  const importing = rows.filter(row => !row.errors.length && !row.conflict)
  const highest = importing.reduce((max, row) => Math.max(max, row.number), 0)
  const before = store.sequence.reservedNumbers.reduce((next, n) => Math.max(next, n + 1), store.sequence.nextNumber)
  return { ok: !problems.length && rows.every(row => !row.errors.length) && importing.length > 0, problems, rows,
    clients: { creating: [...creating], linking: [...linking] }, business, numberFormat: document.numberFormat ?? null,
    counter: { before, after: Math.max(before, highest + 1) }, counts: { importing: importing.length, conflicts: rows.filter(row => row.conflict).length, invalid: rows.filter(row => row.errors.length && !row.conflict).length } }
}

export interface ApplyImportInput {
  document: ImportDocument
  plan: ImportPlan
  /** Retained asset ids for original PDFs, by the row's relative path. */
  pdfAssets?: Record<string, string>
  now?: string
}

/** The store after the import: clients linked or created, invoices registered with their counters, marks set, the counter advanced. */
export function applyImport(store: InvoiceStore, input: ApplyImportInput): InvoiceStore {
  const { document, plan } = input
  const now = input.now ?? new Date().toISOString()
  if (!plan.ok) throw new Error('The import has problems. Preview it and fix the file first.')
  let next = structuredClone(store)
  if (plan.business === 'fill' && document.business) {
    const b = document.business
    next.business = { ...next.business, name: b.name ?? next.business.name, address: b.address ?? next.business.address, ...(b.email ? { email: b.email } : {}), ...(b.phone ? { phone: b.phone } : {}), ...(b.website ? { website: b.website } : {}),
      ...(b.registrationIdentifier ? { registrationIdentifier: b.registrationIdentifier } : {}), ...(b.taxIdentifier ? { taxIdentifier: b.taxIdentifier } : {}),
      defaultPaymentInstructions: next.business.defaultPaymentInstructions.trim() || b.paymentInstructions || '', ...(b.termsDays !== undefined && next.business.defaultTermsDays === undefined ? { defaultTermsDays: b.termsDays } : {}) }
  }
  if (document.numberFormat && !next.sequence.format) next.sequence = { ...next.sequence, format: { pattern: document.numberFormat } }
  const clientIds = new Map<string, string>()
  const ensureClient = (details: ImportClient): string => {
    const existing = Object.values(next.clients).find(client => sameName(client.name, details.name))
    if (existing) {
      const merged: Client = { ...existing, billingAddress: existing.billingAddress.trim() || details.billingAddress || '', contactName: existing.contactName || details.contactName, email: existing.email || details.email, phone: existing.phone || details.phone, taxIdentifier: existing.taxIdentifier || details.taxIdentifier, termsDays: existing.termsDays ?? details.termsDays, currency: existing.currency ?? details.currency, updatedAt: now }
      next.clients[existing.id] = JSON.parse(JSON.stringify(merged))
      return existing.id
    }
    const id = newId()
    next.clients[id] = JSON.parse(JSON.stringify({ id, name: details.name, billingAddress: details.billingAddress ?? '', contactName: details.contactName, email: details.email, phone: details.phone, taxIdentifier: details.taxIdentifier, termsDays: details.termsDays, currency: details.currency, updatedAt: now }))
    return id
  }
  for (const client of document.clients ?? []) clientIds.set(client.key ?? client.name, ensureClient(client))
  const reserved = new Set(next.sequence.reservedNumbers)
  for (const row of document.invoices) {
    const planned = plan.rows.find(candidate => candidate.number === row.number)!
    if (planned.conflict || planned.errors.length) continue
    const who = clientOf(document, next, row.client)
    const clientId = typeof row.client === 'string' ? clientIds.get(row.client) : who.existing?.id
    const recipient: Party = who.inline ?? (() => { const c = clientId ? next.clients[clientId] : undefined; return { name: who.name, address: c?.billingAddress ?? '', ...(c?.contactName ? { contactName: c.contactName } : {}), ...(c?.email ? { email: c.email } : {}), ...(c?.phone ? { phone: c.phone } : {}), ...(c?.taxIdentifier ? { taxIdentifier: c.taxIdentifier } : {}) } })()
    const content = contentOf(next, document, row, recipient, clientId, who.details)
    const versionId = newId(), invoiceId = newId()
    const issuedAt = `${row.issuedAt}T12:00:00.000Z`
    const marks = { ...(row.sentAt ? { sentAt: row.sentAt } : {}), ...(row.sentTo ? { sentTo: row.sentTo } : {}), ...(row.paidAt ? { paidAt: row.paidAt } : {}), ...(row.paidReference ? { paidReference: row.paidReference } : {}) }
    const pdfAssetId = row.pdf ? input.pdfAssets?.[row.pdf] : undefined
    const invoice: IssuedInvoice = { id: invoiceId, number: row.number, numberText: planned.label, historical: true, createdAt: now, updatedAt: now, currentVersionId: versionId,
      versions: [{ id: versionId, issuedAt, content }],
      history: [{ id: newId(), at: now, kind: 'historical', versionId, note: `Imported from a ${IMPORT_FORMAT} file.` }, ...(row.sentAt ? [{ id: newId(), at: now, kind: 'sent' as const, note: `Marked sent${row.sentTo ? ` to ${row.sentTo}` : ''} on ${row.sentAt} (imported).` }] : []), ...(row.paidAt ? [{ id: newId(), at: now, kind: 'paid' as const, note: `Marked paid on ${row.paidAt}${row.paidReference ? ` (${row.paidReference})` : ''} (imported).` }] : [])],
      ...(Object.keys(marks).length ? { marks } : {}), ...(pdfAssetId ? { historicalPdf: { assetId: pdfAssetId, provenance: 'unverified-historical-original' as const } } : {}) }
    next.invoices[invoiceId] = invoice
    reserved.add(row.number)
  }
  const numbers = [...reserved].sort((a, b) => a - b)
  const from = store.sequence.reservedNumbers.reduce((n, v) => Math.max(n, v + 1), store.sequence.nextNumber)
  const to = Math.max(from, (numbers[numbers.length - 1] ?? 0) + 1)
  next.sequence = { ...next.sequence, nextNumber: to, reservedNumbers: numbers, history: [...next.sequence.history, { at: now, from, to, kind: 'reserved' }] }
  // The document's label of the invoice it issued is what the client saw; keep it even if it differs from the pattern.
  for (const invoice of Object.values(next.invoices)) if (!invoice.numberText) invoice.numberText = issuedLabel(next, invoice)
  return next
}

/** A starting document for a business that has none: the pattern read back from the newest label. */
export function importTemplate(): ImportDocument {
  return { format: IMPORT_FORMAT, business: { name: '', address: '', paymentInstructions: '' },
    numberFormat: 'INV-{NNNN}', clients: [], invoices: [] }
}

export { suggestNumberFormat }
