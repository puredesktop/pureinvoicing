import { agentToolErrorContent, formatAgentToolJson } from '@purescience/platform-ui/bridge/agentToolHelpers'
import type { AgentToolHandler } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'

import { invoiceCommands } from '../../lib/invoices/workspace'
import type { ImportSource } from '../../lib/invoices/importCommands'

type ImportArgs = { source: ImportSource; skipConflicts?: boolean }
import { validateDomainArguments } from '../validateDomainArguments'

function domainTool<T>(name: string, command: (args: T) => Promise<unknown>): AgentToolHandler {
  return async invoke => {
    try {
      validateDomainArguments(name, invoke.arguments)
      return { content: formatAgentToolJson(await command(invoke.arguments as T)) }
    } catch (error) {
      console.error(`Invoice tool ${name} failed`, error)
      return agentToolErrorContent(error instanceof Error ? error.message : String(error))
    }
  }
}

export const appAgentHandlers = {
  "getWorkspaceState": domainTool("getWorkspaceState", invoiceCommands.getWorkspaceState),
  "searchInvoices": domainTool("searchInvoices", invoiceCommands.searchInvoices),
  "getInvoice": domainTool("getInvoice", invoiceCommands.getInvoice),
  "searchClients": domainTool("searchClients", invoiceCommands.searchClients),
  "saveClient": domainTool("saveClient", invoiceCommands.saveClient),
  "updateBusinessIdentity": domainTool("updateBusinessIdentity", invoiceCommands.updateBusinessIdentity),
  "setNextInvoiceNumber": domainTool("setNextInvoiceNumber", invoiceCommands.setNextInvoiceNumber),
  "createInvoiceDraft": domainTool("createInvoiceDraft", invoiceCommands.createInvoiceDraft),
  "updateInvoiceDraft": domainTool("updateInvoiceDraft", invoiceCommands.updateInvoiceDraft),
  "applyDefaultsToDraft": domainTool("applyDefaultsToDraft", invoiceCommands.applyDefaultsToDraft),
  "updatePresentation": domainTool("updatePresentation", invoiceCommands.updatePresentation),
  "saveDraftPresentationAsDefault": domainTool("saveDraftPresentationAsDefault", invoiceCommands.saveDraftPresentationAsDefault),
  "getInvoicePreview": domainTool("getInvoicePreview", invoiceCommands.getInvoicePreview),
  "startInvoiceCorrection": domainTool("startInvoiceCorrection", invoiceCommands.startInvoiceCorrection),
  "prepareInvoiceFinalization": domainTool("prepareInvoiceFinalization", invoiceCommands.prepareInvoiceFinalization),
  "finalizeInvoice": domainTool("finalizeInvoice", invoiceCommands.finalizeInvoice),
  "discardInvoiceDraft": domainTool("discardInvoiceDraft", invoiceCommands.discardInvoiceDraft),
  "exportInvoicePdf": domainTool("exportInvoicePdf", invoiceCommands.exportInvoicePdf),
  "setHistoricalPdfReference": domainTool("setHistoricalPdfReference", invoiceCommands.setHistoricalPdfReference),
  "markInvoice": domainTool("markInvoice", invoiceCommands.markInvoice),
  "addInvoiceNote": domainTool("addInvoiceNote", invoiceCommands.addInvoiceNote),
  "updateInvoiceNote": domainTool("updateInvoiceNote", invoiceCommands.updateInvoiceNote),
  "linkDocument": domainTool("linkDocument", invoiceCommands.linkDocument),
  "unlinkDocument": domainTool("unlinkDocument", invoiceCommands.unlinkDocument),
  "setNumberFormat": domainTool("setNumberFormat", invoiceCommands.setNumberFormat),
  "previewInvoiceImport": domainTool<ImportArgs>("previewInvoiceImport", args => invoiceCommands.previewInvoiceImport(args)),
  "importInvoices": domainTool<ImportArgs>("importInvoices", args => invoiceCommands.importInvoices(args)),
  "listAgreements": domainTool("listAgreements", invoiceCommands.listAgreements as (args: never) => Promise<unknown>),
  "getAgreement": domainTool("getAgreement", invoiceCommands.getAgreement as (args: never) => Promise<unknown>),
  "createAgreement": domainTool("createAgreement", invoiceCommands.createAgreement as (args: never) => Promise<unknown>),
  "updateAgreement": domainTool("updateAgreement", invoiceCommands.updateAgreement as (args: never) => Promise<unknown>),
  "editAgreementSection": domainTool("editAgreementSection", invoiceCommands.editAgreementSection as (args: never) => Promise<unknown>),
  "sendAgreement": domainTool("sendAgreement", invoiceCommands.sendAgreement as (args: never) => Promise<unknown>),
  "withdrawAgreement": domainTool("withdrawAgreement", invoiceCommands.withdrawAgreement as (args: never) => Promise<unknown>),
  "markAgreementSigned": domainTool("markAgreementSigned", invoiceCommands.markAgreementSigned as (args: never) => Promise<unknown>),
  "closeAgreement": domainTool("closeAgreement", invoiceCommands.closeAgreement as (args: never) => Promise<unknown>),
  "reopenAgreement": domainTool("reopenAgreement", invoiceCommands.reopenAgreement as (args: never) => Promise<unknown>),
  "setMilestoneDone": domainTool("setMilestoneDone", invoiceCommands.setMilestoneDone as (args: never) => Promise<unknown>),
  "invoiceAgreementMilestone": domainTool("invoiceAgreementMilestone", invoiceCommands.invoiceAgreementMilestone as (args: never) => Promise<unknown>),
  "invoiceAgreementMonth": domainTool("invoiceAgreementMonth", invoiceCommands.invoiceAgreementMonth as (args: never) => Promise<unknown>),
  "linkInvoiceToAgreement": domainTool("linkInvoiceToAgreement", invoiceCommands.linkInvoiceToAgreement as (args: never) => Promise<unknown>),
  "addContractorBill": domainTool("addContractorBill", invoiceCommands.addContractorBill as (args: never) => Promise<unknown>),
  "updateContractorBill": domainTool("updateContractorBill", invoiceCommands.updateContractorBill as (args: never) => Promise<unknown>),
  "searchContractors": domainTool("searchContractors", invoiceCommands.searchContractors as (args: never) => Promise<unknown>),
  "saveContractor": domainTool("saveContractor", invoiceCommands.saveContractor as (args: never) => Promise<unknown>),
  "listAgreementTemplates": domainTool("listAgreementTemplates", invoiceCommands.listAgreementTemplates as (args: never) => Promise<unknown>),
  "getAgreementTemplate": domainTool("getAgreementTemplate", invoiceCommands.getAgreementTemplate as (args: never) => Promise<unknown>),
  "saveAgreementTemplate": domainTool("saveAgreementTemplate", invoiceCommands.saveAgreementTemplate as (args: never) => Promise<unknown>),
  "editTemplateSection": domainTool("editTemplateSection", invoiceCommands.editTemplateSection as (args: never) => Promise<unknown>),
  "deleteAgreementTemplate": domainTool("deleteAgreementTemplate", invoiceCommands.deleteAgreementTemplate as (args: never) => Promise<unknown>),
  "findAgreementSpecifics": domainTool("findAgreementSpecifics", invoiceCommands.findAgreementSpecifics as (args: never) => Promise<unknown>),
  "makeTemplateFromAgreement": domainTool("makeTemplateFromAgreement", invoiceCommands.makeTemplateFromAgreement as (args: never) => Promise<unknown>),
  "createOutlineTemplate": domainTool("createOutlineTemplate", invoiceCommands.createOutlineTemplate as (args: never) => Promise<unknown>),
  "previewAgreementFromTemplate": domainTool("previewAgreementFromTemplate", invoiceCommands.previewAgreementFromTemplate as (args: never) => Promise<unknown>),
  "createAgreementFromTemplate": domainTool("createAgreementFromTemplate", invoiceCommands.createAgreementFromTemplate as (args: never) => Promise<unknown>),
  "discardAgreement": domainTool("discardAgreement", invoiceCommands.discardAgreement as (args: never) => Promise<unknown>),
  "addAgreementNote": domainTool("addAgreementNote", invoiceCommands.addAgreementNote as (args: never) => Promise<unknown>),
  "updateAgreementNote": domainTool("updateAgreementNote", invoiceCommands.updateAgreementNote as (args: never) => Promise<unknown>),
  "exportAgreementPdf": domainTool("exportAgreementPdf", invoiceCommands.exportAgreementPdf as (args: never) => Promise<unknown>),
} satisfies Record<string, AgentToolHandler>
