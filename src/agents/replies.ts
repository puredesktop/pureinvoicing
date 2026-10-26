import { templateProblems } from '../lib/invoices/templates'
import type { AgreementTemplate } from '../lib/invoices/types'

/**
 * What the assistant hears back after a change. Tool replies stay in the
 * model's context for every later call, so a change replies with what changed
 * (ids, counts, totals, checks, the save state) and never the whole invoice,
 * agreement or template. The read tools (getInvoice, getAgreement,
 * getAgreementTemplate, getInvoicePreview) give the full content.
 *
 * These shape the agent reply only: the screen calls the same commands and
 * keeps their full results.
 */
// Command results are handed over as they are; these pick from them.
type Result = Record<string, any>
type Args = Record<string, unknown>
export type ReplyBuilder = (result: Result, args: Args) => unknown

const READ_DRAFT = 'Call getInvoice with this id for the full content and line items.'
const READ_AGREEMENT = 'Call getAgreement with this id for its sections, milestones, bills and notes.'
const READ_TEMPLATE = 'Call getAgreementTemplate with this id for its wording.'

const totalsOf = (calculation: Result | undefined) => calculation ? {
  currency: calculation.currency ?? null, subtotal: calculation.subtotal, totalDiscount: calculation.totalDiscount, net: calculation.net,
  tax: calculation.tax, total: calculation.total, taxBreakdown: calculation.taxBreakdown ?? [],
} : null

/** A draft or correction, as the next step needs it: its id and revision, the label, the parties and dates, totals and problems. */
export function draftReply(draft: Result) {
  const content = draft.content ?? {}, calculation = draft.calculation
  return {
    id: draft.id, status: draft.status, revision: draft.revision, correctionOf: draft.correctionOf ?? null, source: draft.source ?? null,
    number: draft.number ?? null, numberText: draft.numberText ?? null,
    provisionalNumber: draft.provisionalNumber ?? null, provisionalNumberText: draft.provisionalNumberText ?? null,
    recipient: content.recipient?.name ?? '', clientId: content.clientId ?? null, invoiceDate: content.invoiceDate ?? null, dueDate: content.dueDate ?? null,
    termsDays: content.termsDays ?? null, currency: content.currency ?? null, reference: content.reference ?? '',
    lineCount: content.lineItems?.length ?? 0, totals: totalsOf(calculation),
    complete: calculation?.complete ?? false, diagnostics: calculation?.diagnostics ?? [], warnings: calculation?.warnings ?? [],
    currencyReviewRequired: !!draft.currencyReviewRequired, saveStatus: draft.saveStatus, read: READ_DRAFT,
  }
}

const clip = (value: unknown) => typeof value === 'string' && value.length > 200 ? `${value.slice(0, 200)}…` : value
/** The fields that changed between two contents, one level into the parties and appearance. */
export function contentChanges(before: Result | undefined, after: Result | undefined) {
  const changes: { field: string; before: unknown; after: unknown }[] = []
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    const a = before?.[key], b = after?.[key]
    if (same(a, b)) continue
    if (key === 'lineItems') { changes.push({ field: key, before: `${a?.length ?? 0} lines`, after: `${b?.length ?? 0} lines` }); continue }
    const nested = a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)
    if (!nested) { changes.push({ field: key, before: clip(a ?? null), after: clip(b ?? null) }); continue }
    for (const sub of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!same(a[sub], b[sub])) changes.push({ field: `${key}.${sub}`, before: clip(a[sub] ?? null), after: clip(b[sub] ?? null) })
    }
  }
  return changes
}

/** A rendered preview without its page images and text: counts, problems and whether a PDF is retained. */
export function previewSummary(preview: Result | undefined) {
  if (!preview) return null
  const pages: Result[] = preview.pages ?? []
  return {
    pageCount: preview.pageCount ?? pages.length, canFinalize: !!preview.canFinalize,
    documentId: preview.document?.id ?? null, pdfRetained: !!preview.document?.pdfAssetId,
    pagesWithProblems: pages.filter(page => page.diagnostics?.length).map(page => ({ pageNumber: page.pageNumber, diagnostics: page.diagnostics })),
    read: 'Call getInvoicePreview for the page renderings and text.',
  }
}

function prepareReply(result: Result) {
  if (!result.ready) return { ready: false, diagnostics: result.diagnostics ?? [], preview: previewSummary(result.preview) }
  const { preview, calculation, ...rest } = result
  return { ...rest, totals: totalsOf(calculation), complete: calculation?.complete ?? false,
    diagnostics: calculation?.diagnostics ?? [], warnings: calculation?.warnings ?? [], preview: previewSummary(preview) }
}

