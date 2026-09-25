import { newId } from './defaults'
import { InvoiceRepository } from './repository'
import { invoiceDetails, searchClients, searchInvoices, workspaceState } from './queries'
import * as updates from './updates'
import { applyMark, invoiceStanding, type MarkRequest } from './lifecycle'
import { localToday } from './defaults'
import { addInvoiceNote, linkDocument, unlinkDocument, updateInvoiceNote, type DocumentOwner } from './annotations'
import type { LinkedDocument } from './types'
import type { ArchiveQuery, Business, Client, ClientQuery, ContentPatch, DefaultSource, InvoiceStore } from './types'
function documentOwner(args: { clientId?: string; invoiceId?: string; agreementId?: string; contractorId?: string }): DocumentOwner {
  const given = (['clientId', 'invoiceId', 'agreementId', 'contractorId'] as const).filter(k => !!args[k])
  if (given.length !== 1) throw new Error('Give exactly one of clientId, invoiceId, agreementId or contractorId.')
  const key = given[0]
  return { [key]: args[key]! } as DocumentOwner
}
const ownerDocuments = (store: InvoiceStore, owner: DocumentOwner): LinkedDocument[] => ('clientId' in owner ? store.clients[owner.clientId].documents
  : 'invoiceId' in owner ? store.invoices[owner.invoiceId].documents : 'agreementId' in owner ? store.agreements?.[owner.agreementId]?.documents : store.contractors?.[owner.contractorId]?.documents) ?? []
