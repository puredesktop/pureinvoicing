import { exportInvoiceBytes, printInvoiceDocument, readPrintedPdf, writeAgreementPrintFile } from '../../bridge/platformBridge'
import * as ag from './agreements'
import { addNote, updateNote } from './annotations'
import { readRetainedAsset } from './assets'
import { agreementHtml } from './agreementHtml'
import * as tp from './templates'
import { newId } from './defaults'
import type { InvoiceRepository } from './repository'
import type { Agreement, AgreementKind, AgreementStatus, InvoiceStore } from './types'

export interface AgreementQuery { status?: AgreementStatus | 'all'; direction?: 'client' | 'contractor'; clientId?: string; contractorId?: string; query?: string }

/** Everything the page and the assistant need to know about one agreement. */
export function agreementDetails(store: InvoiceStore, id: string) {
  const a = ag.getAgreement(store, id)
  const parent = a.parentId ? store.agreements?.[a.parentId] : undefined
  const children = Object.values(store.agreements ?? {}).filter(x => x.parentId === id).map(x => ({ id: x.id, kind: x.kind, title: x.title, numberText: x.numberText ?? null, status: x.status }))
  return {
    ...a, party: ag.partyName(store, a), kindLabel: ag.KIND_LABEL[a.kind], statusLabel: ag.STATUS_LABEL[a.status],
    parent: parent ? { id: parent.id, title: parent.title, numberText: parent.numberText ?? null, kind: parent.kind, paymentDays: parent.paymentDays ?? null, signedAt: parent.signedAt ?? null } : null,
    children, checks: ag.agreementChecks(store, a),
    billing: a.direction === 'client' ? ag.agreementBilling(store, a) : null,
    unbilledPeriods: ag.unbilledPeriods(a),
    bills: a.bills.map(b => ({ ...b, check: ag.billCheck(a, b) })),
  }
}

