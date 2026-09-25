import { calculateInvoice } from './calculations'
import { localToday, newId } from './defaults'
import { invoiceStanding, termsDueDate } from './lifecycle'
import { formatMoney, sumMoney } from './money'
import type { Agreement, AgreementDirection, AgreementKind, AgreementMilestone, AgreementSection, AgreementStatus, Contractor, ContractorBill, InvoiceStore } from './types'
import { applyDefaults, createDraft, getDraft, issuedLabel, replaceDraft } from './updates'

/**
 * Agreements: what may be invoiced (a client's MSA and SOWs) and what may be
 * billed to us (a contractor's agreement). The text is the person's own:
 * built-in skeletons carry headings and bracketed prompts, never legal
 * wording. Once sent, the text is fixed; after signing, only its working
 * record moves: milestones done and invoiced, bills received and paid, notes.
 */

export const KIND_LABEL: Record<AgreementKind, string> = {
  msa: 'Master services agreement', sow: 'Statement of work', 'change-order': 'Change order', nda: 'Mutual NDA', contractor: 'Contractor agreement',
}
const KIND_CODE: Record<AgreementKind, string> = { msa: 'MSA', sow: 'SOW', 'change-order': 'CO', nda: 'NDA', contractor: 'ICA' }
export const KINDS_FOR: Record<AgreementDirection, AgreementKind[]> = { client: ['msa', 'sow', 'change-order', 'nda'], contractor: ['contractor', 'sow', 'change-order', 'nda'] }
export const STATUS_LABEL: Record<AgreementStatus, string> = { draft: 'Draft', sent: 'Sent for signature', signed: 'Active', complete: 'Complete', ended: 'Ended' }
export const TRIGGER_LABEL: Record<AgreementMilestone['trigger'], string> = { signature: 'On signature', done: 'When marked done', acceptance: 'On acceptance', period: 'Monthly' }

const s = (heading: string, body: string) => ({ heading, body })
/** Headings and prompts only; the person's wording (or their saved template) fills them. */
export const SKELETONS: Record<AgreementKind, { heading: string; body: string }[]> = {
  msa: [s('Services and statements of work', '[How work is ordered: each project is a SOW under this agreement]'), s('Fees and payment', '[Invoicing and payment days]'),
    s('Intellectual property', '[Who owns what, and when it passes]'), s('Confidentiality', '[What is confidential and for how long]'), s('Warranties', '[What each side promises]'),
    s('Limitation of liability', '[Caps and exclusions]'), s('Term and termination', '[How long it runs and how either side ends it]'), s('General', '[Governing law, notices, entire agreement]')],
  sow: [s('Background', '[Why this work, and what came before]'), s('Scope of work', '[What will be done]'), s('Deliverables', '[What will be handed over]'),
    s('Fees and milestones', '[The fee; the payment schedule follows this section]'), s('Timeline', '[Start, key dates and end]'), s('Acceptance', '[Who accepts each deliverable, and within how many days]'),
    s('Assumptions and responsibilities', '[What the other side provides; what is out of scope]'), s('Changes and termination', '[Changes go through a written change order]')],
  'change-order': [s('What changes', '[The change to scope or deliverables]'), s('Effect on fees', '[New fee or added milestones]'), s('Effect on timeline', '[New dates]'),
    s('Everything else', 'All other terms of the agreement it amends stay as they are.')],
  nda: [s('Purpose', '[Why information is being shared]'), s('Confidential information', '[What counts]'), s('Obligations', '[How it is protected and used]'),
    s('Exclusions', '[What is not confidential]'), s('Term', '[How long the obligations last]'), s('General', '[Governing law, return of materials]')],
  contractor: [s('Services', '[What the contractor will do]'), s('Term', '[Start and end]'), s('Fees and invoicing', '[Rate, monthly cap, invoice timing and payment days]'),
    s('Work product and intellectual property', '[Assignment of work product to Pure Science]'), s('Confidentiality', '[Including client material]'),
    s('Independent contractor', '[Own tools, own taxes, no employment]'), s('Termination', '[Notice either side gives]'), s('General', '[Governing law, notices]')],
}

const clone = <T>(v: T): T => structuredClone(v)
const nowIso = () => new Date().toISOString()
const log = (a: Agreement, note: string, at: string): Agreement => ({ ...a, updatedAt: at, history: [...a.history, { id: newId(), at, note }] })
export function getAgreement(store: InvoiceStore, id: string): Agreement {
  const a = store.agreements && Object.hasOwn(store.agreements, id) ? store.agreements[id] : undefined
  if (!a) throw new Error('Agreement not found. List agreements to find its id.')
  return a
}
const put = (store: InvoiceStore, a: Agreement): InvoiceStore => ({ ...store, agreements: { ...(store.agreements ?? {}), [a.id]: a } })
const editableText = (a: Agreement) => a.status === 'draft'
/** Registered agreements were signed elsewhere; their terms here are a record, so they stay editable. */
const editableTerms = (a: Agreement) => a.status === 'draft' || !!a.registered
export const partyName = (store: InvoiceStore, a: Pick<Agreement, 'clientId' | 'contractorId'>) =>
  (a.clientId ? store.clients[a.clientId]?.name : a.contractorId ? store.contractors?.[a.contractorId]?.name : undefined) ?? ''