function sequenceReply(result: Result) {
  const sequence = result.sequence ?? {}
  return { ...result, sequence: { verified: sequence.verified, format: sequence.format ?? null, nextNumber: sequence.nextNumber, reservedCount: sequence.reservedNumbers?.length ?? 0 } }
}

type Note = { id: string; text: string; at: string; doneAt?: string }
const noteCounts = (notes: Note[] = []) => ({ noteCount: notes.length, openNoteCount: notes.filter(note => !note.doneAt).length })
const addedNote = (owner: (result: Result) => Result) => (result: Result) => ({ ...owner(result), noteId: result.noteId,
  note: (result.notes as Note[] | undefined)?.find(note => note.id === result.noteId) ?? null, ...noteCounts(result.notes), saveStatus: result.saveStatus })
const changedNote = (owner: (result: Result) => Result) => (result: Result, args: Args) => {
  const note = (result.notes as Note[] | undefined)?.find(n => n.id === args.noteId) ?? null
  return { ...owner(result), noteId: args.noteId, note, removed: !note, ...noteCounts(result.notes), saveStatus: result.saveStatus }
}

const OWNER_KEYS = ['clientId', 'invoiceId', 'agreementId', 'contractorId'] as const
const ownerOf = (result: Result) => Object.fromEntries(OWNER_KEYS.filter(key => result[key]).map(key => [key, result[key]]))
type Linked = { id: string }
const linkReply = (result: Result) => ({ ...ownerOf(result), documentId: result.documentId,
  document: (result.documents as Linked[] | undefined)?.find(d => d.id === result.documentId) ?? null, documentCount: result.documents?.length ?? 0, saveStatus: result.saveStatus })
const unlinkReply = (result: Result, args: Args) => ({ ...ownerOf(result), removedDocumentId: args.documentId, documentCount: result.documents?.length ?? 0, saveStatus: result.saveStatus })

/** An agreement after a change: who, what, its standing, its checks and its billing totals; never its wording. */
export function agreementReply(a: Result) {
  const billing = a.billing
  return {
    id: a.id, kind: a.kind, kindLabel: a.kindLabel, direction: a.direction, title: a.title, numberText: a.numberText ?? null,
    status: a.status, statusLabel: a.statusLabel, registered: !!a.registered, party: a.party ?? null, clientId: a.clientId ?? null, contractorId: a.contractorId ?? null,
    parent: a.parent ? { id: a.parent.id, title: a.parent.title, numberText: a.parent.numberText ?? null } : null,
    currency: a.currency, fee: a.fee, paymentDays: a.paymentDays ?? null, startDate: a.startDate ?? null, endDate: a.endDate ?? null,
    sentAt: a.sentAt ?? null, signedAt: a.signedAt ?? null, closedAt: a.closedAt ?? null,
    sectionCount: a.sections?.length ?? 0, milestoneCount: a.milestones?.length ?? 0, billCount: a.bills?.length ?? 0,
    checks: a.checks ?? [], billing: billing ? { invoiced: billing.invoiced, paid: billing.paid, agreed: billing.agreed, toBill: billing.toBill, invoiceCount: billing.lines?.length ?? 0 } : null,
    unbilledPeriods: a.unbilledPeriods ?? [], updatedAt: a.updatedAt, saveStatus: a.saveStatus, read: READ_AGREEMENT,
  }
}
type Section = { id: string; heading: string; body: string }
const outline = (a: Result) => ((a.sections ?? []) as Section[]).map(s => ({ id: s.id, heading: s.heading, chars: s.body.length }))
const withOutline = (a: Result) => ({ ...agreementReply(a), sections: outline(a) })
type Milestone = { id: string; period?: string }
const milestoneOf = (a: Result, find: (m: Milestone) => boolean) => ((a.milestones ?? []) as Milestone[]).find(find) ?? null
type Bill = { id: string }
const billOf = (a: Result, id: unknown) => ((a.bills ?? []) as Bill[]).find(b => b.id === id) ?? null

/** A template after a change: its name, shape, counts and problems; never its wording. */
export function templateReply(t: Result) {
  return {
    id: t.id, name: t.name, description: t.description ?? null, kind: t.kind, direction: t.direction, title: t.title, isDefault: !!t.isDefault, origin: t.origin ?? null,
    sectionCount: t.sections?.length ?? 0, fields: (t.fields ?? []).map((f: Result) => ({ key: f.key, source: f.source })), feeKind: t.fee?.kind ?? null,
    milestoneShares: (t.milestones ?? []).map((m: Result) => m.share),
    problems: t.problems ?? (t.sections && t.fields ? templateProblems(t as AgreementTemplate) : []),
    updatedAt: t.updatedAt, saveStatus: t.saveStatus, read: READ_TEMPLATE,
  }
}