/** Answers arrive from people and the assistant as any JSON; the template reads text. */
const textAnswers = <T extends tp.TemplateUse>(use: T): T => ({ ...use, answers: Object.fromEntries(Object.entries(use.answers ?? {}).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])) })
export function createAgreementCommands(repository: InvoiceRepository) {
  const read = () => repository.current()
  const saved = async (store: InvoiceStore, id: string) => ({ ...agreementDetails(store, id), saveStatus: 'saved' as const })
  return {
    async listAgreements(query: AgreementQuery = {}) {
      const store = await read(), needle = (query.query ?? '').trim().toLocaleLowerCase()
      const rows = ag.agreementRows(store).filter(r => (!query.status || query.status === 'all' || r.status === query.status) && (!query.direction || r.direction === query.direction)
        && (!query.clientId || r.clientId === query.clientId) && (!query.contractorId || r.contractorId === query.contractorId)
        && (!needle || [r.title, r.party, r.numberText ?? ''].some(v => v.toLocaleLowerCase().includes(needle))))
      return { agreements: rows, totals: ag.agreementTotals(store), saveStatus: repository.getSnapshot().status }
    },
    async getAgreement(args: { agreementId: string }) { return { ...agreementDetails(await read(), args.agreementId), saveStatus: repository.getSnapshot().status } },
    async createAgreement(args: ag.CreateAgreementInput) {
      const id = newId()
      return saved(await repository.transact(s => ag.createAgreement(s, args, id)), id)
    },
    async updateAgreement(args: { agreementId: string; changes: ag.AgreementPatch }) {
      return saved(await repository.transact(s => ag.updateAgreement(s, args.agreementId, args.changes)), args.agreementId)
    },
    async editAgreementSection(args: { agreementId: string; sectionId?: string; heading?: string; body?: string; remove?: boolean; afterSectionId?: string }) {
      let sectionId = ''
      const store = await repository.transact(s => { const r = ag.editSection(s, args.agreementId, args); sectionId = r.sectionId; return r.store })
      return { sectionId, ...(await saved(store, args.agreementId)) }
    },
    async sendAgreement(args: { agreementId: string }) { return saved(await repository.transact(s => ag.sendAgreement(s, args.agreementId)), args.agreementId) },
    async withdrawAgreement(args: { agreementId: string }) { return saved(await repository.transact(s => ag.withdrawAgreement(s, args.agreementId)), args.agreementId) },
    async markAgreementSigned(args: { agreementId: string; ours: { name: string; at: string }; theirs: { name: string; at: string }; signedPdfPath?: string }) {
      return saved(await repository.transact(s => ag.markSigned(s, args.agreementId, args)), args.agreementId)
    },
    async closeAgreement(args: { agreementId: string; how: 'complete' | 'ended' }) { return saved(await repository.transact(s => ag.closeAgreement(s, args.agreementId, args.how)), args.agreementId) },
    async reopenAgreement(args: { agreementId: string }) { return saved(await repository.transact(s => ag.reopenAgreement(s, args.agreementId)), args.agreementId) },
    async setMilestoneDone(args: { agreementId: string; milestoneId: string; done: boolean }) {
      return saved(await repository.transact(s => ag.setMilestoneDone(s, args.agreementId, args.milestoneId, args.done)), args.agreementId)
    },
    /** The invoice draft for a due milestone; open it to check and issue as usual. */
    async invoiceAgreementMilestone(args: { agreementId: string; milestoneId: string }) {
      const draftId = newId()
      const store = await repository.transact(s => ag.invoiceMilestone(s, args.agreementId, args.milestoneId, draftId))
      return { draftId, ...(await saved(store, args.agreementId)) }
    },
    async invoiceAgreementMonth(args: { agreementId: string; period: string }) {
      const draftId = newId()
      const store = await repository.transact(s => ag.invoicePeriod(s, args.agreementId, args.period, draftId))
      return { draftId, ...(await saved(store, args.agreementId)) }
    },
    async linkInvoiceToAgreement(args: { agreementId: string; invoiceId: string; link?: boolean }) {
      return saved(await repository.transact(s => ag.linkInvoice(s, args.agreementId, args.invoiceId, args.link ?? true)), args.agreementId)
    },
    async addContractorBill(args: { agreementId: string; reference: string; period: string; amount: number; hours?: number; receivedAt?: string; path?: string }) {
      let billId = ''
      const { agreementId, ...bill } = args
      const store = await repository.transact(s => { const r = ag.addBill(s, agreementId, bill); billId = r.billId; return r.store })
      return { billId, ...(await saved(store, agreementId)) }
    },
    async updateContractorBill(args: { agreementId: string; billId: string; paidAt?: string | null; approvedOverCap?: boolean; remove?: boolean }) {
      return saved(await repository.transact(s => ag.updateBill(s, args.agreementId, args.billId, args)), args.agreementId)
    },
    async searchContractors(args: { query?: string } = {}) {
      const store = await read(), needle = (args.query ?? '').trim().toLocaleLowerCase()
      const contractors = Object.values(store.contractors ?? {}).filter(c => !needle || [c.name, c.email ?? '', c.contactName ?? ''].some(v => v.toLocaleLowerCase().includes(needle)))
        .map(c => ({ ...c, agreements: Object.values(store.agreements ?? {}).filter(a => a.contractorId === c.id).map(a => ({ id: a.id, title: a.title, numberText: a.numberText ?? null, status: a.status })) }))
      return { contractors, saveStatus: repository.getSnapshot().status }
    },
    async saveContractor(args: { contractorId?: string; details: { name?: string; contactName?: string; email?: string; address?: string; taxIdentifier?: string; currency?: string } }) {
      const id = args.contractorId ?? newId()
      const store = await repository.transact(s => ag.saveContractor(s, args.details, id, !args.contractorId))
      return { contractor: store.contractors![id], saveStatus: 'saved' }
    },
    async listAgreementTemplates(args: { kind?: AgreementKind; direction?: 'client' | 'contractor' } = {}) {
      const store = await read()
      const templates = Object.values(store.templates ?? {}).filter(t => (!args.kind || t.kind === args.kind) && (!args.direction || t.direction === args.direction))
        .map(t => ({ id: t.id, name: t.name, description: t.description ?? null, kind: t.kind, direction: t.direction, isDefault: !!t.isDefault, origin: t.origin ?? null, feeShape: tp.feeShape(t), ...tp.templateCounts(t), asked: t.fields.filter(f => f.source === 'ask').map(f => ({ key: f.key, label: f.label, type: f.type ?? 'text', default: f.default ?? null })) }))
      return { templates, saveStatus: repository.getSnapshot().status }
    },
    async getAgreementTemplate(args: { templateId: string }) {
      const t = tp.getTemplate(await read(), args.templateId)
      return { ...t, problems: tp.templateProblems(t), feeShape: tp.feeShape(t), ...tp.templateCounts(t), saveStatus: repository.getSnapshot().status }
    },
    async saveAgreementTemplate(args: { templateId?: string; template: tp.TemplateInput }) {
      const id = args.templateId ?? newId()
      if (args.templateId) tp.getTemplate(await read(), args.templateId)
      const store = await repository.transact(s => tp.saveTemplate(s, args.template, id))
      return { ...store.templates![id], problems: tp.templateProblems(store.templates![id]), saveStatus: 'saved' }
    },
    /** Write, change, add or remove one section of a template (by position). */
    async editTemplateSection(args: { templateId: string; index?: number; heading?: string; body?: string; remove?: boolean }) {
      const store = await repository.transact(s => {
        const t = tp.getTemplate(s, args.templateId), sections = t.sections.map(x => ({ ...x }))
        if (args.index === undefined) { if (!args.heading?.trim()) throw new Error('A new section needs a heading.'); sections.push({ heading: args.heading.trim(), body: args.body ?? '' }) }
        else {
          if (!sections[args.index]) throw new Error(`There is no section ${args.index}; sections are numbered from 0.`)
          if (args.remove) sections.splice(args.index, 1)
          else sections[args.index] = { heading: args.heading ?? sections[args.index].heading, body: args.body ?? sections[args.index].body }
        }
        const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = t
        return tp.saveTemplate(s, { ...rest, sections }, t.id)
      })
      return { ...store.templates![args.templateId], saveStatus: 'saved' }
    },
    async deleteAgreementTemplate(args: { templateId: string }) { await repository.transact(s => tp.deleteTemplate(s, args.templateId)); return { deleted: args.templateId, saveStatus: 'saved' } },
    /** What in a finished agreement belongs to that one deal, each with what it could become in a template. */
    async findAgreementSpecifics(args: { agreementId: string; extraPhrases?: string[] }) { return { items: tp.findSpecifics(await read(), args.agreementId, args.extraPhrases), saveStatus: repository.getSnapshot().status } },
    async makeTemplateFromAgreement(args: { agreementId: string; name: string; description?: string; choices: { text: string; becomes: tp.Suggestion }[] }) {
      const id = newId()
      const store = await repository.transact(s => tp.templateFromAgreement(s, args.agreementId, args, id))
      return { ...store.templates![id], saveStatus: 'saved' }
    },
    /** A new template from the built-in headings (prompts only), to write in your own wording. */
    async createOutlineTemplate(args: { kind: AgreementKind; direction: 'client' | 'contractor'; name?: string }) {
      const id = newId()
      const store = await repository.transact(s => tp.saveTemplate(s, tp.outlineTemplate(args.kind, args.direction, args.name), id))
      return { ...store.templates![id], saveStatus: 'saved' }
    },
    async previewAgreementFromTemplate(args: { templateId: string } & tp.TemplateUse) {
      const store = await read()
      return { ...tp.previewTemplate(store, tp.getTemplate(store, args.templateId), textAnswers(args)), saveStatus: repository.getSnapshot().status }
    },
    async createAgreementFromTemplate(args: { templateId: string } & tp.TemplateUse) {
      const id = newId()
      return saved(await repository.transact(s => tp.generateFromTemplate(s, args.templateId, textAnswers(args), id)), id)
    },
    async discardAgreement(args: { agreementId: string }) { await repository.transact(s => ag.discardAgreement(s, args.agreementId)); return { discarded: args.agreementId, saveStatus: 'saved' } },
    async addAgreementNote(args: { agreementId: string; text: string }) {
      let noteId = ''
      const store = await repository.transact(s => { const r = addNote(s, { agreementId: args.agreementId }, args.text); noteId = r.noteId; return r.store })
      return { noteId, notes: store.agreements![args.agreementId].notes ?? [], saveStatus: 'saved' }
    },
    async updateAgreementNote(args: { agreementId: string; noteId: string; done?: boolean; text?: string; remove?: boolean }) {
      const store = await repository.transact(s => updateNote(s, { agreementId: args.agreementId }, args.noteId, args))
      return { notes: store.agreements![args.agreementId].notes ?? [], saveStatus: 'saved' }
    },
    /** Print the agreement in the invoice template and save the PDF where the person chooses. */
    async exportAgreementPdf(args: { agreementId: string }) {
      const store = await read()
      const a = ag.getAgreement(store, args.agreementId)
      let logo: string | undefined
      if (store.template.logoAssetId) {
        try { const asset = await readRetainedAsset(store, store.template.logoAssetId, 'logo'); logo = `data:${asset.mimeType};base64,${asset.base64}` }
        catch (error) { console.error('Agreement logo unavailable; printing without it', error) }
      }
      const name = `${(a.numberText ?? 'Draft')}-${a.title}`.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 80)
      const htmlPath = await writeAgreementPrintFile(name, agreementHtml(store, a, logo))
      const pdfPath = await printInvoiceDocument(htmlPath, `${htmlPath.replace(/\.html$/, '')}.pdf`, store.template.pageSize)
      const base64 = await readPrintedPdf(typeof pdfPath === 'string' ? pdfPath : `${htmlPath.replace(/\.html$/, '')}.pdf`)
      const result = await exportInvoiceBytes(`${name}.pdf`, base64)
      return result.cancelled ? { status: 'cancelled' } : { status: 'saved', path: result.path }
    },
  }
}
export type AgreementCommands = ReturnType<typeof createAgreementCommands>
export type { Agreement, AgreementKind }
