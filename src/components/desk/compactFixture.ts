import { vi } from 'vitest'
import type { InvoiceProduct } from '../../hooks/useInvoiceProduct'
import { emptyStore, localToday } from '../../lib/invoices/defaults'
import { searchInvoices } from '../../lib/invoices/queries'
import { archiveStats } from '../../lib/invoices/stats'
import type { DeskShellProps } from './DeskShell'
import type { InvoiceContent, InvoiceStore, Proposal } from '../../lib/invoices/types'

/** A test store and a stand-in for useInvoiceProduct, for rendering the desk without the shell. Not part of the app. */
export const IDS = { overdue: 'inv-overdue', paid: 'inv-paid', soon: 'inv-soon', draft: 'draft-1', offer: 'offer-1' }

const shift = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return localToday(date) }

function content(name: string, description: string, unitPrice: number, dueInDays: number, quantity = 1): InvoiceContent {
  const store = emptyStore()
  return {
    sender: { name: 'Pure Science', address: 'Somewhere' }, recipient: { name, address: 'Street\nCity' }, invoiceDate: shift(dueInDays - 30), dueDate: shift(dueInDays), termsDays: 30,
    currency: 'USD', reference: 'PO 42', lineItems: [{ description, quantity, unitPrice }], notes: '', paymentInstructions: '', presentation: store.template,
  } as unknown as InvoiceContent
}

function issued(id: string, number: number, c: InvoiceContent, at: string, marks?: Record<string, string>) {
  return { id, number, numberText: `PS-00${number}`, marks, historical: false, createdAt: at, updatedAt: at, currentVersionId: `${id}-v1`,
    versions: [{ id: `${id}-v1`, issuedAt: at, content: c, pdf: {} }], history: [] }
}

export function compactStore(options: { empty?: boolean } = {}): InvoiceStore {
  const store = emptyStore()
  store.sequence = { ...store.sequence, verified: true, nextNumber: 4, format: { pattern: 'PS-{NNN}' } }
  if (options.empty) return store
  store.invoices = {
    [IDS.overdue]: issued(IDS.overdue, 1, content('Acme Ltd', 'Website work', 1234.5, -12), '2026-09-01T10:00:00Z'),
    [IDS.paid]: issued(IDS.paid, 2, content('Globex', 'Annual report', 800, -40), '2026-08-01T10:00:00Z', { paidAt: shift(-20), paidReference: 'BACS 991' }),
    [IDS.soon]: issued(IDS.soon, 3, content('Initech', 'Retainer, October', 500, 9, 2), '2026-10-20T10:00:00Z', { sentAt: shift(-3), sentTo: 'ap@initech.example' }),
  } as unknown as InvoiceStore['invoices']
  store.drafts = { [IDS.draft]: { id: IDS.draft, createdAt: '2026-10-30T10:00:00Z', updatedAt: '2026-10-30T10:00:00Z', content: content('Umbrella Corp', 'Workshop', 2500, 20) } } as unknown as InvoiceStore['drafts']
  const proposal = { id: IDS.offer, createdAt: '2026-10-28T10:00:00Z', updatedAt: '2026-10-28T10:00:00Z', history: [],
    versions: [{ id: 'offer-v1', number: 1, status: 'offered', revision: 1, offeredAt: '2026-10-28', content: {
      title: 'Brand refresh', enquiry: '', enquiryDate: null, customer: { name: 'Hooli', address: '' }, scope: 'Logo and type', deliverables: '', exclusions: '', timing: '',
      items: [{ description: 'Design', quantity: 1, unitPrice: 9000 }], currency: 'EUR', paymentTerms: '', paymentTermsDays: 14 } }] } as unknown as Proposal
  store.proposals = { [IDS.offer]: proposal }
  return store
}

export function fakeProduct(store: InvoiceStore, place: { destination?: string; selectedId?: string | null; selectedProposalId?: string | null } = {}): InvoiceProduct {
  const selectedId = place.selectedId ?? null
  const issuedInvoice = selectedId ? store.invoices[selectedId] : undefined
  const selected = selectedId ? store.drafts[selectedId] : undefined
  const action = () => vi.fn(async () => undefined)
  return {
    destination: place.destination ?? 'invoices', selectedId, selected, issued: issuedInvoice,
    version: issuedInvoice?.versions.find(version => version.id === issuedInvoice.currentVersionId),
    content: selected?.content ?? null, label: issuedInvoice?.numberText ?? 'PS-004', labelFor: (id: string) => store.invoices[id]?.numberText ?? null,
    archive: searchInvoices(store), archiveQuery: {}, pageOffset: 0, archiveClients: [], stats: archiveStats(store), selectedClientId: null,
    selectedAgreementId: null, selectedLibraryId: null, selectedContractorId: null, selectedProposalId: place.selectedProposalId ?? null,
    scrollTop: 0, preview: null, availability: null, confirmation: null, message: '', error: undefined, busy: false, dirty: false, registering: false,
    historicalAsset: undefined, presentationDiagnostics: [], importOpen: false, importPreview: null, importing: false, clientTest: null,
    openInvoice: action(), openProposal: action(), navigate: action(), createDraft: action(), preparePreview: action(), editDraft: vi.fn(), quietly: (run: () => Promise<unknown>) => run(), act: action(),
    cancelPublication: vi.fn(), updateArchive: vi.fn(), openAssistant: vi.fn(),
  } as unknown as InvoiceProduct
}

export function deskProps(product: InvoiceProduct, store: InvoiceStore): DeskShellProps {
  return {
    product,
    workspace: { status: 'saved', value: store, error: null, conflicts: [], storageUnavailable: false } as unknown as DeskShellProps['workspace'],
    setup: { busy: false, message: '', nextLabel: 'PS-004' } as unknown as DeskShellProps['setup'],
    directory: { busy: false, message: '', editor: null, error: '' } as unknown as DeskShellProps['directory'],
  }
}
