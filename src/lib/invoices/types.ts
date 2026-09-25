export interface Party {
  name: string
  address: string
  contactName?: string
  email?: string
  phone?: string
  website?: string
  registrationIdentifier?: string
  taxIdentifier?: string
}
/** A file kept elsewhere (a contract, statement of work, purchase order) that an invoice or client rests on. Linked by path; never copied. */
export interface LinkedDocument {
  id: string
  path: string
  name: string
  kind: 'contract' | 'sow' | 'purchase-order' | 'other'
  addedAt: string
}
/** A working note on an issued invoice, such as a follow-up to do; ticked off when done. */
export interface InvoiceNote { id: string; text: string; at: string; doneAt?: string }
export interface Business extends Party { defaultPaymentInstructions: string; defaultTermsDays?: number }
export interface Client {
  id: string
  name: string
  billingAddress: string
  contactName?: string
  email?: string
  phone?: string
  taxIdentifier?: string
  /** Usual payment terms for this client, in days after the invoice date. */
  termsDays?: number
  /** Usual invoicing currency for this client. */
  currency?: string
  /** Contracts, SOWs and other agreements with this client. */
  documents?: LinkedDocument[]
  updatedAt: string
}
export interface Presentation {
  logoAssetId: string | null
  logoWidthMm: number
  logoPlacement: 'left' | 'center' | 'right'
  letterheadText: string
  letterheadAlignment: 'left' | 'center' | 'right'
  letterheadTextSizePt: number
  footerText: string
  footerAlignment: 'left' | 'center' | 'right'
  footerTextSizePt: number
  typeStyle: string
  bodyTextSizePt: number
  lineSpacing: number
  sectionSpacingMm: number
  accentColor: string
  pageSize: string
  marginsMm: { top: number; right: number; bottom: number; left: number }
  showPageNumbers: boolean
}
export interface LineItem {
  description: string
  quantity: number | null
  unitPrice: number | null
  discountPercent?: number | null
  taxPercent?: number | null
}
export interface InvoiceContent {
  sender: Party
  recipient: Party
  clientId?: string
  invoiceDate: string | null
  dueDate: string | null
  /** Payment terms in days; the due date follows from the invoice date while set. Null means a custom due date. */
  termsDays?: number | null
  reference: string
  currency: string | null
  lineItems: LineItem[]
  notes: string
  paymentInstructions: string
  presentation: Presentation
}
export type ContentPatch = Partial<Omit<InvoiceContent, 'sender' | 'recipient' | 'clientId' | 'presentation'>> & {
  sender?: Partial<Party>; recipient?: Partial<Party>
}
export interface SourceLink { invoiceId: string; versionId?: string }
export interface Draft {
  id: string
  revision: number
  createdAt: string
  updatedAt: string
  content: InvoiceContent
  source?: SourceLink
  correctionOf?: string
  currencyReviewRequired: boolean
}
export interface IssuedVersion {
  id: string
  issuedAt: string
  content: InvoiceContent
  changeNote?: string
  /** The number this version printed, when a registered invoice was renumbered from this version on. */
  numberText?: string
  pdf?: { assetId: string; fileName: string; provenance: 'app-produced' }
}
export interface HistoryEntry {
  id: string
  at: string
  kind: 'issued' | 'corrected' | 'reissued' | 'historical' | 'referenceChanged' | 'sent' | 'paid' | 'unmarked'
  versionId?: string
  note?: string
}
/** Marks the person sets; never inferred. */
export interface InvoiceMarks { sentAt?: string; sentTo?: string; paidAt?: string; paidReference?: string; paidNote?: string }
export interface IssuedInvoice {
  id: string
  number: number
  /** The label the client saw, frozen at issue (the number through the pattern of the day). */
  numberText?: string
  marks?: InvoiceMarks
  historical: boolean
  createdAt: string
  updatedAt: string
  currentVersionId: string
  versions: IssuedVersion[]
  history: HistoryEntry[]
  source?: SourceLink
  historicalPdf?: { assetId: string; provenance: 'unverified-historical-original' }
  /** Working notes; never printed. */
  notes?: InvoiceNote[]
  /** The agreements this invoice bills against (its client's documents are offered too). */
  documents?: LinkedDocument[]
}
export interface Sequence {
  verified: boolean
  /** How the counter is written, e.g. PS-{YYYY}-{NNN}; absent means the bare counter. */
  format?: { pattern: string }
  nextNumber: number
  reservedNumbers: number[]
  history: { at: string; from: number; to: number; kind: 'configured' | 'reserved' }[]
}
export interface RetainedAsset {
  id: string; name: string; mimeType: string; readable: boolean
  path?: string; sha256?: string; byteLength?: number
}
export interface RetainedDocument {
  id: string; htmlAssetId: string; pdfAssetId?: string; pageCount: number
}
export type FinalizationAction = { kind: 'issue' } | { kind: 'publishCorrection'; changeNote: string }
  | { kind: 'registerHistorical'; originalNumber: number; originalPdfAssetId?: string }
