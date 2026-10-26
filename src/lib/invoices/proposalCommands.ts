import { newId } from './defaults'
import { proposalFileName, proposalHtml } from './proposalHtml'
import * as pr from './proposals'
import type { InvoiceRepository } from './repository'
import type { InvoiceStore, ProposalStatus } from './types'

/** Saves an exported page where the person chooses; the shell's save dialog in the app, a stand-in in tests. */
export type ProposalHtmlSaver = (fileName: string, html: string) => Promise<{ cancelled: true } | { cancelled: false; path: string }>
export interface ProposalQuery { status?: ProposalStatus | 'all'; clientId?: string; query?: string }

/** Everything the page and the assistant need about one proposal, with the money for each version. */
export function proposalDetails(store: InvoiceStore, id: string, versionId?: string) {
  const proposal = pr.getProposal(store, id)
  const selected = pr.getProposalVersion(proposal, versionId)
  return {
    id: proposal.id, status: pr.proposalStatus(proposal), acceptedVersionId: proposal.acceptedVersionId ?? null,
    latestVersionId: pr.latestVersion(proposal).id,
    versions: proposal.versions.map(v => {
      const calculation = pr.calculateProposal(v.content)
      return { id: v.id, number: v.number, status: v.status, revision: v.revision, basedOnVersionId: v.basedOnVersionId ?? null,
        offeredAt: v.offeredAt ?? null, decidedAt: v.decidedAt ?? null, createdAt: v.createdAt, updatedAt: v.updatedAt,
        customer: v.content.customer.name, currency: v.content.currency, total: calculation.total, complete: calculation.complete }
    }),
    version: { id: selected.id, number: selected.number, status: selected.status, revision: selected.revision, offeredAt: selected.offeredAt ?? null,
      decidedAt: selected.decidedAt ?? null, content: selected.content, calculation: pr.calculateProposal(selected.content) },
    invoice: pr.conversionTarget(store, proposal), history: proposal.history, createdAt: proposal.createdAt, updatedAt: proposal.updatedAt,
  }
}

export function createProposalCommands(repository: InvoiceRepository, saveHtml: ProposalHtmlSaver) {
  const read = () => repository.current()
  const saved = (store: InvoiceStore, id: string, versionId?: string) => ({ ...proposalDetails(store, id, versionId), saveStatus: 'saved' as const })
  return {
    async listProposals(query: ProposalQuery = {}) {
      const store = await read(), needle = (query.query ?? '').trim().toLocaleLowerCase()
      const proposals = pr.proposalRows(store).filter(r => (!query.status || query.status === 'all' || r.status === query.status)
        && (!query.clientId || r.clientId === query.clientId) && (!needle || [r.title, r.customer].some(v => v.toLocaleLowerCase().includes(needle))))
      return { proposals, count: proposals.length, saveStatus: repository.getSnapshot().status }
    },
    async getProposal(args: { proposalId: string; versionId?: string }) {
      return { ...proposalDetails(await read(), args.proposalId, args.versionId), saveStatus: repository.getSnapshot().status }
    },
    async createProposal(args: { clientId?: string; details?: pr.ProposalPatch } = {}) {
      const id = newId()
      return saved(await repository.transact(s => pr.createProposal(s, args, id)), id)
    },
    /** Edits the latest draft version; after an offer, starts the next draft version and leaves the offer untouched. */
    async updateProposal(args: { proposalId: string; clientId?: string; changes?: pr.ProposalPatch }) {
      const store = await repository.transact(s => pr.updateProposal(s, args.proposalId, args))
      return saved(store, args.proposalId)
    },
    async setProposalStatus(args: { proposalId: string; versionId: string; status: Exclude<ProposalStatus, 'draft'> }) {
      return saved(await repository.transact(s => pr.setProposalStatus(s, args.proposalId, args.versionId, args.status)), args.proposalId, args.versionId)
    },
    /** The selected version as a standalone HTML page, saved where the person chooses. Changes nothing in the workspace. */
    async exportProposal(args: { proposalId: string; versionId: string }) {
      const store = await read(), proposal = pr.getProposal(store, args.proposalId)
      const version = pr.getProposalVersion(proposal, args.versionId)
      const fileName = proposalFileName(proposal, version.id)
      const result = await saveHtml(fileName, proposalHtml(store, proposal, version.id))
      return { proposalId: proposal.id, versionId: version.id, versionNumber: version.number, versionStatus: version.status, fileName,
        ...(result.cancelled ? { status: 'cancelled' as const } : { status: 'saved' as const, path: result.path }) }
    },
    /**
     * The accepted version becomes an invoice draft, explicitly. The draft and
     * the proposal's link are written in one guarded write, so a lost
     * acknowledgement or a retry finds the link and returns the same invoice.
     */
    async convertProposalToInvoice(args: { proposalId: string; versionId: string }) {
      const current = await read()
      const existing = pr.conversionTarget(current, pr.getProposal(current, args.proposalId))
      const draftId = newId()
      const store = await repository.guardedTransact(s => pr.convertProposal(s, args.proposalId, args.versionId, draftId))
      const target = pr.conversionTarget(store, pr.getProposal(store, args.proposalId))!
      return { proposalId: args.proposalId, versionId: target.versionId, invoiceId: target.invoiceId, invoiceStatus: target.status,
        numberText: target.numberText, provisionalNumberText: target.provisionalNumberText,
        created: !existing || existing.status === 'missing' || existing.invoiceId !== target.invoiceId, saveStatus: 'saved' as const }
    },
  }
}
export type ProposalCommands = ReturnType<typeof createProposalCommands>
