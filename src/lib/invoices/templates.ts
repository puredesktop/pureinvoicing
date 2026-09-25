import { KIND_LABEL, SKELETONS, createAgreement, getAgreement, partyName, updateAgreement } from './agreements'
import { localToday, newId } from './defaults'
import { formatMoney, sumMoney } from './money'
import type { Agreement, AgreementDirection, AgreementKind, AgreementTemplate, InvoiceStore, TemplateField, TemplateFieldSource } from './types'

/**
 * Agreement templates: the person's wording with {{fields}} the app fills and
 * [prompts] they write each time, a fee shape, and milestones as shares of
 * the fee. Generating makes an ordinary draft agreement; changing a template
 * never changes agreements already made from it.
 */

export const SOURCE_LABEL: Record<TemplateFieldSource, string> = {
  party: 'the client or contractor', partyContact: 'their contact', business: 'your business', parentTitle: 'the agreement it sits under',
  parentNumber: 'that agreement’s number', parentDate: 'that agreement’s date', paymentDays: 'payment days', sequence: 'the next number (#2)', today: 'today’s date', ask: 'asked when used',
}
const TOKEN = /\{\{\s*([a-zA-Z][\w-]*)\s*\}\}/g
const PROMPT = /\[[^\]\n]{1,120}\]/g
export const tokensIn = (text: string): string[] => [...text.matchAll(TOKEN)].map(m => m[1])
const clone = <T>(v: T): T => structuredClone(v)
const nowIso = () => new Date().toISOString()
export const longDay = (iso?: string) => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

export function getTemplate(store: InvoiceStore, id: string): AgreementTemplate {
  const t = store.templates && Object.hasOwn(store.templates, id) ? store.templates[id] : undefined
  if (!t) throw new Error('Template not found. List templates to find its id.')
  return t
}

/** What is wrong with a template, in words; empty when it can be used. */
export function templateProblems(t: Pick<AgreementTemplate, 'name' | 'title' | 'sections' | 'fields' | 'fee' | 'milestones'>): string[] {
  const problems: string[] = []
  if (!t.name.trim()) problems.push('Give the template a name.')
  const keys = new Set<string>()
  for (const f of t.fields) {
    if (!/^[a-zA-Z][\w-]*$/.test(f.key)) problems.push(`Field “${f.label}” needs a key of letters and digits.`)
    if (keys.has(f.key)) problems.push(`Two fields share the key ${f.key}.`)
    keys.add(f.key)
  }
  const used = new Set([...tokensIn(t.title), ...t.sections.flatMap(s => [...tokensIn(s.heading), ...tokensIn(s.body)])])
  for (const key of used) if (!keys.has(key)) problems.push(`{{${key}}} is used in the wording but is not a field.`)
  const money = (key?: string) => !key || t.fields.some(f => f.key === key && f.source === 'ask')
  if ((t.fee.kind === 'fixed' || t.fee.kind === 'monthly') && !t.fee.amountField) problems.push('Choose the asked field that holds the fee.')
  if (!money(t.fee.amountField) || !money(t.fee.rateField) || !money(t.fee.capField)) problems.push('The fee must come from an asked field.')
  if (t.fee.kind === 'fixed' && t.milestones.length) {
    const total = Math.round(t.milestones.reduce((sum, m) => sum + m.share, 0) * 100) / 100
    if (total !== 100) problems.push(`Milestone shares add up to ${total}%, not 100%.`)
  }
  if (t.milestones.some(m => !m.label.trim() || !(m.share > 0))) problems.push('Each milestone needs a label and a share above 0%.')
  return problems
}

export type TemplateInput = Omit<AgreementTemplate, 'id' | 'createdAt' | 'updatedAt'>
/**
 * Create or replace a template. Only a name is required: a template being
 * written may have shares that do not add up yet; its problems are listed and
 * it cannot be used until they are fixed. Marking one default unmarks the
 * others of its kind and direction.
 */
export function saveTemplate(store: InvoiceStore, input: TemplateInput, id = newId(), at = nowIso()): InvoiceStore {
  if (!input.name.trim()) throw new Error('Give the template a name.')
  const prior = store.templates?.[id]
  const t: AgreementTemplate = { ...clone(input), name: input.name.trim(), id, createdAt: prior?.createdAt ?? at, updatedAt: at }
  const templates = { ...(store.templates ?? {}) }
  if (t.isDefault) for (const other of Object.values(templates)) if (other.id !== id && other.kind === t.kind && other.direction === t.direction && other.isDefault) templates[other.id] = { ...other, isDefault: false }
  templates[id] = t
  return { ...store, templates }
}
export function deleteTemplate(store: InvoiceStore, id: string): InvoiceStore {
  getTemplate(store, id)
  const templates = { ...store.templates }; delete templates[id]
  return { ...store, templates }
}