export interface CreateAgreementInput {
  kind: AgreementKind
  direction: AgreementDirection
  clientId?: string
  contractorId?: string
  parentId?: string
  title?: string
  /** skeleton (built-in headings), template (the person's saved wording), copy (another agreement's structure). */
  startFrom?: { kind: 'skeleton' } | { kind: 'template' } | { kind: 'copy'; agreementId: string }
  /** Already signed elsewhere: record it with its own number and date. */
  registered?: { numberText: string; signedAt: string; signedPdfPath?: string }
}
export function createAgreement(store: InvoiceStore, input: CreateAgreementInput, id = newId(), at = nowIso()): InvoiceStore {
  if (!KINDS_FOR[input.direction].includes(input.kind)) throw new Error(`A ${KIND_LABEL[input.kind]} is not offered ${input.direction === 'client' ? 'with a client' : 'with a contractor'}.`)
  if (input.direction === 'client' && (!input.clientId || !store.clients[input.clientId])) throw new Error('Choose the client (clientId).')
  if (input.direction === 'contractor' && (!input.contractorId || !store.contractors?.[input.contractorId])) throw new Error('Choose the contractor (contractorId); save one first with saveContractor.')
  const parent = input.parentId ? getAgreement(store, input.parentId) : undefined
  if (input.kind === 'change-order' && !parent) throw new Error('A change order amends an agreement: give parentId.')
  if (parent && ((parent.clientId ?? null) !== (input.clientId ?? null) || (parent.contractorId ?? null) !== (input.contractorId ?? null))) throw new Error('The parent agreement is with someone else.')
  const client = input.clientId ? store.clients[input.clientId] : undefined
  const contractor = input.contractorId ? store.contractors?.[input.contractorId] : undefined
  let sections = (store.agreementTemplates?.[input.kind] && input.startFrom?.kind === 'template' ? store.agreementTemplates[input.kind]! : SKELETONS[input.kind])
    .map(x => ({ id: newId(), heading: x.heading, body: x.body }))
  let fee: Agreement['fee'] = input.kind === 'sow' || input.kind === 'change-order' ? { kind: 'fixed' } : input.kind === 'contractor' ? { kind: 'hourly' } : { kind: 'none' }
  let milestones: AgreementMilestone[] = []
  if (input.startFrom?.kind === 'copy') {
    const source = getAgreement(store, input.startFrom.agreementId)
    // The structure carries over; what is specific to that project starts empty so nothing of it goes out by mistake.
    const specific = /scope|deliverable|background|timeline|fee|milestone|what changes|effect|services|term$/i
    sections = source.sections.map(x => ({ id: newId(), heading: x.heading, body: specific.test(x.heading) ? `[${x.heading} for this agreement]` : x.body }))
    fee = { kind: source.fee.kind }
    milestones = source.milestones.filter(m => m.trigger !== 'period').map(m => ({ id: newId(), label: m.label, amount: 0, trigger: m.trigger }))
  }
  const siblings = Object.values(store.agreements ?? {}).filter(a => a.kind === input.kind && (a.clientId ?? a.contractorId) === (input.clientId ?? input.contractorId))
  const title = input.title?.trim() || (input.kind === 'sow' ? `Statement of Work #${siblings.length + 1}` : input.kind === 'change-order' ? `Change order #${siblings.filter(a => a.parentId === parent!.id).length + 1} to ${parent!.title}` : KIND_LABEL[input.kind])
  const registered = input.registered
  if (registered && (!registered.numberText.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(registered.signedAt))) throw new Error('A registered agreement needs its number and signing date (YYYY-MM-DD).')
  const a: Agreement = {
    id, kind: input.kind, direction: input.direction, title, status: registered ? 'signed' : 'draft',
    ...(input.clientId ? { clientId: input.clientId } : {}), ...(input.contractorId ? { contractorId: input.contractorId } : {}), ...(parent ? { parentId: parent.id } : {}),
    ...(registered ? { registered: true, numberText: registered.numberText.trim(), signedAt: registered.signedAt, ...(registered.signedPdfPath ? { signedPdfPath: registered.signedPdfPath } : {}) } : {}),
    sections: registered ? [] : sections, currency: parent?.currency ?? client?.currency ?? contractor?.currency ?? 'USD', fee,
    ...((parent?.paymentDays ?? client?.termsDays) !== undefined ? { paymentDays: parent?.paymentDays ?? client?.termsDays } : {}),
    milestones, invoiceIds: [], bills: [], signatures: [], history: [{ id: newId(), at, note: registered ? `Registered: signed ${registered.signedAt} as ${registered.numberText.trim()}.` : `Drafted from ${input.startFrom?.kind === 'copy' ? 'a copy' : input.startFrom?.kind === 'template' ? 'your template' : 'the outline'}.` }],
    createdAt: at, updatedAt: at,
  }
  return put(store, a)
}

