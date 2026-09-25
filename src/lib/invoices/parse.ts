import { emptyStore, defaultNavigation } from './defaults'
import type { InvoiceStore, NavigationPreferences } from './types'
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
function requireValue(condition: unknown, path: string): asserts condition {
  if (!condition) throw new Error(`Invalid invoice store at ${path}. Stored data was not overwritten.`)
}
function text(v: unknown, path: string) { requireValue(typeof v === 'string', path) }
function party(v: unknown, path: string) {
  requireValue(object(v), path); text(v.name, `${path}.name`); text(v.address, `${path}.address`)
  for (const [key, value] of Object.entries(v)) {
    if (key === 'defaultTermsDays') { requireValue(value === undefined || (Number.isInteger(value) && (value as number) >= 0), `${path}.${key}`); continue }
    text(value, `${path}.${key}`)
  }
}
function presentation(v: unknown, path: string) {
  requireValue(object(v), path)
  const defaults = emptyStore().template
  for (const [key, initial] of Object.entries(defaults)) {
    if (key === 'logoAssetId') requireValue(v[key] === null || typeof v[key] === 'string', path)
    else if (key === 'marginsMm') {
      requireValue(object(v[key]), path)
      for (const side of ['top', 'right', 'bottom', 'left']) requireValue(typeof v[key][side] === 'number' && Number.isFinite(v[key][side]), path)
    } else requireValue(typeof v[key] === typeof initial && (typeof v[key] !== 'number' || Number.isFinite(v[key])), `${path}.${key}`)
  }
}
function content(v: unknown, path: string) {
  requireValue(object(v), path); party(v.sender, `${path}.sender`); party(v.recipient, `${path}.recipient`)
  presentation(v.presentation, `${path}.presentation`)
  for (const key of ['invoiceDate', 'dueDate', 'currency']) requireValue(v[key] === null || typeof v[key] === 'string', `${path}.${key}`)
  for (const key of ['reference', 'notes', 'paymentInstructions']) text(v[key], `${path}.${key}`)
  requireValue(v.termsDays === undefined || v.termsDays === null || (Number.isInteger(v.termsDays) && (v.termsDays as number) >= 0), `${path}.termsDays`)
  requireValue(v.clientId === undefined || typeof v.clientId === 'string', path)
  requireValue(Array.isArray(v.lineItems), path)
  v.lineItems.forEach((line, index) => {
    requireValue(object(line), `${path}.lineItems.${index}`); text(line.description, path)
    for (const key of ['quantity', 'unitPrice', 'discountPercent', 'taxPercent']) {
      requireValue(line[key] === null || (line[key] === undefined && (key === 'discountPercent' || key === 'taxPercent')) ||
        (typeof line[key] === 'number' && Number.isFinite(line[key])), `${path}.lineItems.${index}.${key}`)
    }
  })
}
export function parseStore(value: unknown): InvoiceStore {
  if (value === null) return emptyStore()
  requireValue(object(value) && value.schemaVersion === 1, 'schemaVersion')
  party(value.business, 'business'); text((value.business as Record<string, unknown>).defaultPaymentInstructions, 'business.defaultPaymentInstructions')
  presentation(value.template, 'template')
  for (const key of ['clients', 'drafts', 'invoices', 'assets']) {
    requireValue(object(value[key]), key)
    requireValue(Object.keys(value[key]).every(id => !['__proto__', 'constructor', 'prototype'].includes(id)), key)
  }
  for (const [id, client] of Object.entries(value.clients as Record<string, unknown>)) {
    requireValue(object(client) && client.id === id, `clients.${id}`)
    for (const field of ['name', 'billingAddress', 'updatedAt']) text(client[field], `clients.${id}.${field}`)
    for (const field of ['email', 'phone', 'contactName', 'taxIdentifier', 'currency']) if (client[field] !== undefined) text(client[field], `clients.${id}.${field}`)
    requireValue(client.termsDays === undefined || (Number.isInteger(client.termsDays) && (client.termsDays as number) >= 0), `clients.${id}.termsDays`)
    linkedDocuments(client.documents, `clients.${id}.documents`)
  }
  for (const [id, draft] of Object.entries(value.drafts as Record<string, unknown>)) {
    requireValue(object(draft) && draft.id === id && Number.isSafeInteger(draft.revision) && (draft.revision as number) >= 1 && typeof draft.currencyReviewRequired === 'boolean', `drafts.${id}`)
    text(draft.createdAt, 'draft.createdAt'); text(draft.updatedAt, 'draft.updatedAt'); content(draft.content, `drafts.${id}.content`)
    requireValue(draft.correctionOf === undefined || (typeof draft.correctionOf === 'string' && object(value.invoices) && !!value.invoices[draft.correctionOf]), 'draft.correctionOf')
  }
  requireValue(object(value.sequence) && (value.sequence.format === undefined || (object(value.sequence.format) && typeof value.sequence.format.pattern === 'string')), 'sequence.format')
  requireValue(object(value.sequence) && typeof value.sequence.verified === 'boolean' && Number.isSafeInteger(value.sequence.nextNumber) && (value.sequence.nextNumber as number) >= 1, 'sequence')
  requireValue(Array.isArray(value.sequence.reservedNumbers) && value.sequence.reservedNumbers.every(n => Number.isSafeInteger(n) && n >= 1 && n < ((value.sequence as Record<string, unknown>).nextNumber as number)), 'sequence.reservedNumbers')
  requireValue(new Set(value.sequence.reservedNumbers).size === value.sequence.reservedNumbers.length && Array.isArray(value.sequence.history), 'sequence.history')
  for (const entry of value.sequence.history) {
    requireValue(object(entry) && typeof entry.at === 'string' && Number.isSafeInteger(entry.from) && Number.isSafeInteger(entry.to) && (entry.kind === 'configured' || entry.kind === 'reserved'), 'sequence.history')
  }
  for (const [id, asset] of Object.entries(value.assets as Record<string, unknown>)) {
    requireValue(object(asset) && asset.id === id && typeof asset.readable === 'boolean', 'assets')
    text(asset.name, 'asset.name'); text(asset.mimeType, 'asset.mimeType')
    if (asset.path !== undefined) {
      text(asset.path, 'asset.path'); requireValue(typeof asset.sha256 === 'string' && /^[a-f0-9]{64}$/.test(asset.sha256), 'asset.sha256')
      requireValue(Number.isSafeInteger(asset.byteLength) && (asset.byteLength as number) > 0, 'asset.byteLength')
    }
  }
  if (value.documents !== undefined) {
    requireValue(object(value.documents), 'documents')
    for (const [id, doc] of Object.entries(value.documents)) {
      requireValue(object(doc) && doc.id === id && /^[a-f0-9]{64}$/.test(id), 'document.id')
      requireValue(typeof doc.htmlAssetId === 'string' && Object.hasOwn(value.assets as object, doc.htmlAssetId), 'document.htmlAssetId')
      requireValue(doc.pdfAssetId === undefined || (typeof doc.pdfAssetId === 'string' && Object.hasOwn(value.assets as object, doc.pdfAssetId)), 'document.pdfAssetId')
      requireValue(Number.isSafeInteger(doc.pageCount) && (doc.pageCount as number) >= 0, 'document.pageCount')
    }
  }
  const numbers = new Set<number>()
  const corrections = new Set<string>()
  for (const draft of Object.values(value.drafts as InvoiceStore['drafts'])) {
    if (draft.correctionOf) { requireValue(!corrections.has(draft.correctionOf), 'duplicate correction'); corrections.add(draft.correctionOf) }
  }
  for (const [id, invoice] of Object.entries(value.invoices as Record<string, unknown>)) {
    requireValue(object(invoice) && invoice.id === id && Number.isSafeInteger(invoice.number) && !numbers.has(invoice.number as number), `invoices.${id}`)
    numbers.add(invoice.number as number)
    requireValue(value.sequence.reservedNumbers.includes(invoice.number), 'unreserved invoice number')
    requireValue(typeof invoice.historical === 'boolean' && Array.isArray(invoice.history) && Array.isArray(invoice.versions) && invoice.versions.length > 0, `invoices.${id}`)
    text(invoice.createdAt, 'invoice.createdAt'); text(invoice.updatedAt, 'invoice.updatedAt')
    requireValue(invoice.numberText === undefined || typeof invoice.numberText === 'string', `invoices.${id}.numberText`)
    if (invoice.marks !== undefined) {
      requireValue(object(invoice.marks), `invoices.${id}.marks`)
      for (const field of ['sentAt', 'sentTo', 'paidAt', 'paidReference', 'paidNote']) if (invoice.marks[field] !== undefined) text(invoice.marks[field], `invoices.${id}.marks.${field}`)
    }
    linkedDocuments(invoice.documents, `invoices.${id}.documents`)
    if (invoice.notes !== undefined) {
      requireValue(Array.isArray(invoice.notes), `invoices.${id}.notes`)
      for (const note of invoice.notes as unknown[]) {
        requireValue(object(note), `invoices.${id}.notes`); text(note.id, 'note.id'); text(note.text, 'note.text'); text(note.at, 'note.at')
        if (note.doneAt !== undefined) text(note.doneAt, 'note.doneAt')
      }
    }
    const versionIds = new Set<string>()
    for (const version of invoice.versions) {
      requireValue(object(version), 'version'); text(version.id, 'version.id'); text(version.issuedAt, 'version.issuedAt')
      requireValue(!versionIds.has(version.id as string), 'duplicate version'); versionIds.add(version.id as string)
      content(version.content, `invoices.${id}.versions.content`)
      if (version.numberText !== undefined) text(version.numberText, `invoices.${id}.versions.numberText`)
    }
    requireValue(versionIds.has(invoice.currentVersionId as string), 'currentVersionId')
    for (const entry of invoice.history) {
      requireValue(object(entry), 'history'); text(entry.id, 'history.id'); text(entry.at, 'history.at'); text(entry.kind, 'history.kind')
    }
  }
  if (value.publications !== undefined) {
    requireValue(object(value.publications), 'publications')
    for (const [token, receipt] of Object.entries(value.publications)) {
      requireValue(!['__proto__', 'constructor', 'prototype'].includes(token) && object(receipt) && receipt.confirmationToken === token, 'publication.token')
      const invoice = (value.invoices as InvoiceStore['invoices'])[String(receipt.invoiceId)]
      requireValue(invoice && invoice.number === receipt.number && invoice.versions.some(v => v.id === receipt.versionId && v.issuedAt === receipt.issuedAt), 'publication.version')
      text(receipt.total, 'publication.total'); text(receipt.currency, 'publication.currency')
      requireValue(object(receipt.action) && ['issue', 'publishCorrection', 'registerHistorical'].includes(String(receipt.action.kind)), 'publication.action')
    }
  }
  agreementsAndContractors(value)
  return structuredClone(value) as unknown as InvoiceStore
}
const safeKey = (id: string) => !['__proto__', 'constructor', 'prototype'].includes(id)
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const optionalText = (v: unknown, path: string) => { if (v !== undefined) text(v, path) }
function agreementsAndContractors(value: Record<string, unknown>): void {
  if (value.contractors !== undefined) {
    requireValue(object(value.contractors), 'contractors')
    for (const [id, c] of Object.entries(value.contractors)) {
      requireValue(safeKey(id) && object(c) && c.id === id, `contractors.${id}`)
      text(c.name, `contractors.${id}.name`); text(c.updatedAt, `contractors.${id}.updatedAt`)
      for (const field of ['contactName', 'email', 'address', 'taxIdentifier', 'currency']) optionalText(c[field], `contractors.${id}.${field}`)
      linkedDocuments(c.documents, `contractors.${id}.documents`)
    }
  }
  if (value.agreementTemplates !== undefined) {
    requireValue(object(value.agreementTemplates), 'agreementTemplates')
    for (const [kind, sections] of Object.entries(value.agreementTemplates)) {
      requireValue(['msa', 'sow', 'change-order', 'nda', 'contractor'].includes(kind) && Array.isArray(sections), `agreementTemplates.${kind}`)
      for (const section of sections as unknown[]) { requireValue(object(section), `agreementTemplates.${kind}`); text(section.heading, 'template.heading'); text(section.body, 'template.body') }
    }
  }
  if (value.templates !== undefined) {
    requireValue(object(value.templates), 'templates')
    for (const [id, t] of Object.entries(value.templates)) {
      const path = `templates.${id}`
      requireValue(safeKey(id) && object(t) && t.id === id, path)
      for (const field of ['name', 'title', 'createdAt', 'updatedAt']) text(t[field], `${path}.${field}`)
      for (const field of ['description', 'origin']) optionalText(t[field], `${path}.${field}`)
      requireValue(['msa', 'sow', 'change-order', 'nda', 'contractor'].includes(String(t.kind)) && ['client', 'contractor'].includes(String(t.direction)), `${path}.kind`)
      requireValue(Array.isArray(t.sections) && Array.isArray(t.fields) && Array.isArray(t.milestones) && object(t.fee) && ['fixed', 'monthly', 'hourly', 'none'].includes(String(t.fee.kind)), path)
      for (const x of t.sections as unknown[]) { requireValue(object(x), `${path}.sections`); text(x.heading, 'section.heading'); text(x.body, 'section.body') }
      for (const f of t.fields as unknown[]) {
        requireValue(object(f) && ['party', 'partyContact', 'business', 'parentTitle', 'parentNumber', 'parentDate', 'paymentDays', 'sequence', 'today', 'ask'].includes(String(f.source)), `${path}.fields`)
        text(f.key, 'field.key'); text(f.label, 'field.label'); optionalText(f.default, 'field.default')
        requireValue(f.type === undefined || ['text', 'number', 'money', 'date'].includes(String(f.type)), `${path}.fields.type`)
      }
      for (const field of ['amountField', 'rateField', 'capField']) optionalText(t.fee[field], `${path}.fee.${field}`)
      for (const m of t.milestones as unknown[]) { requireValue(object(m) && finite(m.share) && ['signature', 'done', 'acceptance'].includes(String(m.trigger)), `${path}.milestones`); text(m.label, 'milestone.label') }
      requireValue(t.paymentDays === undefined || t.paymentDays === 'parent' || t.paymentDays === 'client' || (Number.isInteger(t.paymentDays) && (t.paymentDays as number) >= 0), `${path}.paymentDays`)
      requireValue(t.isDefault === undefined || typeof t.isDefault === 'boolean', `${path}.isDefault`)
    }
  }
  if (value.agreements === undefined) return
  requireValue(object(value.agreements), 'agreements')
  for (const [id, a] of Object.entries(value.agreements)) {
    const path = `agreements.${id}`
    requireValue(safeKey(id) && object(a) && a.id === id, path)
    requireValue(['msa', 'sow', 'change-order', 'nda', 'contractor'].includes(String(a.kind)), `${path}.kind`)
    requireValue(['client', 'contractor'].includes(String(a.direction)), `${path}.direction`)
    requireValue(['draft', 'sent', 'signed', 'complete', 'ended'].includes(String(a.status)), `${path}.status`)
    for (const field of ['title', 'currency', 'createdAt', 'updatedAt']) text(a[field], `${path}.${field}`)
    for (const field of ['numberText', 'clientId', 'contractorId', 'parentId', 'startDate', 'endDate', 'signedPdfPath', 'sentAt', 'signedAt', 'closedAt']) optionalText(a[field], `${path}.${field}`)
    requireValue(a.paymentDays === undefined || (Number.isInteger(a.paymentDays) && (a.paymentDays as number) >= 0), `${path}.paymentDays`)
    requireValue(object(a.fee) && ['fixed', 'monthly', 'hourly', 'none'].includes(String(a.fee.kind)), `${path}.fee`)
    for (const field of ['amount', 'rate', 'cap']) requireValue(a.fee[field] === undefined || finite(a.fee[field]), `${path}.fee.${field}`)
    requireValue(Array.isArray(a.sections) && Array.isArray(a.milestones) && Array.isArray(a.invoiceIds) && Array.isArray(a.bills) && Array.isArray(a.signatures) && Array.isArray(a.history), path)
    for (const section of a.sections as unknown[]) { requireValue(object(section), `${path}.sections`); text(section.id, 'section.id'); text(section.heading, 'section.heading'); text(section.body, 'section.body') }
    for (const m of a.milestones as unknown[]) {
      requireValue(object(m) && ['signature', 'done', 'acceptance', 'period'].includes(String(m.trigger)) && finite(m.amount), `${path}.milestones`)
      text(m.id, 'milestone.id'); text(m.label, 'milestone.label')
      for (const field of ['period', 'doneAt', 'invoiceId']) optionalText(m[field], `${path}.milestones.${field}`)
    }
    for (const invoiceId of a.invoiceIds as unknown[]) text(invoiceId, `${path}.invoiceIds`)
    for (const b of a.bills as unknown[]) {
      requireValue(object(b) && finite(b.amount) && (b.hours === undefined || finite(b.hours)), `${path}.bills`)
      for (const field of ['id', 'reference', 'period', 'receivedAt']) text(b[field], `${path}.bills.${field}`)
      for (const field of ['paidAt', 'path']) optionalText(b[field], `${path}.bills.${field}`)
    }
    for (const sig of a.signatures as unknown[]) { requireValue(object(sig) && ['us', 'them'].includes(String(sig.party)), `${path}.signatures`); text(sig.name, 'signature.name'); text(sig.at, 'signature.at') }
    for (const entry of a.history as unknown[]) { requireValue(object(entry), `${path}.history`); text(entry.id, 'history.id'); text(entry.at, 'history.at'); text(entry.note, 'history.note') }
    linkedDocuments(a.documents, `${path}.documents`)
    if (a.notes !== undefined) {
      requireValue(Array.isArray(a.notes), `${path}.notes`)
      for (const note of a.notes as unknown[]) { requireValue(object(note), `${path}.notes`); text(note.id, 'note.id'); text(note.text, 'note.text'); text(note.at, 'note.at'); optionalText(note.doneAt, 'note.doneAt') }
    }
  }
}
function linkedDocuments(value: unknown, path: string): void {
  if (value === undefined) return
  requireValue(Array.isArray(value), path)
  for (const doc of value as unknown[]) {
    requireValue(object(doc) && ['contract', 'sow', 'purchase-order', 'other'].includes(String(doc.kind)), path)
    for (const field of ['id', 'path', 'name', 'addedAt']) text((doc as Record<string, unknown>)[field], `${path}.${field}`)
  }
}
export function assertForwardTransition(previous: InvoiceStore, next: InvoiceStore): void {
  for (const [token, receipt] of Object.entries(previous.publications ?? {})) {
    if (JSON.stringify(next.publications?.[token]) !== JSON.stringify(receipt)) throw new Error('Successful publication tokens are immutable.')
  }
  if (next.sequence.nextNumber < previous.sequence.nextNumber || (previous.sequence.verified && !next.sequence.verified) ||
    previous.sequence.reservedNumbers.some(n => !next.sequence.reservedNumbers.includes(n))) throw new Error('Reserved sequence positions cannot be reset or reused.')
  for (const asset of Object.values(previous.assets)) {
    if (JSON.stringify(next.assets[asset.id]) !== JSON.stringify(asset)) throw new Error('Retained asset copies cannot be replaced or removed.')
  }
  for (const doc of Object.values(previous.documents ?? {})) {
    if (next.documents?.[doc.id]?.htmlAssetId !== doc.htmlAssetId) throw new Error('Retained document HTML is immutable.')
  }
  for (const invoice of Object.values(previous.invoices)) {
    const newer = next.invoices[invoice.id]
    if (!newer || newer.number !== invoice.number || newer.historical !== invoice.historical || (invoice.numberText !== undefined && newer.numberText !== invoice.numberText) ||
      newer.versions.length < invoice.versions.length || invoice.versions.some((version, index) => newer.versions[index]?.id !== version.id) ||
      newer.currentVersionId !== newer.versions.at(-1)?.id ||
      invoice.history.some((entry, index) => JSON.stringify(newer.history[index]) !== JSON.stringify(entry)) || invoice.versions.some(version =>
      JSON.stringify(newer.versions.find(v => v.id === version.id)) !== JSON.stringify(version))) {
      throw new Error('Issued numbers and retained versions are immutable.')
    }
  }
  // A sent agreement's number, parties and text are what the other side has; after signing it never returns to a draft.
  for (const agreement of Object.values(previous.agreements ?? {})) {
    const newer = next.agreements?.[agreement.id]
    if (!newer) { if (agreement.status !== 'draft' || agreement.numberText) throw new Error('A sent agreement cannot be removed.'); continue }
    if (agreement.numberText && newer.numberText !== agreement.numberText) throw new Error('Agreement numbers are fixed once given.')
    if (agreement.kind !== newer.kind || agreement.direction !== newer.direction || (agreement.clientId ?? null) !== (newer.clientId ?? null) || (agreement.contractorId ?? null) !== (newer.contractorId ?? null)) throw new Error('An agreement’s kind and parties are fixed.')
    const signed = ['signed', 'complete', 'ended'].includes(agreement.status)
    if (signed && (newer.status === 'draft' || newer.status === 'sent')) throw new Error('A signed agreement cannot go back to a draft.')
    if (agreement.status !== 'draft' && newer.status !== 'draft' && !agreement.registered && JSON.stringify(newer.sections) !== JSON.stringify(agreement.sections)) throw new Error('A sent agreement’s text is fixed.')
  }
}
export function parseNavigation(value: Record<string, unknown>): NavigationPreferences {
  const nav = value.invoiceNavigation
  if (!object(nav)) return structuredClone(defaultNavigation)
  const archive = object(nav.archive) ? nav.archive : {}
  return {
    destination: ['agreements', 'clients', 'contractors', 'business'].includes(String(nav.destination)) ? nav.destination as NavigationPreferences['destination'] : 'invoices',
    selectedInvoiceId: typeof nav.selectedInvoiceId === 'string' ? nav.selectedInvoiceId : null,
    selectedClientId: typeof nav.selectedClientId === 'string' ? nav.selectedClientId : null,
    selectedAgreementId: typeof nav.selectedAgreementId === 'string' ? nav.selectedAgreementId : null,
    selectedContractorId: typeof nav.selectedContractorId === 'string' ? nav.selectedContractorId : null,
    scrollTop: typeof nav.scrollTop === 'number' && Number.isFinite(nav.scrollTop) && nav.scrollTop >= 0 ? nav.scrollTop : 0,
    archive: {
      query: typeof archive.query === 'string' ? archive.query : undefined,
      clientId: typeof archive.clientId === 'string' ? archive.clientId : undefined,
      status: ['draft', 'issued', 'open', 'sent', 'overdue', 'paid'].includes(String(archive.status)) ? archive.status as 'draft' : 'all',
      historicalOnly: archive.historicalOnly === true,
      sortBy: ['invoiceDate', 'number', 'client'].includes(String(archive.sortBy)) ? archive.sortBy as 'invoiceDate' | 'number' | 'client' : 'updatedAt',
      sortDirection: archive.sortDirection === 'ascending' ? 'ascending' : 'descending',
      cursor: typeof archive.cursor === 'string' ? archive.cursor : undefined,
      limit: typeof archive.limit === 'number' && Number.isInteger(archive.limit) && archive.limit >= 1 && archive.limit <= 100 ? archive.limit : 25,
    },
  }
}