const READ_PROPOSAL = 'Call getProposal with this id (and a versionId) for the full content of a version.'
/** A proposal after a change: its standing, each version's status and total, the latest version's problems; never the wording. */
export function proposalReply(p: Result) {
  const version = p.version ?? {}
  return {
    id: p.id, status: p.status, title: version.content?.title ?? '', customer: version.content?.customer?.name ?? '',
    latestVersionId: p.latestVersionId, acceptedVersionId: p.acceptedVersionId ?? null,
    versions: (p.versions ?? []).map((v: Result) => ({ id: v.id, number: v.number, status: v.status, offeredAt: v.offeredAt, decidedAt: v.decidedAt, currency: v.currency, total: v.total })),
    version: { id: version.id, number: version.number, status: version.status, revision: version.revision, itemCount: version.content?.items?.length ?? 0,
      currency: version.calculation?.currency ?? null, total: version.calculation?.total ?? null, complete: version.calculation?.complete ?? false, problems: version.calculation?.diagnostics ?? [] },
    invoice: p.invoice ?? null, saveStatus: p.saveStatus, read: READ_PROPOSAL,
  }
}

/** Agent replies by tool name; a tool not listed replies with the command's own result. */
export const agentReplies: Record<string, ReplyBuilder> = {
  createInvoiceDraft: draftReply,
  updateInvoiceDraft: draftReply,
  startInvoiceCorrection: draftReply,
  applyDefaultsToDraft: result => ({ ...draftReply(result), changes: contentChanges(result.before, result.after) }),
  prepareInvoiceFinalization: prepareReply,
  setNextInvoiceNumber: sequenceReply,
  addInvoiceNote: addedNote(result => ({ invoiceId: result.invoiceId })),
  updateInvoiceNote: changedNote(result => ({ invoiceId: result.invoiceId })),
  addAgreementNote: addedNote(() => ({})),
  updateAgreementNote: changedNote(() => ({})),
  linkDocument: linkReply,
  unlinkDocument: unlinkReply,
  /** Optional includeImages: false leaves the page images out (text, diagnostics and image paths stay). */
  getInvoicePreview: (result, args) => args.includeImages === false
    ? { ...result, pages: (result.pages ?? []).map(({ imageDataUrl: _image, ...page }: Result) => page) } : result,
  createProposal: proposalReply,
  updateProposal: proposalReply,
  setProposalStatus: proposalReply,
  createAgreement: withOutline,
  createAgreementFromTemplate: withOutline,
  updateAgreement: withOutline,
  sendAgreement: agreementReply,
  withdrawAgreement: agreementReply,
  markAgreementSigned: a => ({ ...agreementReply(a), signatures: a.signatures ?? [], signedPdfPath: a.signedPdfPath ?? null }),
  closeAgreement: agreementReply,
  reopenAgreement: agreementReply,
  editAgreementSection: (a, args) => {
    const section = ((a.sections ?? []) as Section[]).find(s => s.id === a.sectionId)
    return { ...agreementReply(a), sectionId: a.sectionId, section: section ? { id: section.id, heading: section.heading, chars: section.body.length } : null, removed: !!args.remove && !section }
  },
  setMilestoneDone: (a, args) => ({ ...agreementReply(a), milestone: milestoneOf(a, m => m.id === args.milestoneId) }),
  invoiceAgreementMilestone: (a, args) => ({ draftId: a.draftId, ...agreementReply(a), milestone: milestoneOf(a, m => m.id === args.milestoneId) }),
  invoiceAgreementMonth: (a, args) => ({ draftId: a.draftId, ...agreementReply(a), milestone: milestoneOf(a, m => m.period === args.period) }),
  linkInvoiceToAgreement: (a, args) => ({ ...agreementReply(a), invoiceId: args.invoiceId, linked: args.link ?? true }),
  addContractorBill: a => ({ billId: a.billId, ...agreementReply(a), bill: billOf(a, a.billId) }),
  updateContractorBill: (a, args) => { const bill = billOf(a, args.billId); return { ...agreementReply(a), billId: args.billId, bill, removed: !bill } },
  saveAgreementTemplate: templateReply,
  makeTemplateFromAgreement: templateReply,
  createOutlineTemplate: t => ({ ...templateReply(t), sections: ((t.sections ?? []) as { heading: string }[]).map((s, index) => ({ index, heading: s.heading })) }),
  editTemplateSection: (t, args) => {
    const sections = (t.sections ?? []) as { heading: string; body: string }[]
    const index = args.index === undefined ? sections.length - 1 : args.index as number
    const section = args.remove ? null : sections[index]
    return { ...templateReply(t), index, section: section ? { index, heading: section.heading, chars: section.body.length } : null, removed: !!args.remove }
  },
}