export interface AgreementPatch {
  title?: string; currency?: string; paymentDays?: number | null; startDate?: string | null; endDate?: string | null
  fee?: Agreement['fee']; parentId?: string | null
  sections?: { id?: string; heading: string; body: string }[]
  /** The planned milestones (not retainer months), replaced as a whole. */
  milestones?: { id?: string; label: string; amount: number; trigger: 'signature' | 'done' | 'acceptance' }[]
}
const isoDate = (v: string, what: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${what}: use a date like 2026-10-01.`); return v }
export function updateAgreement(store: InvoiceStore, id: string, patch: AgreementPatch, at = nowIso()): InvoiceStore {
  let a = clone(getAgreement(store, id))
  const textChange = patch.title !== undefined || patch.sections !== undefined || patch.parentId !== undefined
  const termsChange = patch.currency !== undefined || patch.paymentDays !== undefined || patch.startDate !== undefined || patch.endDate !== undefined || patch.fee !== undefined || patch.milestones !== undefined
  if (textChange && !editableText(a) && !(a.registered && patch.sections === undefined)) throw new Error(`${a.numberText ?? 'This agreement'} was sent; its text is fixed. Use a change order, or withdraw it to a draft if it is not signed yet.`)
  if (termsChange && !editableTerms(a)) throw new Error(`${a.numberText ?? 'This agreement'} was sent; its terms are fixed. Use a change order.`)
  if (patch.title !== undefined) { if (!patch.title.trim()) throw new Error('Give the agreement a title.'); a.title = patch.title.trim() }
  if (patch.currency !== undefined) a.currency = patch.currency
  if (patch.paymentDays !== undefined) { if (patch.paymentDays === null) delete a.paymentDays; else { if (!Number.isInteger(patch.paymentDays) || patch.paymentDays < 0) throw new Error('Payment days: a whole number.'); a.paymentDays = patch.paymentDays } }
  if (patch.startDate !== undefined) { if (patch.startDate === null) delete a.startDate; else a.startDate = isoDate(patch.startDate, 'Start date') }
  if (patch.endDate !== undefined) { if (patch.endDate === null) delete a.endDate; else a.endDate = isoDate(patch.endDate, 'End date') }
  if (patch.parentId !== undefined) { if (patch.parentId === null) delete a.parentId; else { getAgreement(store, patch.parentId); a.parentId = patch.parentId } }
  if (patch.fee !== undefined) {
    const f = patch.fee
    if (!['fixed', 'monthly', 'hourly', 'none'].includes(f.kind)) throw new Error('fee.kind: fixed, monthly, hourly or none.')
    for (const k of ['amount', 'rate', 'cap'] as const) if (f[k] !== undefined && (!Number.isFinite(f[k]) || f[k]! < 0)) throw new Error(`fee.${k} must be a positive number.`)
    a.fee = { kind: f.kind, ...(f.amount !== undefined ? { amount: f.amount } : {}), ...(f.rate !== undefined ? { rate: f.rate } : {}), ...(f.cap !== undefined ? { cap: f.cap } : {}) }
  }
  if (patch.sections !== undefined) a.sections = patch.sections.map(x => ({ id: x.id ?? newId(), heading: x.heading, body: x.body }))
  if (patch.milestones !== undefined) {
    const kept = a.milestones.filter(m => m.trigger === 'period')
    const byId = new Map(a.milestones.map(m => [m.id, m]))
    a.milestones = [...patch.milestones.map(m => {
      if (!m.label.trim()) throw new Error('Each milestone needs a label.')
      if (!Number.isFinite(m.amount) || m.amount < 0) throw new Error('Milestone amounts are positive numbers.')
      const prior = m.id ? byId.get(m.id) : undefined
      if (prior?.invoiceId && (prior.amount !== m.amount)) throw new Error(`“${prior.label}” is already invoiced; its amount stays.`)
      return { ...(prior ?? {}), id: m.id ?? newId(), label: m.label.trim(), amount: m.amount, trigger: m.trigger }
    }), ...kept]
    for (const prior of byId.values()) if (prior.invoiceId && !a.milestones.some(m => m.id === prior.id)) throw new Error(`“${prior.label}” is already invoiced and cannot be removed.`)
  }
  return put(store, { ...a, updatedAt: at })
}

/** Add, change or remove one section (the assistant edits section by section). */
export function editSection(store: InvoiceStore, id: string, change: { sectionId?: string; heading?: string; body?: string; remove?: boolean; afterSectionId?: string }, at = nowIso()): { store: InvoiceStore; sectionId: string } {
  const a = getAgreement(store, id)
  if (!editableText(a)) throw new Error(`${a.numberText ?? 'This agreement'} was sent; its text is fixed.`)
  let sections = [...a.sections]
  if (!change.sectionId) {
    if (!change.heading?.trim()) throw new Error('A new section needs a heading.')
    const section = { id: newId(), heading: change.heading.trim(), body: change.body ?? '' }
    const index = change.afterSectionId ? sections.findIndex(x => x.id === change.afterSectionId) + 1 : sections.length
    sections.splice(index > 0 ? index : sections.length, 0, section)
    return { sectionId: section.id, store: put(store, { ...a, sections, updatedAt: at }) }
  }
  const index = sections.findIndex(x => x.id === change.sectionId)
  if (index < 0) throw new Error('Section not found; read the agreement for section ids.')
  if (change.remove) sections = sections.filter(x => x.id !== change.sectionId)
  else sections[index] = { ...sections[index], ...(change.heading !== undefined ? { heading: change.heading } : {}), ...(change.body !== undefined ? { body: change.body } : {}) }
  return { sectionId: change.sectionId, store: put(store, { ...a, sections, updatedAt: at }) }
}

export interface AgreementCheck { level: 'block' | 'warn' | 'ok'; message: string; sectionId?: string }
const PLACEHOLDER = /\[[^\]\n]{1,120}\]/g
const HAS_PLACEHOLDER = /\[[^\]\n]{1,120}\]/
/** What stands between a draft and sending it. Blocks stop sending; warnings are worth a look. */
export function agreementChecks(store: InvoiceStore, a: Agreement): AgreementCheck[] {
  const checks: AgreementCheck[] = []
  if (!partyName(store, a)) checks.push({ level: 'block', message: a.direction === 'client' ? 'No client chosen.' : 'No contractor chosen.' })
  for (const section of a.sections) {
    const count = (section.heading.match(PLACEHOLDER)?.length ?? 0) + (section.body.match(PLACEHOLDER)?.length ?? 0)
    if (count) checks.push({ level: 'block', message: `${section.heading || 'A section'}: ${count} placeholder${count === 1 ? '' : 's'} still in brackets`, sectionId: section.id })
    else if (!section.body.trim()) checks.push({ level: 'warn', message: `${section.heading || 'A section'} is empty`, sectionId: section.id })
  }
  if (!a.sections.length && !a.registered) checks.push({ level: 'block', message: 'The agreement has no sections.' })
  const planned = a.milestones.filter(m => m.trigger !== 'period')
  if (a.fee.kind === 'fixed') {
    if (!a.fee.amount) checks.push({ level: 'block', message: 'The fixed fee has no amount.' })
    else if (!planned.length) checks.push({ level: 'warn', message: 'No payment milestones: nothing will prompt an invoice.' })
    else {
      const total = sumMoney(planned.map(m => String(m.amount)), a.currency), fee = sumMoney([String(a.fee.amount)], a.currency)
      if (total !== fee) checks.push({ level: 'block', message: `Milestones add up to ${total}, the fee is ${fee}.` })
      else checks.push({ level: 'ok', message: 'Milestones add up to the fee.' })
    }
  }
  if (a.fee.kind === 'monthly' && !a.fee.amount) checks.push({ level: 'block', message: 'The monthly fee has no amount.' })
  if (a.fee.kind === 'hourly' && !a.fee.rate) checks.push({ level: 'block', message: 'The hourly rate is missing.' })
  if (a.fee.kind === 'hourly' && !a.fee.cap) checks.push({ level: 'warn', message: 'No monthly cap: bills cannot be checked against one.' })
  if (planned.some(m => m.trigger === 'acceptance') && !a.sections.some(x => /accept/i.test(x.heading) && x.body.trim() && !HAS_PLACEHOLDER.test(x.body))) {
    checks.push({ level: 'warn', message: 'A milestone waits on acceptance, but no Acceptance section says who accepts and when.' })
  }
  if ((a.kind === 'sow' || a.kind === 'contractor') && !a.endDate) checks.push({ level: 'warn', message: 'No end date.' })
  const parent = a.parentId ? store.agreements?.[a.parentId] : undefined
  if (parent && parent.paymentDays !== undefined) {
    if (a.paymentDays !== undefined && a.paymentDays !== parent.paymentDays) checks.push({ level: 'warn', message: `Payment days (${a.paymentDays}) differ from the ${KIND_LABEL[parent.kind].toLowerCase()} (${parent.paymentDays}).` })
    else checks.push({ level: 'ok', message: `Payment days match the ${KIND_LABEL[parent.kind].toLowerCase()} (${parent.paymentDays}).` })
  }
  return checks
}

/** PS-SOW-2026-03: the invoice pattern's prefix, the kind, the year, a count per kind and year. */
export function nextAgreementNumber(store: InvoiceStore, kind: AgreementKind, date = localToday()): string {
  const pattern = store.sequence.format?.pattern ?? ''
  const prefix = (pattern.split('{')[0] ?? '').replace(/[-_ /]+$/, '') || 'AG'
  const year = date.slice(0, 4), stem = `${prefix}-${KIND_CODE[kind]}-${year}-`
  const used = Object.values(store.agreements ?? {}).map(a => a.numberText).filter((n): n is string => !!n?.startsWith(stem)).map(n => Number(n.slice(stem.length))).filter(Number.isFinite)
  return `${stem}${String((used.length ? Math.max(...used) : 0) + 1).padStart(2, '0')}`
}

export function sendAgreement(store: InvoiceStore, id: string, at = nowIso()): InvoiceStore {
  const a = getAgreement(store, id)
  if (a.status !== 'draft') throw new Error(`${a.numberText ?? 'This agreement'} is ${STATUS_LABEL[a.status].toLowerCase()}, not a draft.`)
  const blocks = agreementChecks(store, a).filter(c => c.level === 'block')
  if (blocks.length) throw new Error(`Not ready to send: ${blocks.map(b => b.message).join('; ')}.`)
  const numberText = a.numberText ?? nextAgreementNumber(store, a.kind, at.slice(0, 10))
  return put(store, log({ ...a, numberText, status: 'sent', sentAt: at }, `Sent for signature as ${numberText}.`, at))
}
/** Back to a draft before anyone signs (the number is kept). */
export function withdrawAgreement(store: InvoiceStore, id: string, at = nowIso()): InvoiceStore {
  const a = getAgreement(store, id)
  if (a.status !== 'sent') throw new Error('Only an agreement sent and not yet signed can go back to a draft.')
  return put(store, log({ ...a, status: 'draft' }, 'Withdrawn to a draft for changes.', at))
}
export function markSigned(store: InvoiceStore, id: string, input: { ours: { name: string; at: string }; theirs: { name: string; at: string }; signedPdfPath?: string }, at = nowIso()): InvoiceStore {
  const a = getAgreement(store, id)
  if (a.status !== 'sent' && a.status !== 'draft') throw new Error(`${a.numberText ?? 'This agreement'} is already ${STATUS_LABEL[a.status].toLowerCase()}.`)
  if (a.status === 'draft') { const blocks = agreementChecks(store, a).filter(c => c.level === 'block'); if (blocks.length) throw new Error(`Not ready: ${blocks.map(b => b.message).join('; ')}.`) }
  for (const who of [input.ours, input.theirs]) { if (!who.name.trim()) throw new Error('Name who signed for each side.'); isoDate(who.at, 'Signing date') }
  const signedAt = input.ours.at > input.theirs.at ? input.ours.at : input.theirs.at
  const numberText = a.numberText ?? nextAgreementNumber(store, a.kind, signedAt)
  const milestones = a.milestones.map(m => m.trigger === 'signature' && !m.doneAt ? { ...m, doneAt: signedAt } : m)
  return put(store, log({ ...a, numberText, status: 'signed', signedAt, milestones, signatures: [{ party: 'us', name: input.ours.name.trim(), at: input.ours.at }, { party: 'them', name: input.theirs.name.trim(), at: input.theirs.at }],
    ...(input.signedPdfPath ? { signedPdfPath: input.signedPdfPath } : {}) }, `Signed by both (${signedAt}).`, at))
}
export function closeAgreement(store: InvoiceStore, id: string, how: 'complete' | 'ended', at = nowIso()): InvoiceStore {
  const a = getAgreement(store, id)
  if (a.status !== 'signed') throw new Error('Only an active agreement can be completed or ended.')
  return put(store, log({ ...a, status: how, closedAt: at }, how === 'complete' ? 'Marked complete.' : 'Ended.', at))
}
export function reopenAgreement(store: InvoiceStore, id: string, at = nowIso()): InvoiceStore {
  const a = getAgreement(store, id)
  if (a.status !== 'complete' && a.status !== 'ended') throw new Error('Only a completed or ended agreement can be reopened.')
  const { closedAt: _closed, ...rest } = a
  return put(store, log({ ...rest, status: 'signed' }, 'Reopened.', at))
}
export function setMilestoneDone(store: InvoiceStore, id: string, milestoneId: string, done: boolean, at = nowIso(), today = localToday()): InvoiceStore {
  const a = getAgreement(store, id)
  if (a.status === 'draft' || a.status === 'sent') throw new Error('Milestones are marked once the agreement is signed.')
  const m = a.milestones.find(x => x.id === milestoneId)
  if (!m) throw new Error('Milestone not found.')
  if (m.invoiceId && !done) throw new Error(`“${m.label}” is invoiced; it stays done.`)
  const milestones = a.milestones.map(x => x.id !== milestoneId ? x : done ? { ...x, doneAt: x.doneAt ?? today } : (({ doneAt: _d, ...r }) => r)(x))
  return put(store, log({ ...a, milestones }, `${m.label}: ${done ? 'done' : 'not done'}.`, at))
}

function draftFor(store: InvoiceStore, a: Agreement, lineLabel: string, amount: number, reference: string, draftId: string, at: string, today: string): InvoiceStore {
  if (a.direction !== 'client' || !a.clientId) throw new Error('Only client agreements are invoiced from here; contractor bills are recorded against the agreement.')
  let next = createDraft(store, undefined, undefined, draftId, at, today)
  next = applyDefaults(next, draftId, ['client'], a.clientId)
  const draft = getDraft(next, draftId)
  const termsDays = a.paymentDays ?? draft.content.termsDays
  return replaceDraft(next, { ...draft, content: { ...draft.content, currency: a.currency, reference, termsDays, dueDate: termsDueDate(draft.content.invoiceDate, termsDays),
    lineItems: [{ description: lineLabel, quantity: 1, unitPrice: amount, discountPercent: null, taxPercent: null }] } })
}
/** The invoice draft for a milestone that is due; the milestone keeps its id so the link survives issue. */
export function invoiceMilestone(store: InvoiceStore, id: string, milestoneId: string, draftId = newId(), at = nowIso(), today = localToday()): InvoiceStore {
  const a = getAgreement(store, id)
  if (a.status !== 'signed' && a.status !== 'complete') throw new Error('Invoice milestones once the agreement is signed.')
  const index = a.milestones.findIndex(x => x.id === milestoneId), m = a.milestones[index]
  if (!m) throw new Error('Milestone not found.')
  if (m.invoiceId) throw new Error(`“${m.label}” is already invoiced.`)
  if (!m.doneAt) throw new Error(`“${m.label}” is not due yet: ${m.trigger === 'acceptance' ? 'record the acceptance first' : 'mark it done first'}.`)
  const next = draftFor(store, a, `${a.title} — ${m.label}`, m.amount, `${a.numberText ?? a.title} · milestone ${index + 1}`, draftId, at, today)
  return put(next, log({ ...a, milestones: a.milestones.map(x => x.id === milestoneId ? { ...x, invoiceId: draftId } : x) }, `Invoice drafted for “${m.label}”.`, at))
}
export const periodLabel = (period: string) => new Date(`${period}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
/** A retainer month: one draft per month, never two. */
export function invoicePeriod(store: InvoiceStore, id: string, period: string, draftId = newId(), at = nowIso(), today = localToday()): InvoiceStore {
  const a = getAgreement(store, id)
  if (a.fee.kind !== 'monthly' || !a.fee.amount) throw new Error('Only a monthly retainer is invoiced by month.')
  if (a.status !== 'signed') throw new Error('Invoice months once the agreement is signed and active.')
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('period: a month like 2026-09.')
  if (a.milestones.some(m => m.period === period && m.invoiceId)) throw new Error(`${periodLabel(period)} is already invoiced.`)
  const label = periodLabel(period)
  const next = draftFor(store, a, `${a.title}, ${label}`, a.fee.amount, `${a.numberText ?? a.title} · ${label}`, draftId, at, today)
  return put(next, log({ ...a, milestones: [...a.milestones, { id: newId(), label, amount: a.fee.amount, trigger: 'period', period, doneAt: today, invoiceId: draftId }] }, `Invoice drafted for ${label}.`, at))
}
export function linkInvoice(store: InvoiceStore, id: string, invoiceId: string, link: boolean, at = nowIso()): InvoiceStore {
  const a = getAgreement(store, id)
  if (a.direction !== 'client') throw new Error('Invoices link to client agreements.')
  if (link && !store.invoices[invoiceId] && !store.drafts[invoiceId]) throw new Error('Invoice not found.')
  const invoiceIds = link ? [...new Set([...a.invoiceIds, invoiceId])] : a.invoiceIds.filter(x => x !== invoiceId)
  return put(store, log({ ...a, invoiceIds }, `${link ? 'Linked' : 'Unlinked'} invoice ${store.invoices[invoiceId] ? issuedLabel(store, store.invoices[invoiceId]) : 'draft'}.`, at))
}

export interface BillingLine { invoiceId: string; label: string; total: string; status: 'draft' | 'issued' | 'paid' | 'missing'; milestoneId?: string }
/** Every invoice billed against a client agreement, and how much of the fee is left to bill. */
export function agreementBilling(store: InvoiceStore, a: Agreement) {
  const ids = [...new Set([...a.milestones.map(m => m.invoiceId).filter((x): x is string => !!x), ...a.invoiceIds])]
  const lines: BillingLine[] = ids.map(invoiceId => {
    const milestoneId = a.milestones.find(m => m.invoiceId === invoiceId)?.id
    const issued = store.invoices[invoiceId], draft = store.drafts[invoiceId]
    if (issued) {
      const version = issued.versions.find(v => v.id === issued.currentVersionId) ?? issued.versions[0]
      return { invoiceId, milestoneId, label: issuedLabel(store, issued), total: calculateInvoice(version.content).total, status: invoiceStanding(issued).mark === 'paid' ? 'paid' : 'issued' }
    }
    if (draft) return { invoiceId, milestoneId, label: 'Draft', total: calculateInvoice(draft.content).total, status: 'draft' }
    return { invoiceId, milestoneId, label: 'Discarded draft', total: '0', status: 'missing' }
  })
  const invoiced = sumMoney(lines.filter(l => l.status === 'issued' || l.status === 'paid').map(l => l.total), a.currency)
  const paid = sumMoney(lines.filter(l => l.status === 'paid').map(l => l.total), a.currency)
  const agreed = a.fee.kind === 'fixed' && a.fee.amount !== undefined ? sumMoney([String(a.fee.amount)], a.currency) : null
  const toBill = agreed === null ? null : sumMoney([agreed, `-${invoiced}`], a.currency)
  return { lines, invoiced, paid, agreed, toBill }
}
/** The months of an active retainer that have not been invoiced, up to this month. */
export function unbilledPeriods(a: Agreement, today = localToday()): string[] {
  if (a.fee.kind !== 'monthly' || a.status !== 'signed' || !a.startDate) return []
  const done = new Set(a.milestones.filter(m => m.period && m.invoiceId).map(m => m.period))
  const out: string[] = []
  let [y, m] = a.startDate.slice(0, 7).split('-').map(Number)
  const end = (a.endDate && a.endDate < today ? a.endDate : today).slice(0, 7)
  for (let guard = 0; guard < 120; guard++) {
    const period = `${y}-${String(m).padStart(2, '0')}`
    if (period > end) break
    if (!done.has(period)) out.push(period)
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}

/** A contractor's bill against the agreement: its rate, and its monthly cap (counting this month's bills up to and including this one). */
export function billCheck(a: Agreement, bill: ContractorBill): { level: 'ok' | 'warn'; message: string } {
  const show = (n: number) => formatMoney(sumMoney([String(n)], a.currency), a.currency)
  if (a.fee.kind === 'hourly' && a.fee.rate && bill.hours !== undefined) {
    const expected = sumMoney([String(a.fee.rate * bill.hours)], a.currency), got = sumMoney([String(bill.amount)], a.currency)
    if (expected !== got) return { level: 'warn', message: `${bill.hours} h at the agreed rate is ${show(Number(expected))}, the bill says ${show(bill.amount)}` }
  }
  if (a.fee.cap) {
    const index = a.bills.findIndex(b => b.id === bill.id)
    const upTo = (index < 0 ? [...a.bills, bill] : a.bills.slice(0, index + 1)).filter(b => b.period === bill.period)
    const month = upTo.reduce((sum, b) => sum + b.amount, 0)
    if (month > a.fee.cap && !bill.approvedOverCap) return { level: 'warn', message: `Takes ${periodLabel(bill.period)} to ${show(month)}, over the ${show(a.fee.cap)} cap` }
  }
  if (a.fee.kind === 'monthly' && a.fee.amount && bill.amount > a.fee.amount) return { level: 'warn', message: `More than the agreed ${show(a.fee.amount)} a month` }
  return { level: 'ok', message: bill.approvedOverCap ? 'Approved over the cap' : 'Matches the agreement' }
}
export function addBill(store: InvoiceStore, id: string, input: Omit<ContractorBill, 'id' | 'receivedAt'> & { receivedAt?: string }, at = nowIso(), today = localToday()): { store: InvoiceStore; billId: string } {
  const a = getAgreement(store, id)
  if (a.direction !== 'contractor') throw new Error('Bills are recorded against contractor agreements.')
  if (a.status === 'draft' || a.status === 'sent') throw new Error('Record bills once the agreement is signed.')
  if (!input.reference.trim()) throw new Error('Give the bill’s own number or reference.')
  if (!/^\d{4}-\d{2}$/.test(input.period)) throw new Error('period: the month billed, like 2026-09.')
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('amount: a positive number.')
  if (input.hours !== undefined && (!Number.isFinite(input.hours) || input.hours < 0)) throw new Error('hours: a positive number.')
  const bill: ContractorBill = { id: newId(), reference: input.reference.trim(), period: input.period, amount: input.amount, receivedAt: input.receivedAt ?? today,
    ...(input.hours !== undefined ? { hours: input.hours } : {}), ...(input.path ? { path: input.path } : {}) }
  return { billId: bill.id, store: put(store, log({ ...a, bills: [...a.bills, bill] }, `Bill ${bill.reference} recorded (${periodLabel(bill.period)}).`, at)) }
}
export function updateBill(store: InvoiceStore, id: string, billId: string, change: { paidAt?: string | null; approvedOverCap?: boolean; remove?: boolean }, at = nowIso()): InvoiceStore {
  const a = getAgreement(store, id)
  const bill = a.bills.find(b => b.id === billId)
  if (!bill) throw new Error('Bill not found.')
  if (change.remove) return put(store, log({ ...a, bills: a.bills.filter(b => b.id !== billId) }, `Bill ${bill.reference} removed.`, at))
  const next = { ...bill }
  if (change.paidAt === null) delete next.paidAt
  else if (change.paidAt !== undefined) next.paidAt = isoDate(change.paidAt, 'Paid on')
  if (change.approvedOverCap !== undefined) next.approvedOverCap = change.approvedOverCap
  return put(store, log({ ...a, bills: a.bills.map(b => b.id === billId ? next : b) }, `Bill ${bill.reference}: ${change.paidAt ? `paid ${change.paidAt}` : change.approvedOverCap ? 'approved over the cap' : 'updated'}.`, at))
}

export function saveContractor(store: InvoiceStore, details: Partial<Omit<Contractor, 'id' | 'updatedAt' | 'documents'>>, id = newId(), creating = true, at = nowIso()): InvoiceStore {
  const current = store.contractors?.[id]
  if (!creating && !current) throw new Error('Contractor not found.')
  const { documents: _documents, ...fields } = details as Partial<Contractor>
  const contractor: Contractor = { name: '', ...current, ...fields, id, updatedAt: at }
  if (!contractor.name.trim()) throw new Error('A contractor needs a name.')
  return { ...store, contractors: { ...(store.contractors ?? {}), [id]: contractor } }
}
export function discardAgreement(store: InvoiceStore, id: string): InvoiceStore {
  const a = getAgreement(store, id)
  if (a.status !== 'draft' || a.numberText) throw new Error('Only a draft that was never sent can be discarded.')
  if (Object.values(store.agreements ?? {}).some(x => x.parentId === id)) throw new Error('Other agreements sit under this one.')
  const agreements = { ...(store.agreements ?? {}) }; delete agreements[id]
  return { ...store, agreements }
}

export interface AgreementRow {
  id: string; kind: AgreementKind; direction: AgreementDirection; numberText: string | null; title: string; party: string
  clientId?: string; contractorId?: string; status: AgreementStatus; signedAt: string | null; value: string | null; valueNote: string
  billing: { invoiced: string; toBill: string | null; labels: string[]; unbilledPeriods: string[] } | null
  openNotes: number; updatedAt: string; currency: string
}
export function agreementRows(store: InvoiceStore, today = localToday()): AgreementRow[] {
  return Object.values(store.agreements ?? {}).map(a => {
    const billing = a.direction === 'client' ? agreementBilling(store, a) : null
    const value = a.fee.kind === 'fixed' && a.fee.amount !== undefined ? sumMoney([String(a.fee.amount)], a.currency)
      : a.fee.kind === 'monthly' && a.fee.amount !== undefined ? sumMoney([String(a.fee.amount)], a.currency) : a.fee.kind === 'hourly' && a.fee.rate !== undefined ? sumMoney([String(a.fee.rate)], a.currency) : null
    return { id: a.id, kind: a.kind, direction: a.direction, numberText: a.numberText ?? null, title: a.title, party: partyName(store, a), clientId: a.clientId, contractorId: a.contractorId,
      status: a.status, signedAt: a.signedAt ?? null, value, valueNote: a.fee.kind === 'monthly' ? '/mo' : a.fee.kind === 'hourly' ? '/hr' : a.fee.kind === 'none' ? (a.kind === 'msa' ? 'per SOW' : '') : '',
      billing: billing ? { invoiced: billing.invoiced, toBill: billing.toBill, labels: billing.lines.filter(l => l.status !== 'missing').map(l => l.label), unbilledPeriods: unbilledPeriods(a, today) } : null,
      openNotes: (a.notes ?? []).filter(n => !n.doneAt).length, updatedAt: a.updatedAt, currency: a.currency }
  }).sort((x, y) => (x.direction === y.direction ? 0 : x.direction === 'client' ? -1 : 1) || y.updatedAt.localeCompare(x.updatedAt))
}
/** The rail's money: agreed with clients, invoiced against it, left to bill; what contractors have billed. */
export function agreementTotals(store: InvoiceStore, currency = 'USD') {
  const live = Object.values(store.agreements ?? {}).filter(a => a.currency === currency && (a.status === 'signed' || a.status === 'complete'))
  const client = live.filter(a => a.direction === 'client').map(a => agreementBilling(store, a))
  const fixed = client.filter(b => b.agreed !== null)
  return {
    currency,
    agreed: sumMoney(fixed.map(b => b.agreed!), currency),
    invoiced: sumMoney(client.map(b => b.invoiced), currency),
    toBill: sumMoney(fixed.map(b => b.toBill!), currency),
    contractorBilled: sumMoney(live.filter(a => a.direction === 'contractor').flatMap(a => a.bills.map(b => String(b.amount))), currency),
  }
}
