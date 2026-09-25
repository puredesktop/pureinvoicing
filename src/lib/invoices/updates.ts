import { localToday, newId } from './defaults'
import { termsDueDate } from './lifecycle'
import { DEFAULT_NUMBER_PATTERN, formatInvoiceNumber, validateNumberPattern } from './numbering'
import type { IssuedInvoice } from './types'
import type { Business, Client, ContentPatch, DefaultSource, Draft, InvoiceContent, InvoiceStore, Sequence } from './types'
export function getDraft(store: InvoiceStore, id: string): Draft {
  const draft = Object.hasOwn(store.drafts, id) ? store.drafts[id] : undefined
  if (!draft) throw new Error('Draft not found. Issued content must be edited through a correction.')
  return draft
}
export function getIssued(store: InvoiceStore, id: string) {
  const invoice = Object.hasOwn(store.invoices, id) ? store.invoices[id] : undefined
  if (!invoice) throw new Error('Issued invoice not found.')
  return invoice
}
export function getVersion(store: InvoiceStore, invoiceId: string, versionId?: string) {
  const invoice = getIssued(store, invoiceId)
  const version = invoice.versions.find(v => v.id === (versionId ?? invoice.currentVersionId))
  if (!version) throw new Error('Retained version not found.')
  return version
}
export function nextAvailableNumber(sequence: Sequence): number {
  return sequence.reservedNumbers.reduce((next, n) => Math.max(next, n + 1), sequence.nextNumber)
}
export function configureSequence(store: InvoiceStore, nextNumber: number, checked: boolean, at = new Date().toISOString()): InvoiceStore {
  if (!checked) throw new Error('Verify the starting point against unregistered invoices first.')
  if (!Number.isSafeInteger(nextNumber) || nextNumber < 1 || nextNumber >= Number.MAX_SAFE_INTEGER) throw new Error('Enter a supported positive whole number.')
  const from = nextAvailableNumber(store.sequence)
  if (nextNumber < from) throw new Error(`The sequence may only move forward from ${from}.`)
  return { ...store, sequence: { ...store.sequence, verified: true, nextNumber,
    history: [...store.sequence.history, { at, from, to: nextNumber, kind: 'configured' }] } }
}
export const numberPattern = (store: InvoiceStore): string => store.sequence.format?.pattern ?? DEFAULT_NUMBER_PATTERN
/** The label an issued invoice carries: the latest version's renumbering, else frozen at issue, else today's pattern. */
export function issuedLabel(store: InvoiceStore, invoice: IssuedInvoice): string {
  const renumbered = [...invoice.versions].reverse().find(v => v.numberText)?.numberText
  if (renumbered) return renumbered
  if (invoice.numberText) return invoice.numberText
  const version = invoice.versions.find(v => v.id === invoice.currentVersionId) ?? invoice.versions[0]
  return formatInvoiceNumber(invoice.number, numberPattern(store), version?.content.invoiceDate ?? version?.issuedAt)
}
/** What a draft will be called if issued now. */
export function provisionalLabel(store: InvoiceStore, invoiceDate: string | null | undefined): string {
  return formatInvoiceNumber(nextAvailableNumber(store.sequence), numberPattern(store), invoiceDate ?? localToday())
}
export function configureNumberFormat(store: InvoiceStore, pattern: string): InvoiceStore {
  const problem = validateNumberPattern(pattern)
  if (problem) throw new Error(problem)
  return { ...store, sequence: { ...store.sequence, format: { pattern } } }
}
// Publication tasks use this inside the same guarded transaction as the issued snapshot.
export function reserveNumber(store: InvoiceStore, number: number, historical = false, at = new Date().toISOString()): InvoiceStore {
  if (!store.sequence.verified) throw new Error('Verify sequence setup before assigning a number.')
  if (!Number.isSafeInteger(number) || number < 1 || number >= Number.MAX_SAFE_INTEGER || store.sequence.reservedNumbers.includes(number)) throw new Error('Invoice number is invalid or already reserved.')
  const from = nextAvailableNumber(store.sequence)
  if (!historical && number !== from) throw new Error('The provisional number changed. Confirm the actual number again.')
  const to = Math.max(from, number + 1)
  return { ...store, sequence: { ...store.sequence, nextNumber: to,
    reservedNumbers: [...store.sequence.reservedNumbers, number].sort((a, b) => a - b),
    history: [...store.sequence.history, { at, from, to, kind: 'reserved' }] } }
}
export function saveClient(store: InvoiceStore, details: Partial<Omit<Client, 'id' | 'updatedAt'>>, clientId = newId(), at = new Date().toISOString(), creating = true): InvoiceStore {
  const current = Object.hasOwn(store.clients, clientId) ? store.clients[clientId] : undefined
  if (!creating && !current) throw new Error('Client not found.')
  // Linked documents change only through linkDocument/unlinkDocument; a details form must not write back a stale copy.
  const { documents: _documents, ...fields } = details
  const client: Client = { billingAddress: '', name: '', ...current, ...fields, id: clientId, updatedAt: at }
  if (!client.name.trim()) throw new Error('A client requires a nonempty name.')
  return { ...store, clients: { ...store.clients, [clientId]: client } }
}
export function updateBusiness(store: InvoiceStore, details: Partial<Business>): InvoiceStore {
  return { ...store, business: { ...store.business, ...details } }
}
export function createDraft(store: InvoiceStore, sourceInvoiceId?: string, sourceVersionId?: string, id = newId(), at = new Date().toISOString(), today = localToday()): InvoiceStore {
  if (sourceVersionId && !sourceInvoiceId) throw new Error('A source version requires a source invoice.')
  let content: InvoiceContent
  let versionId: string | undefined
  let currencyReviewRequired = false
  if (sourceInvoiceId) {
    if (Object.hasOwn(store.invoices, sourceInvoiceId)) {
      const version = getVersion(store, sourceInvoiceId, sourceVersionId)
      content = structuredClone(version.content); versionId = version.id
    } else {
      if (sourceVersionId) throw new Error('Drafts do not have issued versions.')
      const source = getDraft(store, sourceInvoiceId)
      content = structuredClone(source.content); currencyReviewRequired = source.currencyReviewRequired
    }
  } else {
    const { defaultPaymentInstructions, defaultTermsDays, ...sender } = store.business
    content = { sender: structuredClone(sender), recipient: { name: '', address: '' }, invoiceDate: today,
      dueDate: null, termsDays: defaultTermsDays ?? null, reference: '', currency: 'USD', lineItems: [], notes: '',
      paymentInstructions: defaultPaymentInstructions, presentation: structuredClone(store.template) }
  }
  // Today's date; the due date follows the terms when there are any, else it waits for the person.
  content.invoiceDate = today; content.dueDate = termsDueDate(today, content.termsDays); content.reference = ''
  const draft: Draft = { id, revision: 1, createdAt: at, updatedAt: at, content, currencyReviewRequired,
    ...(sourceInvoiceId ? { source: { invoiceId: sourceInvoiceId, ...(versionId ? { versionId } : {}) } } : {}) }
  return { ...store, drafts: { ...store.drafts, [id]: draft } }
}
export function replaceDraft(store: InvoiceStore, draft: Draft, at = new Date().toISOString()): InvoiceStore {
  const previous = getDraft(store, draft.id)
  return { ...store, drafts: { ...store.drafts, [draft.id]: { ...draft, revision: previous.revision + 1, updatedAt: at } } }
}
/** Merge a patch into content. Terms drive the due date: a new invoice date or new terms move it; an explicit due date makes the terms custom. */
export function applyContentPatch(current: InvoiceContent, changes: ContentPatch): InvoiceContent {
  const content = { ...current, ...structuredClone(changes),
    sender: { ...current.sender, ...changes.sender }, recipient: { ...current.recipient, ...changes.recipient } }
  if (changes.dueDate !== undefined && changes.termsDays === undefined) content.termsDays = null
  else if ((changes.invoiceDate !== undefined || changes.termsDays !== undefined) && content.termsDays !== null && content.termsDays !== undefined) content.dueDate = termsDueDate(content.invoiceDate, content.termsDays)
  return content
}
export function updateDraft(store: InvoiceStore, draftId: string, changes: ContentPatch): InvoiceStore {
  const draft = getDraft(store, draftId)
  const content = applyContentPatch(draft.content, changes)
  return replaceDraft(store, { ...draft, content,
    currencyReviewRequired: draft.currencyReviewRequired || (changes.currency !== undefined && changes.currency !== draft.content.currency) })
}
export function applyDefaults(store: InvoiceStore, draftId: string, sources: DefaultSource[], clientId?: string): InvoiceStore {
  const draft = getDraft(store, draftId), content = structuredClone(draft.content)
  let currencyChanged = false
  if (!sources.length) throw new Error('Select defaults to apply.')
  for (const source of sources) {
    switch (source) {
      case 'businessIdentity': { const { defaultPaymentInstructions: _, ...sender } = store.business; content.sender = structuredClone(sender); break }
      case 'paymentInstructions': content.paymentInstructions = store.business.defaultPaymentInstructions; break
      case 'template': content.presentation = structuredClone(store.template); break
      case 'client': {
        const client = clientId && Object.hasOwn(store.clients, clientId) ? store.clients[clientId] : undefined
        if (!client) throw new Error('Select an existing client to apply.')
        const { id, updatedAt: _, billingAddress, termsDays, currency, ...details } = client
        content.recipient = { ...details, address: billingAddress }; content.clientId = id
        if (termsDays !== undefined) { content.termsDays = termsDays; content.dueDate = termsDueDate(content.invoiceDate, termsDays) }
        if (currency && currency !== content.currency) { content.currency = currency; currencyChanged = true }
        break
      }
      default: throw new Error('Unknown default source.')
    }
  }
  return replaceDraft(store, { ...draft, content, currencyReviewRequired: draft.currencyReviewRequired || currencyChanged })
}
export function startCorrection(store: InvoiceStore, invoiceId: string, id = newId(), at = new Date().toISOString()): InvoiceStore {
  getIssued(store, invoiceId)
  if (Object.values(store.drafts).some(d => d.correctionOf === invoiceId)) return store
  const version = getVersion(store, invoiceId)
  return { ...store, drafts: { ...store.drafts, [id]: { id, revision: 1, createdAt: at, updatedAt: at,
    content: structuredClone(version.content), correctionOf: invoiceId, source: { invoiceId, versionId: version.id }, currencyReviewRequired: false } } }
}
export function discardDraft(store: InvoiceStore, draftId: string): InvoiceStore {
  getDraft(store, draftId)
  const drafts = { ...store.drafts }; delete drafts[draftId]
  return { ...store, drafts }
}
export function updateTemplate(store: InvoiceStore, settings: Partial<import('./types').Presentation>): InvoiceStore {
  return { ...store, template: { ...store.template, ...structuredClone(settings) } }
}
export function updateDraftPresentation(store: InvoiceStore, draftId: string, settings: Partial<import('./types').Presentation>): InvoiceStore {
  const draft = getDraft(store, draftId)
  return replaceDraft(store, { ...draft, content: { ...draft.content, presentation: { ...draft.content.presentation, ...structuredClone(settings) } } })
}
export function saveDraftTemplate(store: InvoiceStore, draftId: string): InvoiceStore {
  return { ...store, template: structuredClone(getDraft(store, draftId).content.presentation) }
}
