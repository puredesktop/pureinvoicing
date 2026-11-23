import { agentToolErrorContent, formatAgentToolJson } from '@purescience/platform-ui/bridge/agentToolHelpers'
import type { AgentToolHandler } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'

import { invoiceCommands } from '../../lib/invoices/workspace'
import type { ImportSource } from '../../lib/invoices/importCommands'

type ImportArgs = { source: ImportSource; skipConflicts?: boolean }
import { validateDomainArguments } from '../validateDomainArguments'
import { agentReplies } from '../replies'

function domainTool<T>(name: string, command: (args: T) => Promise<unknown>): AgentToolHandler {
  // Changes reply with what changed, not the whole document (see ../replies).
  const reply = agentReplies[name]
  return async invoke => {
    try {
      validateDomainArguments(name, invoke.arguments)
      const result = await command(invoke.arguments as T)
      return { content: formatAgentToolJson(reply ? reply(result as Record<string, unknown>, (invoke.arguments ?? {}) as Record<string, unknown>) : result) }
    } catch (error) {
      console.error(`Invoice tool ${name} failed`, error)
      return agentToolErrorContent(error instanceof Error ? error.message : String(error))
    }
  }
}

export type InvoiceCommandSurface = typeof invoiceCommands

export function createAtomicHandlers(
  commands: Partial<Record<keyof InvoiceCommandSurface, unknown>>,
): Record<string, AgentToolHandler> {
  const cmd = commands as InvoiceCommandSurface
  return {
    "getWorkspaceState": domainTool("getWorkspaceState", cmd.getWorkspaceState),
    "searchInvoices": domainTool("searchInvoices", cmd.searchInvoices),
    "getInvoice": domainTool("getInvoice", cmd.getInvoice),
    "searchClients": domainTool("searchClients", cmd.searchClients),
    "saveClient": domainTool("saveClient", cmd.saveClient),
    "updateBusinessIdentity": domainTool("updateBusinessIdentity", cmd.updateBusinessIdentity),
    "setNextInvoiceNumber": domainTool("setNextInvoiceNumber", cmd.setNextInvoiceNumber),
    "createInvoiceDraft": domainTool("createInvoiceDraft", cmd.createInvoiceDraft),
    "updateInvoiceDraft": domainTool("updateInvoiceDraft", cmd.updateInvoiceDraft),
    "applyDefaultsToDraft": domainTool("applyDefaultsToDraft", cmd.applyDefaultsToDraft),
    "updatePresentation": domainTool("updatePresentation", cmd.updatePresentation),
    "saveDraftPresentationAsDefault": domainTool("saveDraftPresentationAsDefault", cmd.saveDraftPresentationAsDefault),
    "getInvoicePreview": domainTool("getInvoicePreview", cmd.getInvoicePreview),
    "startInvoiceCorrection": domainTool("startInvoiceCorrection", cmd.startInvoiceCorrection),
    "prepareInvoiceFinalization": domainTool("prepareInvoiceFinalization", cmd.prepareInvoiceFinalization),
    "finalizeInvoice": domainTool("finalizeInvoice", cmd.finalizeInvoice),
    "discardInvoiceDraft": domainTool("discardInvoiceDraft", cmd.discardInvoiceDraft),
    "exportInvoicePdf": domainTool("exportInvoicePdf", cmd.exportInvoicePdf),
    "setHistoricalPdfReference": domainTool("setHistoricalPdfReference", cmd.setHistoricalPdfReference),
    "markInvoice": domainTool("markInvoice", cmd.markInvoice),
    "addInvoiceNote": domainTool("addInvoiceNote", cmd.addInvoiceNote),
    "updateInvoiceNote": domainTool("updateInvoiceNote", cmd.updateInvoiceNote),
    "linkDocument": domainTool("linkDocument", cmd.linkDocument),
    "unlinkDocument": domainTool("unlinkDocument", cmd.unlinkDocument),
    "setNumberFormat": domainTool("setNumberFormat", cmd.setNumberFormat),
    "previewInvoiceImport": domainTool<ImportArgs>("previewInvoiceImport", args => cmd.previewInvoiceImport(args)),
    "importInvoices": domainTool<ImportArgs>("importInvoices", args => cmd.importInvoices(args)),
    "listAgreements": domainTool("listAgreements", cmd.listAgreements as (args: never) => Promise<unknown>),
    "listLibrary": domainTool("listLibrary", cmd.listLibrary as (args: never) => Promise<unknown>),
    "readLibraryDocument": domainTool("readLibraryDocument", cmd.readLibraryDocument),
    "addLibraryDocumentFromPath": domainTool("addLibraryDocumentFromPath", cmd.addLibraryDocumentFromPath),
    "updateLibraryDocument": domainTool("updateLibraryDocument", cmd.updateLibraryDocument),
    "removeLibraryDocument": domainTool("removeLibraryDocument", cmd.removeLibraryDocument),
    "getAgreement": domainTool("getAgreement", cmd.getAgreement as (args: never) => Promise<unknown>),
    "createAgreement": domainTool("createAgreement", cmd.createAgreement as (args: never) => Promise<unknown>),
    "updateAgreement": domainTool("updateAgreement", cmd.updateAgreement as (args: never) => Promise<unknown>),
    "editAgreementSection": domainTool("editAgreementSection", cmd.editAgreementSection as (args: never) => Promise<unknown>),
    "sendAgreement": domainTool("sendAgreement", cmd.sendAgreement as (args: never) => Promise<unknown>),
    "withdrawAgreement": domainTool("withdrawAgreement", cmd.withdrawAgreement as (args: never) => Promise<unknown>),
    "markAgreementSigned": domainTool("markAgreementSigned", cmd.markAgreementSigned as (args: never) => Promise<unknown>),
    "closeAgreement": domainTool("closeAgreement", cmd.closeAgreement as (args: never) => Promise<unknown>),
    "reopenAgreement": domainTool("reopenAgreement", cmd.reopenAgreement as (args: never) => Promise<unknown>),
    "setMilestoneDone": domainTool("setMilestoneDone", cmd.setMilestoneDone as (args: never) => Promise<unknown>),
    "invoiceAgreementMilestone": domainTool("invoiceAgreementMilestone", cmd.invoiceAgreementMilestone as (args: never) => Promise<unknown>),
    "invoiceAgreementMonth": domainTool("invoiceAgreementMonth", cmd.invoiceAgreementMonth as (args: never) => Promise<unknown>),
    "linkInvoiceToAgreement": domainTool("linkInvoiceToAgreement", cmd.linkInvoiceToAgreement as (args: never) => Promise<unknown>),
    "addContractorBill": domainTool("addContractorBill", cmd.addContractorBill as (args: never) => Promise<unknown>),
    "updateContractorBill": domainTool("updateContractorBill", cmd.updateContractorBill as (args: never) => Promise<unknown>),
    "searchContractors": domainTool("searchContractors", cmd.searchContractors as (args: never) => Promise<unknown>),
    "saveContractor": domainTool("saveContractor", cmd.saveContractor as (args: never) => Promise<unknown>),
    "listAgreementTemplates": domainTool("listAgreementTemplates", cmd.listAgreementTemplates as (args: never) => Promise<unknown>),
    "getAgreementTemplate": domainTool("getAgreementTemplate", cmd.getAgreementTemplate as (args: never) => Promise<unknown>),
    "saveAgreementTemplate": domainTool("saveAgreementTemplate", cmd.saveAgreementTemplate as (args: never) => Promise<unknown>),
    "editTemplateSection": domainTool("editTemplateSection", cmd.editTemplateSection as (args: never) => Promise<unknown>),
    "deleteAgreementTemplate": domainTool("deleteAgreementTemplate", cmd.deleteAgreementTemplate as (args: never) => Promise<unknown>),
    "findAgreementSpecifics": domainTool("findAgreementSpecifics", cmd.findAgreementSpecifics as (args: never) => Promise<unknown>),
    "makeTemplateFromAgreement": domainTool("makeTemplateFromAgreement", cmd.makeTemplateFromAgreement as (args: never) => Promise<unknown>),
    "createOutlineTemplate": domainTool("createOutlineTemplate", cmd.createOutlineTemplate as (args: never) => Promise<unknown>),
    "previewAgreementFromTemplate": domainTool("previewAgreementFromTemplate", cmd.previewAgreementFromTemplate as (args: never) => Promise<unknown>),
    "createAgreementFromTemplate": domainTool("createAgreementFromTemplate", cmd.createAgreementFromTemplate as (args: never) => Promise<unknown>),
    "discardAgreement": domainTool("discardAgreement", cmd.discardAgreement as (args: never) => Promise<unknown>),
    "addAgreementNote": domainTool("addAgreementNote", cmd.addAgreementNote as (args: never) => Promise<unknown>),
    "updateAgreementNote": domainTool("updateAgreementNote", cmd.updateAgreementNote as (args: never) => Promise<unknown>),
    "exportAgreementPdf": domainTool("exportAgreementPdf", cmd.exportAgreementPdf as (args: never) => Promise<unknown>),
    "listProposals": domainTool("listProposals", cmd.listProposals as (args: never) => Promise<unknown>),
    "getProposal": domainTool("getProposal", cmd.getProposal as (args: never) => Promise<unknown>),
    "createProposal": domainTool("createProposal", cmd.createProposal as (args: never) => Promise<unknown>),
    "updateProposal": domainTool("updateProposal", cmd.updateProposal as (args: never) => Promise<unknown>),
    "setProposalStatus": domainTool("setProposalStatus", cmd.setProposalStatus as (args: never) => Promise<unknown>),
    "exportProposal": domainTool("exportProposal", cmd.exportProposal as (args: never) => Promise<unknown>),
    "convertProposalToInvoice": domainTool("convertProposalToInvoice", cmd.convertProposalToInvoice as (args: never) => Promise<unknown>),
  } satisfies Record<string, AgentToolHandler>
}

export const appAgentHandlers = createAtomicHandlers(invoiceCommands)
