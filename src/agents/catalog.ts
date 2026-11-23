import type { AgentToolHandler } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import type { InvoiceRepository } from '../lib/invoices/repository'

/**
 * Exposed PureInvoicing operations (must stay in sync 1:1 with `plugin.json` -> `app.agents.tools[].name`).
 *
 * 3-tier exposure (built on `@purescience/platform-ui/bridge/appFunctions`):
 *   1. 8 composite `function` workflows (`fn_*`) — replace 3–12 atomic round-trips each
 *   2. 14 core atomic tools (~20% of 71) — indispensable direct read/write/issuance/mark verbs
 *   3. 3 universal escape-hatch meta-tools (`discoverAppTools`, `callExtendedReadTool`, `callExtendedTool`)
 *      providing full on-demand access to the remaining 57 specialist atomic tools.
 */
export const PUREINVOICING_FUNCTION_NAMES = [
  'fn_receivablesBriefing',
  'fn_clientBillingDossier',
  'fn_agingAndCashflowReport',
  'fn_buildClientInvoiceDraft',
  'fn_auditInvoiceReadiness',
  'fn_reconcilePaymentsAudit',
  'fn_agreementsBillingSummary',
  'fn_proposalsPipelineOverview',
] as const

export const PUREINVOICING_CORE_TOOL_NAMES = [
  'getWorkspaceState',
  'searchInvoices',
  'getInvoice',
  'searchClients',
  'saveClient',
  'createInvoiceDraft',
  'updateInvoiceDraft',
  'prepareInvoiceFinalization',
  'finalizeInvoice',
  'exportInvoicePdf',
  'markInvoice',
  'listAgreements',
  'getAgreement',
  'listProposals',
] as const

export const PUREINVOICING_META_TOOL_NAMES = [
  'discoverAppTools',
  'callExtendedReadTool',
  'callExtendedTool',
] as const

export const APP_AGENT_TOOL_NAMES = [
  ...PUREINVOICING_FUNCTION_NAMES,
  ...PUREINVOICING_CORE_TOOL_NAMES,
  ...PUREINVOICING_META_TOOL_NAMES,
] as const

export const PUREINVOICING_EXTENDED_TOOL_NAMES = [
  'updateBusinessIdentity',
  'setNextInvoiceNumber',
  'applyDefaultsToDraft',
  'updatePresentation',
  'saveDraftPresentationAsDefault',
  'getInvoicePreview',
  'startInvoiceCorrection',
  'discardInvoiceDraft',
  'setHistoricalPdfReference',
  'addInvoiceNote',
  'updateInvoiceNote',
  'linkDocument',
  'unlinkDocument',
  'setNumberFormat',
  'previewInvoiceImport',
  'importInvoices',
  'createAgreement',
  'updateAgreement',
  'editAgreementSection',
  'sendAgreement',
  'withdrawAgreement',
  'markAgreementSigned',
  'closeAgreement',
  'reopenAgreement',
  'setMilestoneDone',
  'invoiceAgreementMilestone',
  'invoiceAgreementMonth',
  'linkInvoiceToAgreement',
  'addContractorBill',
  'updateContractorBill',
  'searchContractors',
  'saveContractor',
  'listAgreementTemplates',
  'getAgreementTemplate',
  'saveAgreementTemplate',
  'editTemplateSection',
  'deleteAgreementTemplate',
  'findAgreementSpecifics',
  'makeTemplateFromAgreement',
  'createOutlineTemplate',
  'previewAgreementFromTemplate',
  'createAgreementFromTemplate',
  'discardAgreement',
  'addAgreementNote',
  'updateAgreementNote',
  'exportAgreementPdf',
  'listLibrary',
  'readLibraryDocument',
  'addLibraryDocumentFromPath',
  'updateLibraryDocument',
  'removeLibraryDocument',
  'getProposal',
  'createProposal',
  'updateProposal',
  'setProposalStatus',
  'exportProposal',
  'convertProposalToInvoice',
] as const

export const PUREINVOICING_ALL_ATOMIC_TOOL_NAMES = [
  ...PUREINVOICING_CORE_TOOL_NAMES,
  ...PUREINVOICING_EXTENDED_TOOL_NAMES,
] as const

export const APP_AGENT_LOG_LABEL = 'invoicing'

export interface InvoicingAgentToolContext {
  repository: InvoiceRepository
  atomicHandlers: Record<string, AgentToolHandler>
  now?: () => Date
}