/** A starting template from the built-in headings: prompts only, plus the fields every agreement of its kind needs. */
export function outlineTemplate(kind: AgreementKind, direction: AgreementDirection, name?: string): TemplateInput {
  const fields: TemplateField[] = [{ key: 'party', label: direction === 'client' ? 'Client name' : 'Contractor name', source: 'party' }, { key: 'business', label: 'Your business', source: 'business' }]
  const fee: AgreementTemplate['fee'] = kind === 'sow' || kind === 'change-order' ? { kind: 'fixed', amountField: 'fee' } : kind === 'contractor' ? { kind: 'hourly', rateField: 'rate', capField: 'cap' } : { kind: 'none' }
  if (fee.amountField) fields.push({ key: 'fee', label: 'Fee', source: 'ask', type: 'money' })
  if (fee.rateField) fields.push({ key: 'rate', label: 'Hourly rate', source: 'ask', type: 'money' }, { key: 'cap', label: 'Monthly cap', source: 'ask', type: 'money' })
  if (kind === 'sow') fields.push({ key: 'sequence', label: 'Next SOW number', source: 'sequence' }, { key: 'project', label: 'Project name', source: 'ask', type: 'text' })
  return {
    name: name ?? `${KIND_LABEL[kind]}${direction === 'contractor' && kind !== 'contractor' ? ' (contractor)' : ''}`, kind, direction,
    title: kind === 'sow' ? 'Statement of Work #{{sequence}} — {{project}}' : KIND_LABEL[kind],
    sections: SKELETONS[kind].map(s => ({ ...s })), fields, fee, milestones: kind === 'sow' ? [{ label: 'On signature', share: 100, trigger: 'signature' }] : [],
    paymentDays: kind === 'sow' || kind === 'change-order' ? 'parent' : undefined, origin: 'From the built-in headings',
  }
}

export interface TemplateUse { clientId?: string; contractorId?: string; parentId?: string; answers?: Record<string, string> }
/** The value of every field for one use: filled from the context, else the answer, else its default. Missing ones stay undefined. */
export function fieldValues(store: InvoiceStore, t: AgreementTemplate, use: TemplateUse, today = localToday()): Record<string, string | undefined> {
  const client = use.clientId ? store.clients[use.clientId] : undefined
  const contractor = use.contractorId ? store.contractors?.[use.contractorId] : undefined
  const parent = use.parentId ? store.agreements?.[use.parentId] : undefined
  const days = paymentDaysFor(store, t, use)
  const siblings = Object.values(store.agreements ?? {}).filter(a => a.kind === t.kind && (a.clientId ?? a.contractorId) === (use.clientId ?? use.contractorId))
  const auto: Record<Exclude<TemplateFieldSource, 'ask'>, string | undefined> = {
    party: client?.name ?? contractor?.name, partyContact: client?.contactName ?? contractor?.contactName, business: store.business.name || undefined,
    parentTitle: parent?.title, parentNumber: parent?.numberText, parentDate: longDay(parent?.signedAt), paymentDays: days === undefined ? undefined : String(days),
    sequence: String(siblings.length + 1), today: longDay(today),
  }
  return Object.fromEntries(t.fields.map(f => {
    const answer = use.answers?.[f.key]?.trim()
    const value = f.source === 'ask' ? (answer || f.default?.trim() || undefined) : (auto[f.source] || undefined)
    return [f.key, value === undefined ? undefined : f.type === 'money' && f.source === 'ask' && Number.isFinite(parseMoney(value)) ? formatMoney(sumMoney([String(parseMoney(value))], currencyFor(store, use)), currencyFor(store, use)) : value]
  }))
}
const parseMoney = (text: string) => Number(text.replace(/[^0-9.\-]/g, ''))
const currencyFor = (store: InvoiceStore, use: TemplateUse) => (use.parentId ? store.agreements?.[use.parentId]?.currency : undefined) ?? (use.clientId ? store.clients[use.clientId]?.currency : undefined) ?? (use.contractorId ? store.contractors?.[use.contractorId]?.currency : undefined) ?? 'USD'
function paymentDaysFor(store: InvoiceStore, t: AgreementTemplate, use: TemplateUse): number | undefined {
  if (typeof t.paymentDays === 'number') return t.paymentDays
  const client = use.clientId ? store.clients[use.clientId]?.termsDays : undefined
  if (t.paymentDays === 'parent') return (use.parentId ? store.agreements?.[use.parentId]?.paymentDays : undefined) ?? client
  if (t.paymentDays === 'client') return client
  return undefined
}
const fill = (text: string, t: AgreementTemplate, values: Record<string, string | undefined>) =>
  text.replace(TOKEN, (_, key: string) => values[key] ?? `[${t.fields.find(f => f.key === key)?.label ?? key}]`)

