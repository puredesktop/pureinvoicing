import { isStandaloneDevMode, readInvoiceWorkspaceStorage, writeInvoiceWorkspaceStorage } from '../../bridge/platformBridge'
import { createPresentationCommands } from './presentationCommands'
import { createFinalizationCommands } from './finalization'
import { createInvoiceCommands } from './commands'
import { createImportCommands } from './importCommands'
import { createAgreementCommands } from './agreementCommands'
import { InvoiceRepository } from './repository'
// Standalone dev (the Vite page opened directly): the workspace lives in localStorage so the UI can be worked on without the shell. Rendering still needs the shell.
const STANDALONE_KEY = 'puredesktop:invoicing:workspace'
const standalonePort = {
  async read() { const raw = window.localStorage.getItem(STANDALONE_KEY); return { value: raw ? JSON.parse(raw) : null, version: raw ? String(raw.length) : null } },
  async write(value: unknown) { const text = JSON.stringify(value); window.localStorage.setItem(STANDALONE_KEY, text); return { ok: true as const, version: String(text.length) } },
}
export const invoiceRepository = new InvoiceRepository(isStandaloneDevMode() ? standalonePort : { read: readInvoiceWorkspaceStorage, write: writeInvoiceWorkspaceStorage })
const core = createInvoiceCommands(invoiceRepository)
const presentation = createPresentationCommands(invoiceRepository)
export const invoiceCommands = {
  ...core, ...presentation, ...createFinalizationCommands(invoiceRepository, presentation.exportInvoicePdf), ...createImportCommands(invoiceRepository), ...createAgreementCommands(invoiceRepository),
  setDefaultTemplate: (settings: Partial<import('./types').Presentation>) => presentation.updatePresentation({ target: { kind: 'defaultTemplate' }, settings }),
  setDraftPresentation: (draftId: string, settings: Partial<import('./types').Presentation>) => presentation.updatePresentation({ target: { kind: 'draft', draftId }, settings }),
  async getInvoice(args: Parameters<typeof core.getInvoice>[0]) {
    const result = await core.getInvoice(args)
    if (result.status !== 'issued') return result
    const pdf = await presentation.getPdfAvailability(args.invoiceId, args.versionId)
    return { ...result, pdf }
  },
}
