import { describe, expect, it } from 'vitest'
import { createAgreementCommands } from '../lib/invoices/agreementCommands'
import { createInvoiceCommands } from '../lib/invoices/commands'
import { emptyStore } from '../lib/invoices/defaults'
import { createLibraryCommands } from '../lib/invoices/libraryCommands'
import { createProposalCommands } from '../lib/invoices/proposalCommands'
import { InvoiceRepository } from '../lib/invoices/repository'
import type { InvoiceStore, IssuedInvoice } from '../lib/invoices/types'
import {
  configureNumberFormat,
  configureSequence,
  createDraft,
  saveClient,
  updateBusiness,
  updateDraft,
} from '../lib/invoices/updates'
import * as ag from '../lib/invoices/agreements'
import * as lib from '../lib/invoices/library'
import * as pr from '../lib/invoices/proposals'
import { PUREINVOICING_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import {
  APP_AGENT_TOOL_NAMES,
  PUREINVOICING_ALL_ATOMIC_TOOL_NAMES,
  PUREINVOICING_CORE_TOOL_NAMES,
  PUREINVOICING_EXTENDED_TOOL_NAMES,
  PUREINVOICING_FUNCTION_NAMES,
  type InvoicingAgentToolContext,
} from './catalog'
import { domainSchemas } from './domainSchemas'
import { createAtomicHandlers } from './handlers'
import {
  buildPureInvoicingHandlers,
  PUREINVOICING_OPERATIONS_REGISTRY,
} from './operationsRegistry'

const FIXED_NOW = new Date('2026-11-15T12:00:00.000Z')
const TODAY = '2026-11-15'

const invoke = (shortName: string, args: Record<string, unknown> = {}) => ({
  toolCallId: `tc_${shortName}`,
  shortName,
  arguments: args,
})

function makeIssuedInvoice(
  store: InvoiceStore,
  spec: {
    id: string
    number: number
    numberText: string
    clientId: string
    invoiceDate: string
    dueDate: string
    currency: string
    reference: string
    amount: number
    sentAt?: string
    paidAt?: string
    paidReference?: string
  },
): InvoiceStore {
  const client = store.clients[spec.clientId]
  const content = {
    sender: {
      name: store.business.name,
      address: store.business.address,
      email: store.business.email,
    },
    recipient: {
      name: client.name,
      address: client.billingAddress,
      email: client.email,
    },
    clientId: spec.clientId,
    invoiceDate: spec.invoiceDate,
    dueDate: spec.dueDate,
    termsDays: 30,
    reference: spec.reference,
    currency: spec.currency,
    lineItems: [
      {
        description: `Services for ${spec.reference}`,
        quantity: 1,
        unitPrice: spec.amount,
        discountPercent: null,
        taxPercent: null,
      },
    ],
    notes: '',
    paymentInstructions: store.business.defaultPaymentInstructions,
    presentation: structuredClone(store.template),
  }
  const versionId = `ver_${spec.id}`
  const issued: IssuedInvoice = {
    id: spec.id,
    number: spec.number,
    numberText: spec.numberText,
    historical: false,
    createdAt: `${spec.invoiceDate}T09:00:00.000Z`,
    updatedAt: `${spec.invoiceDate}T09:00:00.000Z`,
    currentVersionId: versionId,
    versions: [
      {
        id: versionId,
        issuedAt: `${spec.invoiceDate}T09:00:00.000Z`,
        content,
      },
    ],
    history: [
      {
        id: `hist_${spec.id}`,
        at: `${spec.invoiceDate}T09:00:00.000Z`,
        kind: 'issued',
        versionId,
      },
    ],
    marks:
      spec.sentAt || spec.paidAt
        ? {
            ...(spec.sentAt ? { sentAt: spec.sentAt } : {}),
            ...(spec.paidAt ? { paidAt: spec.paidAt } : {}),
            ...(spec.paidReference ? { paidReference: spec.paidReference } : {}),
          }
        : undefined,
  }
  return {
    ...store,
    invoices: { ...store.invoices, [spec.id]: issued },
    sequence: {
      ...store.sequence,
      nextNumber: Math.max(store.sequence.nextNumber, spec.number + 1),
      reservedNumbers: [...store.sequence.reservedNumbers, spec.number].sort((a, b) => a - b),
    },
  }
}

async function makeFixture(): Promise<{
  ctx: InvoicingAgentToolContext
  handlers: ReturnType<typeof buildPureInvoicingHandlers>
  repo: InvoiceRepository
}> {
  let store = emptyStore()
  store = updateBusiness(store, {
    name: 'PureScience Studio LLC',
    address: '100 Market St, San Francisco, CA',
    email: 'billing@purescience.test',
    defaultPaymentInstructions: 'ACH to account 1234',
    defaultTermsDays: 30,
  })
  store = configureNumberFormat(store, 'INV-{YYYY}-{NNN}')
  store = configureSequence(store, 1, true, '2026-01-01T00:00:00.000Z')

  // Clients
  store = saveClient(
    store,
    {
      name: 'Acme Biotech',
      billingAddress: '500 Lab Way, Boston, MA',
      email: 'ap@acme.test',
      termsDays: 30,
      currency: 'USD',
    },
    'client_acme',
    '2026-01-02T00:00:00.000Z',
    true,
  )
  store = saveClient(
    store,
    {
      name: 'Acme Ventures',
      billingAddress: '700 Sand Hill Rd, Menlo Park, CA',
      email: 'finance@acmevc.test',
      termsDays: 14,
      currency: 'USD',
    },
    'client_acme_vc',
    '2026-01-03T00:00:00.000Z',
    true,
  )
  store = saveClient(
    store,
    {
      name: 'Nordic Research Institute',
      billingAddress: 'Storgatan 12, Stockholm',
      email: 'invoices@nordic.test',
      termsDays: 30,
      currency: 'EUR',
    },
    'client_nordic',
    '2026-01-04T00:00:00.000Z',
    true,
  )

  // Issued invoices across buckets and marks (TODAY = 2026-11-15)
  // 1. Overdue 45 days (due 2026-10-01), sent
  store = makeIssuedInvoice(store, {
    id: 'inv_1',
    number: 1,
    numberText: 'INV-2026-001',
    clientId: 'client_acme',
    invoiceDate: '2026-09-01',
    dueDate: '2026-10-01',
    currency: 'USD',
    reference: 'PO-ACME-100',
    amount: 4500,
    sentAt: '2026-09-02',
  })
  // 2. Overdue 100 days (due 2026-08-07), NOT sent
  store = makeIssuedInvoice(store, {
    id: 'inv_2',
    number: 2,
    numberText: 'INV-2026-002',
    clientId: 'client_acme',
    invoiceDate: '2026-07-08',
    dueDate: '2026-08-07',
    currency: 'USD',
    reference: 'PO-ACME-099',
    amount: 1200,
  })
  // 3. Current open (due 2026-12-05), sent
  store = makeIssuedInvoice(store, {
    id: 'inv_3',
    number: 3,
    numberText: 'INV-2026-003',
    clientId: 'client_nordic',
    invoiceDate: '2026-11-05',
    dueDate: '2026-12-05',
    currency: 'EUR',
    reference: 'NORD-2026-Q4',
    amount: 3000,
    sentAt: '2026-11-05',
  })
  // 4. Paid within 90 days, WITHOUT paidReference
  store = makeIssuedInvoice(store, {
    id: 'inv_4',
    number: 4,
    numberText: 'INV-2026-004',
    clientId: 'client_acme',
    invoiceDate: '2026-09-15',
    dueDate: '2026-10-15',
    currency: 'USD',
    reference: 'PO-ACME-101',
    amount: 2500,
    sentAt: '2026-09-15',
    paidAt: '2026-10-05',
  })

  // Incomplete draft
  store = createDraft(store, undefined, undefined, 'draft_incomplete', '2026-11-10T10:00:00.000Z', TODAY)
  store = updateDraft(store, 'draft_incomplete', { reference: 'WIP' })

  // Duplicate-looking draft matching inv_1
  store = createDraft(store, undefined, undefined, 'draft_dup', '2026-11-11T10:00:00.000Z', TODAY)
  store = updateDraft(store, 'draft_dup', {
    recipient: { name: 'Acme Biotech', address: '500 Lab Way, Boston, MA' },
    reference: 'PO-ACME-100',
    currency: 'USD',
    dueDate: '2026-12-15',
    lineItems: [{ description: 'Duplicate check', quantity: 1, unitPrice: 4500 }],
  })

  // Library document (client invoice rules)
  store = lib.addLibraryDocument(
    store,
    {
      title: 'Acme AP Guidelines',
      kind: 'invoice-rules',
      clientId: 'client_acme',
      assetId: 'asset_rules',
      fileName: 'acme-rules.txt',
      mimeType: 'text/plain',
      text: 'Always include PO-ACME-XXX in the reference line and email ap@acme.test.',
    },
    'lib_acme',
    '2026-02-01T00:00:00.000Z',
  )

  // Client SOW agreement with one done/ready milestone
  store = ag.createAgreement(
    store,
    { kind: 'sow', direction: 'client', clientId: 'client_acme', title: 'Platform Discovery SOW' },
    'ag_sow',
    '2026-08-01T00:00:00.000Z',
  )
  store = ag.updateAgreement(
    store,
    'ag_sow',
    {
      currency: 'USD',
      fee: { kind: 'fixed', amount: 10000 },
      sections: [{ heading: 'Scope', body: 'Complete architecture discovery.' }],
      milestones: [
        { id: 'ms_1', label: 'Kickoff', amount: 4000, trigger: 'signature' },
        { id: 'ms_2', label: 'Final delivery', amount: 6000, trigger: 'done' },
      ],
    },
    '2026-08-02T00:00:00.000Z',
  )
  store = ag.markSigned(
    store,
    'ag_sow',
    {
      ours: { name: 'Alice', at: '2026-08-05' },
      theirs: { name: 'Bob', at: '2026-08-05' },
    },
    '2026-08-05T00:00:00.000Z',
  )

  // Active monthly retainer with unbilled months
  store = ag.createAgreement(
    store,
    { kind: 'sow', direction: 'client', clientId: 'client_nordic', title: 'Advisory Retainer' },
    'ag_retainer',
    '2026-09-01T00:00:00.000Z',
  )
  store = ag.updateAgreement(
    store,
    'ag_retainer',
    {
      currency: 'EUR',
      fee: { kind: 'monthly', amount: 2000 },
      startDate: '2026-10-01',
      sections: [{ heading: 'Scope', body: 'Monthly research advisory.' }],
    },
    '2026-09-02T00:00:00.000Z',
  )
  store = ag.markSigned(
    store,
    'ag_retainer',
    {
      ours: { name: 'Alice', at: '2026-09-15' },
      theirs: { name: 'Sven', at: '2026-09-15' },
    },
    '2026-09-15T00:00:00.000Z',
  )

  // Contractor + agreement + over-cap unpaid bill
  store = ag.saveContractor(
    store,
    { name: 'Dana Designer', email: 'dana@studio.test', currency: 'USD' },
    'con_dana',
    true,
    '2026-08-01T00:00:00.000Z',
  )
  store = ag.createAgreement(
    store,
    { kind: 'contractor', direction: 'contractor', contractorId: 'con_dana', title: 'Design Support ICA' },
    'ag_dana',
    '2026-08-01T00:00:00.000Z',
  )
  store = ag.updateAgreement(
    store,
    'ag_dana',
    {
      currency: 'USD',
      fee: { kind: 'hourly', rate: 100, cap: 2000 },
      sections: [{ heading: 'Services', body: 'UI design support.' }],
    },
    '2026-08-02T00:00:00.000Z',
  )
  store = ag.markSigned(
    store,
    'ag_dana',
    {
      ours: { name: 'Alice', at: '2026-08-03' },
      theirs: { name: 'Dana', at: '2026-08-03' },
    },
    '2026-08-03T00:00:00.000Z',
  )
  store = ag.addBill(
    store,
    'ag_dana',
    { reference: 'DANA-10', period: '2026-10', hours: 25, amount: 2500, receivedAt: '2026-11-01' },
    '2026-11-01T00:00:00.000Z',
    TODAY,
  ).store

  // Proposals: one accepted (not converted), one offered, one incomplete draft
  store = pr.createProposal(
    store,
    {
      clientId: 'client_acme',
      details: {
        title: 'Phase 2 Analytics',
        currency: 'USD',
        items: [{ description: 'Analytics build', quantity: 1, unitPrice: 8000 }],
      },
    },
    'prop_acc',
    '2026-10-01T00:00:00.000Z',
  )
  const propAccV1 = store.proposals!.prop_acc.versions[0].id
  store = pr.setProposalStatus(store, 'prop_acc', propAccV1, 'offered', '2026-10-05T00:00:00.000Z')
  store = pr.setProposalStatus(store, 'prop_acc', propAccV1, 'accepted', '2026-10-12T00:00:00.000Z')

  store = pr.createProposal(
    store,
    {
      clientId: 'client_nordic',
      details: {
        title: 'Data Migration Offer',
        currency: 'EUR',
        items: [{ description: 'Migration', quantity: 2, unitPrice: 1500 }],
      },
    },
    'prop_off',
    '2026-11-01T00:00:00.000Z',
  )
  const propOffV1 = store.proposals!.prop_off.versions[0].id
  store = pr.setProposalStatus(store, 'prop_off', propOffV1, 'offered', '2026-11-02T00:00:00.000Z')

  store = pr.createProposal(
    store,
    { details: { title: 'Rough Enquiry' } },
    'prop_draft',
    '2026-11-12T00:00:00.000Z',
  )

  let disk = structuredClone(store)
  let version = 1
  const repo = new InvoiceRepository({
    read: async () => ({ value: structuredClone(disk), version: String(version) }),
    write: async (value, ifMatch) => {
      if (ifMatch !== String(version)) {
        return { ok: false, conflict: true, value: structuredClone(disk), version: String(version) }
      }
      disk = structuredClone(value as InvoiceStore)
      version += 1
      return { ok: true, version: String(version) }
    },
  })
  repo.setEnabled(true)
  await repo.initialize()

  const core = createInvoiceCommands(repo)
  const agreementCmds = createAgreementCommands(repo)
  const libraryCmds = createLibraryCommands(repo)
  const proposalCmds = createProposalCommands(repo, async fileName => ({
    cancelled: false,
    path: `/exports/${fileName}`,
  }))

  const atomicHandlers = createAtomicHandlers({
    ...core,
    ...agreementCmds,
    ...libraryCmds,
    ...proposalCmds,
  })

  const ctx: InvoicingAgentToolContext = {
    repository: repo,
    atomicHandlers,
    now: () => FIXED_NOW,
  }
  const handlers = buildPureInvoicingHandlers(() => ctx)
  return { ctx, handlers, repo }
}

describe('PureInvoicing Operations Registry (Functions + Core + Extended Escape Hatch)', () => {
  it('syncs plugin.json 1:1 with PUREINVOICING_OPERATIONS_REGISTRY.manifestTools and cuts exposed tools by >=60%', async () => {
    const manifest = (await import('../../plugin.json', { with: { type: 'json' } }))
      .default as {
      app: {
        agents: {
          tools: Array<{
            name: string
            risk?: string
            requiresApproval?: boolean
            description?: string
          }>
        }
      }
    }

    expect(manifest.app.agents.tools).toEqual([
      ...PUREINVOICING_OPERATIONS_REGISTRY.manifestTools,
    ])
    expect([...APP_AGENT_TOOL_NAMES]).toEqual([
      ...PUREINVOICING_OPERATIONS_REGISTRY.exposedToolNames,
    ])
    expect([...PUREINVOICING_EXTENDED_TOOL_NAMES].sort()).toEqual(
      [...PUREINVOICING_OPERATIONS_REGISTRY.extendedToolNames].sort(),
    )
    expect([...PUREINVOICING_ALL_ATOMIC_TOOL_NAMES].sort()).toEqual(
      [...PUREINVOICING_OPERATIONS_REGISTRY.allAtomicToolNames].sort(),
    )

    const summary = PUREINVOICING_OPERATIONS_REGISTRY.auditSummary()
    expect(summary.functions).toBe(PUREINVOICING_FUNCTION_NAMES.length)
    expect(summary.coreTools).toBe(PUREINVOICING_CORE_TOOL_NAMES.length)
    expect(summary.extendedTools).toBe(PUREINVOICING_EXTENDED_TOOL_NAMES.length)
    expect(summary.metaTools).toBe(3)
    expect(summary.totalExposed).toBe(25)
    expect(summary.totalAtomicTools).toBe(71)
    expect(summary.schemaReductionPercent).toBeGreaterThanOrEqual(60)

    // Verify every single atomic tool schema matches domainSchemas losslessly
    expect(PUREINVOICING_ATOMIC_TOOL_SCHEMAS.length).toBe(Object.keys(domainSchemas).length)
    for (const spec of PUREINVOICING_ATOMIC_TOOL_SCHEMAS) {
      expect(spec.inputSchema).toEqual((domainSchemas as Record<string, unknown>)[spec.name])
    }

    // Verify manifest-level check-manifests invariants on every exposed tool
    const releaseVerbs = new Set(['send', 'merge', 'publish', 'deposit', 'deploy', 'post'])
    for (const tool of manifest.app.agents.tools) {
      expect(['read', 'write', 'destructive', 'external', 'release']).toContain(tool.risk)
      expect(typeof tool.requiresApproval).toBe('boolean')
      expect((tool.description ?? '').trim().length).toBeGreaterThanOrEqual(80)
      const firstDescWord = (tool.description ?? '')
        .trim()
        .split(/[^A-Za-z]+/)
        .find(Boolean)
        ?.toLowerCase()
      if (tool.risk !== 'release') {
        expect(releaseVerbs.has(firstDescWord ?? '')).toBe(false)
      }
    }
  })

  it('executes all 8 composite fn_* functions end-to-end against real invoicing data', async () => {
    const { handlers, repo } = await makeFixture()

    // 1. fn_receivablesBriefing
    const briefing = JSON.parse(
      (await handlers.fn_receivablesBriefing(invoke('fn_receivablesBriefing', { limit: 5 }))).content,
    )
    expect(briefing.ok).toBe(true)
    expect(briefing.opClass).toBe('function')
    expect(briefing.data.setup.readyToIssue).toBe(true)
    expect(briefing.data.overdueTotal).toBe(2)
    expect(briefing.data.overdue[0].numberText).toBe('INV-2026-002')
    expect(briefing.data.awaitingPaymentTotal).toBe(1)
    expect(briefing.data.pipeline.readyMilestoneTotal).toBe(1)
    expect(briefing.data.pipeline.unbilledRetainerTotal).toBe(1)
    expect(briefing.data.pipeline.openProposals.length).toBe(3)

    // 2. fn_clientBillingDossier (exact ID + ambiguous query)
    const dossier = JSON.parse(
      (await handlers.fn_clientBillingDossier(invoke('fn_clientBillingDossier', { clientId: 'client_acme' }))).content,
    )
    expect(dossier.ok).toBe(true)
    expect(dossier.data.matched).toBe(true)
    expect(dossier.data.client.name).toBe('Acme Biotech')
    expect(dossier.data.overdue.length).toBe(2)
    expect(dossier.data.paidTotal).toBe(1)
    expect(dossier.data.averageDaysToPay).toBe(20)
    expect(dossier.data.agreements.length).toBe(1)
    expect(dossier.data.libraryDocuments[0].excerpt.text).toContain('PO-ACME-XXX')

    const ambiguous = JSON.parse(
      (await handlers.fn_clientBillingDossier(invoke('fn_clientBillingDossier', { query: 'Acme' }))).content,
    )
    expect(ambiguous.ok).toBe(true)
    expect(ambiguous.data.ambiguous).toBe(true)
    expect(ambiguous.data.candidates.length).toBe(2)

    // 3. fn_agingAndCashflowReport
    const aging = JSON.parse(
      (await handlers.fn_agingAndCashflowReport(invoke('fn_agingAndCashflowReport', { asOfDate: TODAY }))).content,
    )
    expect(aging.ok).toBe(true)
    const usd = aging.data.currencies.find((c: { currency: string }) => c.currency === 'USD')
    expect(usd.totalOutstanding).toBe('5700.00')
    expect(usd.totalOverdue).toBe('5700.00')
    expect(usd.agingBuckets.days_31_60.total).toBe('4500.00')
    expect(usd.agingBuckets.days_90_plus.total).toBe('1200.00')
    expect(usd.recentCollections.collectedTotal).toBe('2500.00')
    expect(usd.recentCollections.averageDaysToPay).toBe(20)

    // 4. fn_buildClientInvoiceDraft
    const built = JSON.parse(
      (
        await handlers.fn_buildClientInvoiceDraft(
          invoke('fn_buildClientInvoiceDraft', {
            clientQuery: 'Nordic Research',
            reference: 'NORD-2026-EXTRA',
            lineItems: [{ description: 'Workshop day', quantity: 2, unitPrice: 1250 }],
          }),
        )
      ).content,
    )
    expect(built.ok).toBe(true)
    expect(built.data.draft.recipient).toBe('Nordic Research Institute')
    expect(built.data.draft.currency).toBe('EUR')
    expect(built.data.draft.totals.total).toBe('2500.00')
    expect(built.data.readyToPrepareFinalization).toBe(true)
    expect(built.data.note).toMatch(/Not issued|unnumbered draft/i)
    const savedStore = await repo.current()
    expect(savedStore.drafts[built.data.draft.id]).toBeDefined()

    // 5. fn_auditInvoiceReadiness
    const auditIncomplete = JSON.parse(
      (await handlers.fn_auditInvoiceReadiness(invoke('fn_auditInvoiceReadiness', { draftId: 'draft_incomplete' }))).content,
    )
    expect(auditIncomplete.ok).toBe(true)
    expect(auditIncomplete.data.readyForPrepare).toBe(false)
    expect(auditIncomplete.data.blockingIssues.length).toBeGreaterThan(0)

    const auditDup = JSON.parse(
      (await handlers.fn_auditInvoiceReadiness(invoke('fn_auditInvoiceReadiness', { draftId: 'draft_dup' }))).content,
    )
    expect(auditDup.ok).toBe(true)
    expect(auditDup.data.readyForPrepare).toBe(true)
    expect(auditDup.data.potentialDuplicates.length).toBe(1)
    expect(auditDup.data.potentialDuplicates[0].numberText).toBe('INV-2026-001')

    // 6. fn_reconcilePaymentsAudit
    const reconcile = JSON.parse(
      (
        await handlers.fn_reconcilePaymentsAudit(
          invoke('fn_reconcilePaymentsAudit', {
            payments: [{ amount: 4500, currency: 'USD', reference: 'INV-2026-001' }],
          }),
        )
      ).content,
    )
    expect(reconcile.ok).toBe(true)
    expect(reconcile.data.issuedNotSent.map((x: { id: string }) => x.id)).toEqual(['inv_2'])
    expect(reconcile.data.sentOverdue.map((x: { id: string }) => x.id)).toEqual(['inv_1'])
    expect(reconcile.data.paidWithoutReference.map((x: { id: string }) => x.id)).toEqual(['inv_4'])
    expect(reconcile.data.paymentMatches[0].candidates[0].invoiceId).toBe('inv_1')
    expect(reconcile.data.unpaidContractorBills.length).toBe(1)
    expect(reconcile.data.flaggedContractorBills.length).toBe(1)

    // 7. fn_agreementsBillingSummary
    const agreements = JSON.parse(
      (await handlers.fn_agreementsBillingSummary(invoke('fn_agreementsBillingSummary'))).content,
    )
    expect(agreements.ok).toBe(true)
    expect(agreements.data.count).toBe(3)
    expect(agreements.data.readyMilestones.length).toBe(1)
    expect(agreements.data.readyMilestones[0].label).toBe('Kickoff')
    expect(agreements.data.unbilledRetainers.length).toBe(1)
    expect(agreements.data.unbilledRetainers[0].unbilledPeriods).toContain('2026-10')
    expect(agreements.data.contractorBillWarnings.length).toBe(1)

    // 8. fn_proposalsPipelineOverview
    const pipeline = JSON.parse(
      (await handlers.fn_proposalsPipelineOverview(invoke('fn_proposalsPipelineOverview'))).content,
    )
    expect(pipeline.ok).toBe(true)
    expect(pipeline.data.totalCount).toBe(3)
    expect(pipeline.data.stageCounts).toEqual({ draft: 1, offered: 1, accepted: 1, declined: 0 })
    expect(pipeline.data.acceptedNotYetInvoiced.length).toBe(1)
    expect(pipeline.data.acceptedNotYetInvoiced[0].proposalId).toBe('prop_acc')
    expect(pipeline.data.awaitingDecision.length).toBe(1)
    expect(pipeline.data.incompleteDrafts.length).toBe(1)
  })

  it('discovers and routes extended tools safely via discoverAppTools, callExtendedReadTool, and callExtendedTool', async () => {
    const { handlers, repo } = await makeFixture()

    // Discovery by query + exact schema inspection
    const discovered = JSON.parse(
      (await handlers.discoverAppTools(invoke('discoverAppTools', { query: 'contractor' }))).content,
    )
    expect(discovered.appSlug).toBe('invoicing')
    expect(discovered.operations.some((op: { name: string }) => op.name === 'searchContractors')).toBe(true)

    const described = JSON.parse(
      (await handlers.discoverAppTools(invoke('discoverAppTools', { names: ['discardInvoiceDraft', 'searchContractors'] }))).content,
    )
    expect(described.mode).toBe('describe')
    const discardInfo = described.operations.find((op: { name: string }) => op.name === 'discardInvoiceDraft')
    expect(discardInfo.invokeVia).toBe('callExtendedTool')
    expect(discardInfo.requiresConfirmDestructive).toBe(true)
    expect(discardInfo.inputSchema.type).toBe('object')

    // Read-only extended tool succeeds via callExtendedReadTool
    const contractorsRes = JSON.parse(
      (
        await handlers.callExtendedReadTool(
          invoke('callExtendedReadTool', { tool: 'searchContractors', arguments: { query: 'Dana' } }),
        )
      ).content,
    )
    expect(contractorsRes.contractors.length).toBe(1)
    expect(contractorsRes.contractors[0].name).toBe('Dana Designer')

    // Refusals on callExtendedReadTool: direct core tool & mutating extended tool
    await expect(
      handlers.callExtendedReadTool(invoke('callExtendedReadTool', { tool: 'getWorkspaceState' })),
    ).rejects.toThrow(/already directly exposed/i)
    await expect(
      handlers.callExtendedReadTool(invoke('callExtendedReadTool', { tool: 'addInvoiceNote' })),
    ).rejects.toThrow(/cannot run through callExtendedReadTool/i)

    // Mutating extended tool succeeds via callExtendedTool
    const noteRes = JSON.parse(
      (
        await handlers.callExtendedTool(
          invoke('callExtendedTool', {
            tool: 'addInvoiceNote',
            arguments: { invoiceId: 'inv_1', text: 'Called AP about wire date' },
          }),
        )
      ).content,
    )
    expect(noteRes.note.text).toBe('Called AP about wire date')

    // Refusals on callExtendedTool: read-only tool, direct core tool, destructive without confirmDestructive
    await expect(
      handlers.callExtendedTool(invoke('callExtendedTool', { tool: 'searchContractors' })),
    ).rejects.toThrow(/read-only/i)
    await expect(
      handlers.callExtendedTool(invoke('callExtendedTool', { tool: 'finalizeInvoice' })),
    ).rejects.toThrow(/already directly exposed/i)
    await expect(
      handlers.callExtendedTool(
        invoke('callExtendedTool', {
          tool: 'discardInvoiceDraft',
          arguments: { draftId: 'draft_incomplete' },
        }),
      ),
    ).rejects.toThrow(/confirmDestructive: true/i)

    // Destructive extended tool succeeds when confirmDestructive: true is supplied
    const discarded = JSON.parse(
      (
        await handlers.callExtendedTool(
          invoke('callExtendedTool', {
            tool: 'discardInvoiceDraft',
            arguments: { draftId: 'draft_incomplete' },
            confirmDestructive: true,
          }),
        )
      ).content,
    )
    expect(discarded.removedDraftId).toBe('draft_incomplete')
    expect((await repo.current()).drafts.draft_incomplete).toBeUndefined()
  })
})
