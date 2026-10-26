import { currencyPrecision, lineAmount, validDate } from './calculations'
import { localToday, newId, supportedCurrencies } from './defaults'
import { termsDueDate } from './lifecycle'
import { sumMoney } from './money'
import { createDraft, getDraft, issuedLabel, provisionalLabel } from './updates'
import type { Diagnostic, InvoiceStore, Proposal, ProposalContent, ProposalCustomer, ProposalItem, ProposalStatus, ProposalVersion } from './types'

/**
 * Proposals: an enquiry, the offer made in answer, and what the customer
 * decided. Rules, all pure:
 * - A version is a draft until it is offered; an offered version's content
 *   never changes again. Editing after an offer makes the next draft version.
 * - Accepting or declining names one offered version; one version per
 *   proposal can be accepted, and an accepted proposal takes no more edits.
 * - Nothing here touches the invoice counter. Only convertProposal makes an
 *   invoice, an ordinary unnumbered draft, from the accepted version, and it
 *   records the link so a repeat returns that same invoice.
 */
export const PROPOSAL_STATUSES: readonly ProposalStatus[] = ['draft', 'offered', 'accepted', 'declined']
export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = { draft: 'Draft', offered: 'Offered', accepted: 'Accepted', declined: 'Declined' }

export interface ProposalPatch {
  title?: string
  enquiry?: string
  enquiryDate?: string | null
  customer?: Partial<ProposalCustomer>
  scope?: string
  deliverables?: string
  exclusions?: string
  timing?: string
  /** The whole ordered list; it replaces the items. */
  items?: ProposalItem[]
  currency?: string | null
  paymentTerms?: string
  paymentTermsDays?: number | null
}

export function getProposal(store: InvoiceStore, id: string): Proposal {
  const proposal = store.proposals && Object.hasOwn(store.proposals, id) ? store.proposals[id] : undefined
  if (!proposal) throw new Error('Proposal not found. Call listProposals for the ids.')
  return proposal
}

export function getProposalVersion(proposal: Proposal, versionId?: string): ProposalVersion {
  const version = versionId ? proposal.versions.find(v => v.id === versionId) : proposal.versions.at(-1)
  if (!version) throw new Error(`Version ${versionId} is not part of this proposal. Call getProposal for its versions.`)
  return version
}

export const latestVersion = (proposal: Proposal): ProposalVersion => proposal.versions.at(-1)!

/**
 * Where the proposal stands: accepted once a version is accepted; offered
 * while an offer is with the customer (a revision may be in progress);
 * otherwise as its latest version.
 */
export function proposalStatus(proposal: Proposal): ProposalStatus {
  if (proposal.acceptedVersionId) return 'accepted'
  const latest = latestVersion(proposal)
  return latest.status === 'draft' && proposal.versions.some(v => v.status === 'offered') ? 'offered' : latest.status
}

/** Money for one version: each line rounded once to the currency's precision, the total the sum of the shown lines. */
export function calculateProposal(content: ProposalContent) {
  const diagnostics: Diagnostic[] = []
  const issue = (field: string, message: string) => diagnostics.push({ field, message })
  if (!content.customer.name.trim()) issue('customer.name', 'Enter the customer’s name.')
  const currencyValid = !!content.currency && supportedCurrencies.includes(content.currency)
  if (!currencyValid) issue('currency', 'Choose a supported currency.')
  if (content.enquiryDate !== null && !validDate(content.enquiryDate)) issue('enquiryDate', 'Enter a valid date.')
  const precision = currencyPrecision(content.currency)
  if (!content.items.length) issue('items', 'Add at least one item.')
  const lines = content.items.map((item, index) => {
    let valid = true
    if (!item.description.trim()) { issue(`items.${index}.description`, 'Describe the item.'); valid = false }
    if (item.quantity === null || !Number.isFinite(item.quantity) || item.quantity <= 0) { issue(`items.${index}.quantity`, 'Enter a quantity above zero.'); valid = false }
    if (item.unitPrice === null || !Number.isFinite(item.unitPrice) || item.unitPrice < 0) { issue(`items.${index}.unitPrice`, 'Enter a price of zero or more.'); valid = false }
    return { index, amount: valid ? lineAmount(item.quantity!, item.unitPrice!, precision) : null }
  })
  const total = sumMoney(lines.map(line => line.amount ?? '0'), currencyValid ? content.currency : null)
  return { currency: content.currency, precision, lines, total, diagnostics, complete: diagnostics.length === 0 }
}

function cleanItems(items: ProposalItem[]): ProposalItem[] {
  return items.map(item => ({ description: String(item.description ?? ''), quantity: item.quantity ?? null, unitPrice: item.unitPrice ?? null }))
}

export function applyProposalPatch(content: ProposalContent, patch: ProposalPatch): ProposalContent {
  const { customer, items, ...rest } = structuredClone(patch)
  const next: ProposalContent = { ...structuredClone(content), ...rest }
  if (customer) next.customer = { ...next.customer, ...customer }
  if (items) next.items = cleanItems(items)
  if (next.currency) next.currency = next.currency.toUpperCase()
  return next
}