export function createInvoiceCommands(repository: InvoiceRepository) {
  const read = () => repository.current()
  const savedDraft = (store: InvoiceStore, id: string) => ({ ...invoiceDetails(store, id), saveStatus: 'saved' as const })
  return {
    async getWorkspaceState() { return { ...workspaceState(await read()), saveStatus: repository.getSnapshot().status, saveError: repository.getSnapshot().error } },
    async searchInvoices(query: ArchiveQuery = {}) { return { ...searchInvoices(await read(), query), saveStatus: repository.getSnapshot().status } },
    async getInvoice(args: { invoiceId: string; versionId?: string; includeCorrection?: boolean }) {
      return { ...invoiceDetails(await read(), args.invoiceId, args.versionId, args.includeCorrection), saveStatus: repository.getSnapshot().status }
    },
    async searchClients(query: ClientQuery = {}) { return { ...searchClients(await read(), query), saveStatus: repository.getSnapshot().status } },
    async saveClient(args: { clientId?: string; details: Partial<Omit<Client, 'id' | 'updatedAt'>> }) {
      const id = args.clientId ?? newId()
      const store = await repository.transact(s => updates.saveClient(s, args.details, id, undefined, !args.clientId))
      return { client: store.clients[id], saveStatus: 'saved' }
    },
    async updateBusinessIdentity(args: { details: Partial<Business> }) {
      const store = await repository.transact(s => updates.updateBusiness(s, args.details))
      return { business: store.business, setup: workspaceState(store).setup, saveStatus: 'saved' }
    },
    async setNextInvoiceNumber(args: { nextNumber: number; unregisteredHistoryChecked: boolean }) {
      let previous = 1
      const store = await repository.transact(s => { previous = updates.nextAvailableNumber(s.sequence); return updates.configureSequence(s, args.nextNumber, args.unregisteredHistoryChecked) })
      return { sequence: store.sequence, actualNextNumber: updates.nextAvailableNumber(store.sequence),
        gap: args.nextNumber > previous ? { from: previous, through: args.nextNumber - 1, count: args.nextNumber - previous } : null, saveStatus: 'saved' }
    },
    async createInvoiceDraft(args: { sourceInvoiceId?: string; sourceVersionId?: string } = {}) {
      const id = newId()
      return savedDraft(await repository.transact(s => updates.createDraft(s, args.sourceInvoiceId, args.sourceVersionId, id)), id)
    },
    async savePreparedDraft(args: { draftId: string; changes: ContentPatch; presentation: import('./types').Presentation }) {
      return savedDraft(await repository.transact(s => updates.updateDraftPresentation(updates.updateDraft(s, args.draftId, args.changes), args.draftId, args.presentation)), args.draftId)
    },
    async updateInvoiceDraft(args: { draftId: string; changes: ContentPatch }) {
      return savedDraft(await repository.transact(s => updates.updateDraft(s, args.draftId, args.changes)), args.draftId)
    },
    async applyDefaultsToDraft(args: { draftId: string; sources: DefaultSource[]; clientId?: string }) {
      let before: unknown
      const store = await repository.transact(s => { before = structuredClone(updates.getDraft(s, args.draftId).content); return updates.applyDefaults(s, args.draftId, args.sources, args.clientId) })
      return { ...savedDraft(store, args.draftId), before, after: store.drafts[args.draftId].content }
    },
    async startInvoiceCorrection(args: { invoiceId: string }) {
      const store = await repository.guardedTransact(s => updates.startCorrection(s, args.invoiceId))
      const draft = Object.values(store.drafts).find(d => d.correctionOf === args.invoiceId)!
      return savedDraft(store, draft.id)
    },
    async discardInvoiceDraft(args: { draftId: string }) {
      let correctionOf: string | undefined
      await repository.transact(s => { correctionOf = updates.getDraft(s, args.draftId).correctionOf; return updates.discardDraft(s, args.draftId) })
      return { removedDraftId: args.draftId, kind: correctionOf ? 'correction' : 'draft', issuedInvoicePreserved: correctionOf ?? null, saveStatus: 'saved' }
    },
    async saveDraftPresentationAsDefault(args: { draftId: string }) {
      const store = await repository.transact(s => updates.saveDraftTemplate(s, args.draftId))
      return { defaultTemplate: store.template, saveStatus: 'saved' }
    },
    async setDefaultTemplate(settings: Partial<import('./types').Presentation>) {
      return (await repository.transact(s => updates.updateTemplate(s, settings))).template
    },
    async setDraftPresentation(draftId: string, settings: Partial<import('./types').Presentation>) {
      return savedDraft(await repository.transact(s => updates.updateDraftPresentation(s, draftId, settings)), draftId)
    },
    // Explicit UI acknowledgement after reviewing prices; tools retain the review warning.
    async acknowledgeCurrencyReview(draftId: string) {
      return savedDraft(await repository.transact(s => updates.replaceDraft(s, { ...updates.getDraft(s, draftId), currencyReviewRequired: false })), draftId)
    },
    /** Sent and paid are marks the person sets; issued content never changes. */
    async markInvoice(args: { invoiceId: string; mark: MarkRequest }) {
      const store = await repository.transact(s => applyMark(s, args.invoiceId, args.mark))
      const invoice = store.invoices[args.invoiceId]
      return { invoiceId: invoice.id, numberText: updates.issuedLabel(store, invoice), marks: invoice.marks ?? null, standing: invoiceStanding(invoice), saveStatus: 'saved' }
    },
    /** A working note on an issued invoice (never printed), e.g. a follow-up to do. */
    async addInvoiceNote(args: { invoiceId: string; text: string }) {
      let noteId = ''
      const store = await repository.transact(s => { const r = addInvoiceNote(s, args.invoiceId, args.text); noteId = r.noteId; return r.store })
      return { invoiceId: args.invoiceId, noteId, notes: store.invoices[args.invoiceId].notes ?? [], saveStatus: 'saved' }
    },
    async updateInvoiceNote(args: { invoiceId: string; noteId: string; done?: boolean; text?: string; remove?: boolean }) {
      const store = await repository.transact(s => updateInvoiceNote(s, args.invoiceId, args.noteId, args))
      return { invoiceId: args.invoiceId, notes: store.invoices[args.invoiceId].notes ?? [], saveStatus: 'saved' }
    },
    /** Link a contract, SOW or other file (by path, not copied) to a client or an issued invoice. */
    async linkDocument(args: { clientId?: string; invoiceId?: string; agreementId?: string; contractorId?: string; path: string; kind?: LinkedDocument['kind']; name?: string }) {
      const owner = documentOwner(args)
      let documentId = ''
      const store = await repository.transact(s => { const r = linkDocument(s, owner, args); documentId = r.documentId; return r.store })
      return { ...owner, documentId, documents: ownerDocuments(store, owner), saveStatus: 'saved' }
    },
    async unlinkDocument(args: { clientId?: string; invoiceId?: string; agreementId?: string; contractorId?: string; documentId: string }) {
      const owner = documentOwner(args)
      const store = await repository.transact(s => unlinkDocument(s, owner, args.documentId))
      return { ...owner, documents: ownerDocuments(store, owner), saveStatus: 'saved' }
    },
    async setNumberFormat(args: { pattern: string }) {
      const store = await repository.transact(s => updates.configureNumberFormat(s, args.pattern))
      return { format: store.sequence.format, nextNumberText: updates.provisionalLabel(store, localToday()), saveStatus: 'saved' }
    },
    retrySave: () => repository.retry(),
    resolveSaveConflicts: (choices: Record<string, 'local' | 'remote'>) => repository.resolveConflicts(choices),
    refresh: () => repository.refresh(),
  }
}