/** Split a fixed fee into milestone amounts by share; the last takes the rounding so they add up exactly. */
export function splitFee(amount: number, shares: number[]): number[] {
  const cents = Math.round(amount * 100)
  const parts = shares.map(s => Math.floor(cents * s / 100))
  if (parts.length) parts[parts.length - 1] += cents - parts.reduce((a, b) => a + b, 0)
  return parts.map(p => p / 100)
}

/** What using the template now would produce, before anything is written. */
export function previewTemplate(store: InvoiceStore, t: AgreementTemplate, use: TemplateUse, today = localToday()) {
  const values = fieldValues(store, t, use, today)
  const number = (key?: string) => { const v = key ? use.answers?.[key] ?? t.fields.find(f => f.key === key)?.default : undefined; const n = v === undefined ? NaN : parseMoney(v); return Number.isFinite(n) && v?.trim() ? n : undefined }
  const amount = number(t.fee.amountField), rate = number(t.fee.rateField), cap = number(t.fee.capField)
  const amounts = t.fee.kind === 'fixed' && amount !== undefined ? splitFee(amount, t.milestones.map(m => m.share)) : []
  const title = fill(t.title, t, values)
  const sections = t.sections.map(s => ({ heading: fill(s.heading, t, values), body: fill(s.body, t, values) }))
  const missing = t.fields.filter(f => values[f.key] === undefined && [t.title, ...t.sections.flatMap(s => [s.heading, s.body])].some(x => tokensIn(x).includes(f.key))).map(f => f.label)
  const prompts = [title, ...sections.flatMap(s => [s.heading, s.body])].reduce((n, x) => n + (x.match(PROMPT)?.length ?? 0), 0)
  return {
    title, sections, currency: currencyFor(store, use), paymentDays: paymentDaysFor(store, t, use),
    fee: { kind: t.fee.kind, ...(amount !== undefined ? { amount } : {}), ...(rate !== undefined ? { rate } : {}), ...(cap !== undefined ? { cap } : {}) },
    milestones: t.fee.kind === 'fixed' ? t.milestones.map((m, i) => ({ label: m.label, trigger: m.trigger, amount: amounts[i] ?? 0, share: m.share })) : [],
    missing, prompts, asked: t.fields.filter(f => f.source === 'ask'),
  }
}

/** Make a draft agreement from a template. Unanswered fields become [prompts] so the draft cannot be sent until they are filled. */
export function generateFromTemplate(store: InvoiceStore, templateId: string, use: TemplateUse, id = newId(), at = nowIso()): InvoiceStore {
  const t = getTemplate(store, templateId)
  const problems = templateProblems(t)
  if (problems.length) throw new Error(`The template needs attention first: ${problems.join(' ')}`)
  const p = previewTemplate(store, t, use, at.slice(0, 10))
  let next = createAgreement(store, { kind: t.kind, direction: t.direction, clientId: use.clientId, contractorId: use.contractorId, parentId: use.parentId, title: p.title || KIND_LABEL[t.kind], startFrom: { kind: 'skeleton' } }, id, at)
  next = updateAgreement(next, id, {
    currency: p.currency, sections: p.sections, fee: p.fee,
    ...(p.paymentDays !== undefined ? { paymentDays: p.paymentDays } : {}),
    ...(p.milestones.length ? { milestones: p.milestones.map(m => ({ label: m.label, amount: m.amount, trigger: m.trigger })) } : {}),
  }, at)
  const a = next.agreements![id]
  return { ...next, agreements: { ...next.agreements, [id]: { ...a, history: [{ ...a.history[0], note: `Drafted from the template “${t.name}”.` }] } } }
}

export type Suggestion = { as: 'field'; key: string; label: string; source: TemplateFieldSource; type?: TemplateField['type'] } | { as: 'prompt'; label: string } | { as: 'keep' }
export interface FoundItem { text: string; count: number; suggestion: Suggestion; why: string }
const money = (n: number, currency: string) => { const f = formatMoney(sumMoney([String(n)], currency), currency); return [...new Set([f, f.replace(/\.00$/, ''), f.replace(/^[^\d-]+/, ''), f.replace(/^[^\d-]+/, '').replace(/\.00$/, ''), String(n)])] }
const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