/** The customer, currency and usual terms copied from a directory client; later edits to either side stay apart. */
function withClient(store: InvoiceStore, content: ProposalContent, clientId: string): ProposalContent {
  const client = Object.hasOwn(store.clients, clientId) ? store.clients[clientId] : undefined
  if (!client) throw new Error('Client not found. Call searchClients for the ids.')
  const customer: ProposalCustomer = { name: client.name, address: client.billingAddress }
  for (const key of ['contactName', 'email', 'phone', 'taxIdentifier'] as const) if (client[key]) customer[key] = client[key]
  return { ...content, customer, clientId: client.id, currency: client.currency ?? content.currency, paymentTermsDays: client.termsDays ?? content.paymentTermsDays }
}

export function emptyProposalContent(store: InvoiceStore, today = localToday()): ProposalContent {
  const days = store.business.defaultTermsDays ?? null
  return { title: '', enquiry: '', enquiryDate: today, customer: { name: '', address: '' }, scope: '', deliverables: '', exclusions: '', timing: '',
    items: [{ description: '', quantity: 1, unitPrice: null }], currency: 'USD', paymentTerms: '', paymentTermsDays: days }
}

const historyEntry = (at: string, note: string, versionId?: string) => ({ id: newId(), at, note, ...(versionId ? { versionId } : {}) })
const put = (store: InvoiceStore, proposal: Proposal): InvoiceStore => ({ ...store, proposals: { ...store.proposals, [proposal.id]: proposal } })

export function createProposal(store: InvoiceStore, input: { clientId?: string; details?: ProposalPatch }, id = newId(), versionId = newId(), at = new Date().toISOString(), today = localToday()): InvoiceStore {
  let content = emptyProposalContent(store, today)
  if (input.clientId) content = withClient(store, content, input.clientId)
  if (input.details) content = applyProposalPatch(content, input.details)
  const version: ProposalVersion = { id: versionId, number: 1, status: 'draft', revision: 1, content, createdAt: at, updatedAt: at }
  return put(store, { id, versions: [version], history: [historyEntry(at, 'Proposal started.', versionId)], createdAt: at, updatedAt: at })
}

/**
 * Change the proposal. The latest version takes the change while it is a
 * draft; after it was offered or declined, the change starts the next draft
 * version and the offer stays exactly as it was.
 */
export function updateProposal(store: InvoiceStore, id: string, change: { clientId?: string; changes?: ProposalPatch }, newVersionId = newId(), at = new Date().toISOString()): InvoiceStore {
  const proposal = getProposal(store, id)
  if (proposal.acceptedVersionId) {
    const accepted = getProposalVersion(proposal, proposal.acceptedVersionId)
    throw new Error(`Version ${accepted.number} was accepted, so this proposal is settled. Start a new proposal for further work.`)
  }
  const latest = latestVersion(proposal)
  let content = structuredClone(latest.content)
  if (change.clientId) content = withClient(store, content, change.clientId)
  if (change.changes) content = applyProposalPatch(content, change.changes)
  if (latest.status === 'draft') {
    const version = { ...latest, content, revision: latest.revision + 1, updatedAt: at }
    return put(store, { ...proposal, versions: [...proposal.versions.slice(0, -1), version], updatedAt: at })
  }
  const version: ProposalVersion = { id: newVersionId, number: latest.number + 1, status: 'draft', revision: 1, content, createdAt: at, updatedAt: at, basedOnVersionId: latest.id }
  return put(store, { ...proposal, versions: [...proposal.versions, version], updatedAt: at,
    history: [...proposal.history, historyEntry(at, `Version ${version.number} started from version ${latest.number}, which stays as it was ${latest.status}.`, version.id)] })
}

/**
 * Offered, accepted or declined, on one named version. Offering needs a
 * complete version (customer, currency, priced items). Repeating the status a
 * version already has changes nothing, so a retry is safe.
 */
export function setProposalStatus(store: InvoiceStore, id: string, versionId: string, status: ProposalStatus, at = new Date().toISOString()): InvoiceStore {
  const proposal = getProposal(store, id)
  const version = getProposalVersion(proposal, versionId)
  if (version.status === status) return store
  const replace = (next: ProposalVersion, extra: Partial<Proposal>, note: string) => put(store, { ...proposal, ...extra, updatedAt: at,
    versions: proposal.versions.map(v => (v.id === next.id ? next : v)), history: [...proposal.history, historyEntry(at, note, next.id)] })
  if (status === 'draft') throw new Error(`Version ${version.number} is ${version.status} and stays so. Edit the proposal to start the next draft version.`)
  if (status === 'offered') {
    if (version.status !== 'draft') throw new Error(`Version ${version.number} is already ${version.status}.`)
    if (version.id !== latestVersion(proposal).id) throw new Error('Only the latest version can be offered.')
    const problems = calculateProposal(version.content).diagnostics
    if (problems.length) throw new Error(`Version ${version.number} is not ready to offer: ${problems.map(p => `${p.field} — ${p.message}`).join('; ')}`)
    return replace({ ...version, status: 'offered', offeredAt: at, updatedAt: at }, {}, `Version ${version.number} marked offered.`)
  }
  if (version.status !== 'offered') throw new Error(`Only an offered version can be ${status}; version ${version.number} is ${version.status}. Mark it offered first.`)
  if (status === 'accepted') {
    if (proposal.acceptedVersionId) throw new Error(`Version ${getProposalVersion(proposal, proposal.acceptedVersionId).number} is already the accepted one.`)
    return replace({ ...version, status: 'accepted', decidedAt: at, updatedAt: at }, { acceptedVersionId: version.id }, `Version ${version.number} accepted by the customer.`)
  }
  return replace({ ...version, status: 'declined', decidedAt: at, updatedAt: at }, {}, `Version ${version.number} declined by the customer.`)
}