export interface PublicationReceipt {
  confirmationToken: string
  invoiceId: string
  versionId: string
  number: number
  numberText?: string
  issuedAt: string
  action: FinalizationAction
  total: string
  currency: string
}
/** Agreements: master services agreements, statements of work, change orders, NDAs and contractor agreements. */
export type AgreementKind = 'msa' | 'sow' | 'change-order' | 'nda' | 'contractor'
/** client: Pure Science does the work and invoices; contractor: someone does work for Pure Science and bills it. */
export type AgreementDirection = 'client' | 'contractor'
export type AgreementStatus = 'draft' | 'sent' | 'signed' | 'complete' | 'ended'
export interface AgreementSection { id: string; heading: string; body: string }
export interface AgreementMilestone {
  id: string
  label: string
  amount: number
  /** When it may be invoiced: on signature, when marked done, on acceptance, or a month of a retainer. */
  trigger: 'signature' | 'done' | 'acceptance' | 'period'
  /** A retainer month, YYYY-MM. */
  period?: string
  doneAt?: string
  /** The invoice draft made for it; the id carries over when the draft is issued. */
  invoiceId?: string
}
/** An invoice a contractor sent, checked against the agreement's rate and cap. */
export interface ContractorBill { id: string; reference: string; period: string; hours?: number; amount: number; receivedAt: string; paidAt?: string; path?: string; approvedOverCap?: boolean }
export interface AgreementFee { kind: 'fixed' | 'monthly' | 'hourly' | 'none'; amount?: number; rate?: number; cap?: number }
export interface Agreement {
  id: string
  kind: AgreementKind
  direction: AgreementDirection
  /** Given when it is sent for signature (or typed when registering one already signed). */
  numberText?: string
  title: string
  clientId?: string
  contractorId?: string
  /** The MSA a SOW sits under, or the agreement a change order amends. */
  parentId?: string
  status: AgreementStatus
  /** Registered: signed elsewhere and recorded here; its text is the signed file. */
  registered?: boolean
  sections: AgreementSection[]
  currency: string
  fee: AgreementFee
  paymentDays?: number
  startDate?: string
  endDate?: string
  milestones: AgreementMilestone[]
  /** Other invoices billed against it (linked by hand). */
  invoiceIds: string[]
  bills: ContractorBill[]
  signatures: { party: 'us' | 'them'; name: string; at: string }[]
  signedPdfPath?: string
  sentAt?: string
  signedAt?: string
  closedAt?: string
  documents?: LinkedDocument[]
  notes?: InvoiceNote[]
  history: { id: string; at: string; note: string }[]
  createdAt: string
  updatedAt: string
}
/**
 * A blank in a template. Filled ones come from the agreement's context (the
 * party, the agreement it sits under, the business); asked ones are answered
 * once when the template is used. In the wording a field is written {{key}}.
 */
export type TemplateFieldSource = 'party' | 'partyContact' | 'business' | 'parentTitle' | 'parentNumber' | 'parentDate' | 'paymentDays' | 'sequence' | 'today' | 'ask'
export interface TemplateField { key: string; label: string; source: TemplateFieldSource; type?: 'text' | 'number' | 'money' | 'date'; default?: string }
/** A reusable agreement: the person's wording with fields and [prompts], its fee shape and milestones as shares of the fee. */
export interface AgreementTemplate {
  id: string
  name: string
  description?: string
  kind: AgreementKind
  direction: AgreementDirection
  /** The title with fields, e.g. "Statement of Work #{{sequence}} — {{project}}". */
  title: string
  sections: { heading: string; body: string }[]
  fields: TemplateField[]
  /** fixed/monthly: the amount comes from an asked money field; hourly: rate and cap may be preset or asked. */
  fee: { kind: 'fixed' | 'monthly' | 'hourly' | 'none'; amountField?: string; rateField?: string; capField?: string }
  /** Percent of a fixed fee, adding up to 100. */
  milestones: { label: string; share: number; trigger: 'signature' | 'done' | 'acceptance' }[]
  /** Payment days: a number, or taken from the agreement it sits under (else the client), or the client's usual terms. */
  paymentDays?: number | 'parent' | 'client'
  isDefault?: boolean
  /** Where it came from, in words: "Made from SOW #1 with Example Training". */
  origin?: string
  createdAt: string
  updatedAt: string
}
/** Someone who does work for Pure Science. */
export interface Contractor {
  id: string
  name: string
  contactName?: string
  email?: string
  address?: string
  taxIdentifier?: string
  currency?: string
  documents?: LinkedDocument[]
  updatedAt: string
}
export interface InvoiceStore {
  schemaVersion: 1
  business: Business
  template: Presentation
  clients: Record<string, Client>
  drafts: Record<string, Draft>
  invoices: Record<string, IssuedInvoice>
  sequence: Sequence
  assets: Record<string, RetainedAsset>
  documents?: Record<string, RetainedDocument>
  publications?: Record<string, PublicationReceipt>
  agreements?: Record<string, Agreement>
  contractors?: Record<string, Contractor>
  templates?: Record<string, AgreementTemplate>
  /** Superseded by templates; kept so older workspaces still load. */
  agreementTemplates?: Partial<Record<AgreementKind, { heading: string; body: string }[]>>
}
export interface Diagnostic { field: string; message: string }
export interface ArchiveQuery {
  query?: string; status?: 'all' | 'draft' | 'issued' | 'open' | 'sent' | 'overdue' | 'paid'; clientId?: string; historicalOnly?: boolean
  sortBy?: 'updatedAt' | 'invoiceDate' | 'number' | 'client'
  sortDirection?: 'ascending' | 'descending'; cursor?: string; limit?: number
}
export interface ClientQuery { query?: string; clientId?: string; cursor?: string; limit?: number }
export type DefaultSource = 'businessIdentity' | 'paymentInstructions' | 'template' | 'client'
export interface NavigationPreferences {
  destination: 'invoices' | 'agreements' | 'clients' | 'contractors' | 'business'
  archive: ArchiveQuery
  selectedInvoiceId: string | null
  selectedClientId?: string | null
  selectedAgreementId?: string | null
  selectedContractorId?: string | null
  scrollTop: number
}