/**
 * The parts of a finished agreement that belong to that one deal: its party,
 * the agreement it sits under, its dates, its money, its project name. Each
 * comes with what it could become in a template; the person decides.
 */
export function findSpecifics(store: InvoiceStore, agreementId: string, extraPhrases: string[] = []): FoundItem[] {
  const a = getAgreement(store, agreementId)
  if (!a.sections.length) throw new Error('This agreement has no text here (it was signed elsewhere). Make the template from a document instead.')
  const everything = [a.title, ...a.sections.flatMap(s => [s.heading, s.body])].join('\n')
  const count = (text: string) => text ? everything.split(text).length - 1 : 0
  const items: FoundItem[] = []
  const add = (texts: (string | undefined)[], suggestion: Suggestion, why: string) => {
    for (const text of texts) { if (!text || text.length < 2) continue; const n = count(text); if (n && !items.some(x => x.text === text || x.text.includes(text))) items.push({ text, count: n, suggestion, why }) }
  }
  const party = partyName(store, a)
  const contact = a.clientId ? store.clients[a.clientId]?.contactName : store.contractors?.[a.contractorId ?? '']?.contactName
  const parent = a.parentId ? store.agreements?.[a.parentId] : undefined
  add([party], { as: 'field', key: 'party', label: a.direction === 'client' ? 'Client name' : 'Contractor name', source: 'party' }, 'the other party')
  add([contact], { as: 'field', key: 'contact', label: 'Their contact', source: 'partyContact' }, 'their contact')
  add([store.business.name], { as: 'keep' }, 'your own name stays')
  if (parent) {
    add([parent.title], { as: 'field', key: 'parentTitle', label: 'Agreement it sits under', source: 'parentTitle' }, 'the agreement it sits under')
    add([parent.numberText], { as: 'field', key: 'parentNumber', label: 'That agreement’s number', source: 'parentNumber' }, 'the agreement it sits under')
    if (parent.signedAt) add([longDay(parent.signedAt), shortDay(parent.signedAt), parent.signedAt], { as: 'field', key: 'parentDate', label: 'That agreement’s date', source: 'parentDate' }, 'when that was signed')
  }
  const title = a.title.match(/^(.*?#)(\d+)(\s*[—–-]\s*)(.+)$/)
  if (title) add([title[4]], { as: 'field', key: 'project', label: 'Project name', source: 'ask', type: 'text' }, 'this project’s name')
  if (a.fee.amount !== undefined) add(money(a.fee.amount, a.currency), { as: 'field', key: 'fee', label: a.fee.kind === 'monthly' ? 'Monthly fee' : 'Fee', source: 'ask', type: 'money' }, 'this deal’s fee')
  if (a.fee.rate !== undefined) add(money(a.fee.rate, a.currency), { as: 'field', key: 'rate', label: 'Hourly rate', source: 'ask', type: 'money' }, 'this deal’s rate')
  if (a.fee.cap !== undefined) add(money(a.fee.cap, a.currency), { as: 'field', key: 'cap', label: 'Monthly cap', source: 'ask', type: 'money' }, 'this deal’s cap')
  for (const m of a.milestones.filter(x => x.trigger !== 'period')) add(money(m.amount, a.currency), { as: 'keep' }, 'a milestone amount (the schedule is rebuilt from shares)')
  if (a.paymentDays !== undefined) add([`${a.paymentDays} days`], { as: 'field', key: 'paymentDays', label: 'Payment days', source: 'paymentDays' }, 'the payment terms')
  for (const [date, key, label] of [[a.startDate, 'start', 'Start date'], [a.endDate, 'end', 'End date']] as const) if (date) add([longDay(date), shortDay(date), date], { as: 'field', key, label, source: 'ask', type: 'date' }, 'this deal’s dates')
  for (const phrase of extraPhrases.map(x => x.trim()).filter(Boolean)) add([phrase], { as: 'prompt', label: 'Describe this for the new agreement' }, 'you chose it')
  return items
}

/** Turn a finished agreement into a template, replacing each chosen specific with its field or prompt. */
export function templateFromAgreement(store: InvoiceStore, agreementId: string, input: { name: string; description?: string; choices: { text: string; becomes: Suggestion }[] }, id = newId(), at = nowIso()): InvoiceStore {
  const a = getAgreement(store, agreementId)
  const fields = new Map<string, TemplateField>()
  const replacements: [string, string][] = []
  for (const choice of [...input.choices].sort((x, y) => y.text.length - x.text.length)) {
    const b = choice.becomes
    if (b.as === 'keep' || !choice.text) continue
    if (b.as === 'prompt') { replacements.push([choice.text, `[${b.label.trim() || 'Describe this'}]`]); continue }
    if (!fields.has(b.key)) fields.set(b.key, { key: b.key, label: b.label, source: b.source, ...(b.type ? { type: b.type } : {}) })
    // “45 days” keeps its unit: only the number becomes the field.
    const unit = b.source === 'paymentDays' ? choice.text.match(/\s+days?$/i)?.[0] ?? '' : ''
    replacements.push([choice.text, `{{${b.key}}}${unit}`])
  }
  const swap = (text: string) => replacements.reduce((t, [from, to]) => t.split(from).join(to), text)
  let title = swap(a.title)
  if (a.kind === 'sow') { title = title.replace(/#\d+/, '#{{sequence}}'); if (title.includes('{{sequence}}')) fields.set('sequence', { key: 'sequence', label: 'Next SOW number', source: 'sequence' }) }
  const fee: AgreementTemplate['fee'] = { kind: a.fee.kind }
  const ensureAsk = (key: string, label: string) => { if (!fields.has(key)) fields.set(key, { key, label, source: 'ask', type: 'money' }); return key }
  if (a.fee.kind === 'fixed' || a.fee.kind === 'monthly') fee.amountField = ensureAsk('fee', a.fee.kind === 'monthly' ? 'Monthly fee' : 'Fee')
  if (a.fee.kind === 'hourly') { fee.rateField = ensureAsk('rate', 'Hourly rate'); if (a.fee.cap !== undefined) fee.capField = ensureAsk('cap', 'Monthly cap') }
  const planned = a.milestones.filter(m => m.trigger !== 'period')
  const total = planned.reduce((s, m) => s + m.amount, 0)
  let shares = total > 0 ? planned.map(m => Math.round(m.amount / total * 10000) / 100) : []
  if (shares.length) shares[shares.length - 1] = Math.round((100 - shares.slice(0, -1).reduce((x, y) => x + y, 0)) * 100) / 100
  const parent = a.parentId ? store.agreements?.[a.parentId] : undefined
  const party = partyName(store, a)
  return saveTemplate(store, {
    name: input.name, ...(input.description?.trim() ? { description: input.description.trim() } : {}), kind: a.kind, direction: a.direction, title,
    sections: a.sections.map(s => ({ heading: swap(s.heading), body: swap(s.body) })), fields: [...fields.values()], fee,
    milestones: a.fee.kind === 'fixed' ? planned.map((m, i) => ({ label: m.label, share: shares[i] ?? 0, trigger: m.trigger as 'signature' | 'done' | 'acceptance' })) : [],
    paymentDays: parent ? 'parent' : a.paymentDays, origin: `Made from ${a.title.replace(/\s*[—–-].*$/, '')} with ${party}`,
  }, id, at)
}

/** Templates offered for a kind and direction, the default first. */
export const templatesFor = (store: InvoiceStore, kind: AgreementKind, direction: AgreementDirection) =>
  Object.values(store.templates ?? {}).filter(t => t.kind === kind && t.direction === direction).sort((x, y) => Number(!!y.isDefault) - Number(!!x.isDefault) || x.name.localeCompare(y.name))

/** One line on the fee shape: "Fixed · 40 / 30 / 30 on signature, delivery, acceptance". */
export function feeShape(t: AgreementTemplate): string {
  if (t.fee.kind === 'monthly') return 'Monthly · invoiced each month from the start date'
  if (t.fee.kind === 'hourly') return `Hourly${t.fee.capField ? ' with a monthly cap' : ''} · asked each time`
  if (t.fee.kind === 'none') return 'No fee: terms only'
  if (!t.milestones.length) return 'Fixed · no milestones'
  if (t.milestones.length === 1) return `Fixed · one payment ${t.milestones[0].trigger === 'signature' ? 'on signature' : t.milestones[0].trigger === 'done' ? 'on delivery' : 'on acceptance'}`
  return `Fixed · ${t.milestones.map(m => m.share).join(' / ')} on ${t.milestones.map(m => m.label.toLowerCase().replace(/^on\s+/, '')).join(', ')}`
}
export const templateCounts = (t: AgreementTemplate) => ({
  sections: t.sections.length, fields: t.fields.length,
  prompts: [t.title, ...t.sections.flatMap(s => [s.heading, s.body])].reduce((n, x) => n + (x.match(PROMPT)?.length ?? 0), 0),
})
export type { Agreement }