/** The invoice a conversion made, where it is now: still a draft, issued with its number, or gone. */
export function conversionTarget(store: InvoiceStore, proposal: Proposal) {
  const link = proposal.conversion
  if (!link) return null
  const draft = Object.hasOwn(store.drafts, link.invoiceId) ? store.drafts[link.invoiceId] : undefined
  const invoice = Object.hasOwn(store.invoices, link.invoiceId) ? store.invoices[link.invoiceId] : undefined
  return { ...link, status: invoice ? 'issued' as const : draft ? 'draft' as const : 'missing' as const,
    numberText: invoice ? issuedLabel(store, invoice) : null,
    provisionalNumberText: draft && !invoice ? provisionalLabel(store, draft.content.invoiceDate) : null }
}

/** The invoice content an accepted version becomes: its customer, items, currency and terms, the rest from the business as for any new draft. */
export function invoiceFromProposal(store: InvoiceStore, version: ProposalVersion, draftId: string, at: string, today: string): InvoiceStore {
  const made = createDraft(store, undefined, undefined, draftId, at, today)
  const draft = getDraft(made, draftId), offer = version.content
  const { name, address, ...details } = offer.customer
  const content = { ...draft.content,
    recipient: { name, address, ...details }, ...(offer.clientId ? { clientId: offer.clientId } : {}),
    currency: offer.currency, termsDays: offer.paymentTermsDays,
    dueDate: offer.paymentTermsDays === null ? null : termsDueDate(draft.content.invoiceDate, offer.paymentTermsDays),
    reference: offer.title.trim(),
    lineItems: offer.items.map(item => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })),
    notes: offer.paymentTerms.trim() ? `Payment terms: ${offer.paymentTerms.trim()}` : '' }
  return { ...made, drafts: { ...made.drafts, [draftId]: { ...draft, content, currencyReviewRequired: false } } }
}

/**
 * The explicit step from an accepted offer to an invoice. Only the accepted
 * version converts; a repeat returns the store unchanged and the link names
 * the same invoice. If that draft was discarded, a new one is made and linked.
 */
export function convertProposal(store: InvoiceStore, id: string, versionId: string, draftId = newId(), at = new Date().toISOString(), today = localToday()): InvoiceStore {
  const proposal = getProposal(store, id)
  const version = getProposalVersion(proposal, versionId)
  const existing = conversionTarget(store, proposal)
  if (existing && existing.versionId !== version.id) {
    throw new Error(`This proposal already became an invoice from version ${getProposalVersion(proposal, existing.versionId).number}.`)
  }
  if (existing && existing.status !== 'missing') return store
  if (version.status !== 'accepted' || proposal.acceptedVersionId !== version.id) {
    throw new Error(`Only the accepted version becomes an invoice. Version ${version.number} is ${version.status}; record the customer’s acceptance of an offered version first.`)
  }
  const made = invoiceFromProposal(store, version, draftId, at, today)
  const drafts = { ...made.drafts, [draftId]: { ...made.drafts[draftId], proposalSource: { proposalId: proposal.id, versionId: version.id } } }
  return put({ ...made, drafts }, { ...proposal, conversion: { versionId: version.id, invoiceId: draftId, at }, updatedAt: at,
    history: [...proposal.history, historyEntry(at, existing ? `The earlier invoice draft was discarded; a new draft was made from version ${version.number}.` : `Invoice draft made from accepted version ${version.number}.`, version.id)] })
}

/** One row per proposal for lists. */
export function proposalRows(store: InvoiceStore) {
  return Object.values(store.proposals ?? {}).map(proposal => {
    const latest = latestVersion(proposal)
    const shown = proposal.acceptedVersionId ? getProposalVersion(proposal, proposal.acceptedVersionId) : latest
    const calculation = calculateProposal(shown.content)
    return { id: proposal.id, title: shown.content.title, customer: shown.content.customer.name, clientId: shown.content.clientId ?? null,
      status: proposalStatus(proposal), versionCount: proposal.versions.length, shownVersion: { id: shown.id, number: shown.number, status: shown.status },
      currency: shown.content.currency, total: calculation.total, enquiryDate: shown.content.enquiryDate,
      invoice: conversionTarget(store, proposal), updatedAt: proposal.updatedAt }
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
