import {
  defineAppFunction,
  type AppFunctionDefinition,
} from '@purescience/platform-ui/bridge/appFunctions'
import {
  agreementBilling,
  agreementChecks,
  billCheck,
  partyName,
  unbilledPeriods,
} from '../lib/invoices/agreements'
import { openNotes } from '../lib/invoices/annotations'
import { calculateInvoice, validDate } from '../lib/invoices/calculations'
import { localToday, newId, supportedCurrencies } from '../lib/invoices/defaults'
import { libraryExcerpt, libraryRows } from '../lib/invoices/library'
import { invoiceStanding } from '../lib/invoices/lifecycle'
import { sumMoney } from '../lib/invoices/money'
import {
  calculateProposal,
  conversionTarget,
  getProposalVersion,
  latestVersion,
  proposalRows,
  proposalStatus,
} from '../lib/invoices/proposals'
import { invoiceDetails, workspaceState } from '../lib/invoices/queries'
import { archiveStats } from '../lib/invoices/stats'
import type {
  AgreementDirection,
  AgreementStatus,
  ContentPatch,
  InvoiceStore,
  LineItem,
  ProposalStatus,
} from '../lib/invoices/types'
import {
  applyDefaults,
  createDraft,
  getVersion,
  issuedLabel,
  provisionalLabel,
  updateDraft,
} from '../lib/invoices/updates'
import type { InvoicingAgentToolContext } from './catalog'
import { draftReply } from './replies'

function todayOf(ctx: InvoicingAgentToolContext): string {
  return localToday(ctx.now ? ctx.now() : new Date())
}

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

function daysBetween(from: string, to: string): number {
  const parse = (v: string) => {
    const [y, m, d] = v.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }
  return Math.round((parse(to) - parse(from)) / 86_400_000)
}

function dayMinus(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return localToday(new Date(y, m - 1, d - days))
}

function clientRulesExcerpts(
  store: InvoiceStore,
  clientId: string | undefined,
  includeExcerpts: boolean,
) {
  const docs = libraryRows(store, clientId ? { clientId } : {})
  return docs.map(doc => ({
    id: doc.id,
    title: doc.title,
    kind: doc.kind,
    clientSpecific: Boolean(doc.clientId),
    notes: doc.notes ?? null,
    ...(includeExcerpts && doc.kind === 'invoice-rules'
      ? { excerpt: libraryExcerpt(doc, 1500) }
      : {}),
  }))
}

export const PUREINVOICING_FUNCTIONS: readonly AppFunctionDefinition<InvoicingAgentToolContext>[] = [
  // ── 1. fn_receivablesBriefing ──────────────────────────────────────────
  defineAppFunction<InvoicingAgentToolContext>({
    name: 'fn_receivablesBriefing',
    category: 'briefing',
    risk: 'read',
    requiresApproval: false,
    replaces: [
      'getWorkspaceState',
      'searchInvoices',
      'listAgreements',
      'listProposals',
    ],
    description:
      'Compile a one-shot accounts receivable and billing briefing across the workspace. Replaces calling getWorkspaceState plus multiple searchInvoices, listAgreements, and listProposals calls. Returns setup readiness, next invoice label, YTD and all-time totals by currency, overdue and open invoices prioritized by days overdue, unissued drafts and corrections, unbilled agreement milestones or retainer months, and open proposals.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Maximum rows per section (overdue, open, drafts, pipeline). Default 10.',
        },
        includeDrafts: {
          type: 'boolean',
          description: 'Include unissued drafts and correction drafts (default true).',
        },
        includePipeline: {
          type: 'boolean',
          description: 'Include ready-to-bill agreement milestones, unbilled retainer months, and open proposals (default true).',
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const store = await ctx.repository.current()
      const today = todayOf(ctx)
      const limit = clampInt(args.limit, 10, 1, 50)
      const includeDrafts = args.includeDrafts !== false
      const includePipeline = args.includePipeline !== false

      const ws = workspaceState(store)
      const stats = archiveStats(store, today)

      const overdue: Array<Record<string, unknown>> = []
      const awaitingPayment: Array<Record<string, unknown>> = []

      for (const invoice of Object.values(store.invoices)) {
        const version = getVersion(store, invoice.id)
        const standing = invoiceStanding(invoice, today)
        if (standing.mark === 'paid') continue
        const calc = calculateInvoice(version.content)
        const row = {
          id: invoice.id,
          numberText: issuedLabel(store, invoice),
          clientId: version.content.clientId ?? null,
          recipient: version.content.recipient.name,
          invoiceDate: version.content.invoiceDate,
          dueDate: standing.dueDate,
          standing: standing.mark,
          daysOverdue: standing.daysOverdue,
          daysUntilDue: standing.daysUntilDue,
          currency: version.content.currency,
          total: calc.total,
          sentAt: invoice.marks?.sentAt ?? null,
          openNoteCount: openNotes(invoice).length,
        }
        if (standing.mark === 'overdue') overdue.push(row)
        else awaitingPayment.push(row)
      }

      overdue.sort(
        (a, b) =>
          (b.daysOverdue as number) - (a.daysOverdue as number) ||
          String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999')),
      )
      awaitingPayment.sort((a, b) =>
        String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999')),
      )

      const drafts = includeDrafts
        ? Object.values(store.drafts)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, limit)
            .map(d => {
              const calc = calculateInvoice(d.content, d.currencyReviewRequired)
              return {
                id: d.id,
                kind: d.correctionOf ? 'correction' : 'draft',
                correctionOf: d.correctionOf ?? null,
                provisionalNumberText: d.correctionOf
                  ? issuedLabel(store, store.invoices[d.correctionOf])
                  : provisionalLabel(store, d.content.invoiceDate),
                recipient: d.content.recipient.name,
                currency: d.content.currency,
                total: calc.total,
                complete: calc.complete,
                diagnosticCount: calc.diagnostics.length,
                updatedAt: d.updatedAt,
              }
            })
        : []

      let pipeline: Record<string, unknown> | undefined
      if (includePipeline) {
        const readyMilestones: Array<Record<string, unknown>> = []
        const unbilledRetainers: Array<Record<string, unknown>> = []
        for (const a of Object.values(store.agreements ?? {})) {
          if (a.direction !== 'client') continue
          if (a.status === 'signed' || a.status === 'complete') {
            for (const m of a.milestones) {
              if (!m.invoiceId && m.doneAt && m.trigger !== 'period') {
                readyMilestones.push({
                  agreementId: a.id,
                  agreementNumber: a.numberText ?? null,
                  agreementTitle: a.title,
                  client: partyName(store, a),
                  milestoneId: m.id,
                  label: m.label,
                  doneAt: m.doneAt,
                  amount: sumMoney([String(m.amount)], a.currency),
                  currency: a.currency,
                })
              }
            }
          }
          const periods = unbilledPeriods(a, today)
          if (periods.length) {
            unbilledRetainers.push({
              agreementId: a.id,
              agreementNumber: a.numberText ?? null,
              agreementTitle: a.title,
              client: partyName(store, a),
              monthlyAmount:
                a.fee.amount !== undefined
                  ? sumMoney([String(a.fee.amount)], a.currency)
                  : null,
              currency: a.currency,
              unbilledPeriods: periods,
            })
          }
        }
        const openProposals = proposalRows(store)
          .filter(p => p.status === 'draft' || p.status === 'offered' || (p.status === 'accepted' && (!p.invoice || p.invoice.status === 'missing')))
          .slice(0, limit)

        pipeline = {
          readyMilestones: readyMilestones.slice(0, limit),
          readyMilestoneTotal: readyMilestones.length,
          unbilledRetainers: unbilledRetainers.slice(0, limit),
          unbilledRetainerTotal: unbilledRetainers.length,
          openProposals,
        }
      }

      const summary = `AR briefing (${today}): ${stats.counts.overdue} overdue, ${stats.counts.awaiting} open, ${stats.counts.drafts} drafts, ${stats.counts.paid} paid.`
      return {
        summary,
        mutated: false,
        data: {
          asOf: today,
          setup: ws.setup,
          nextNumberText: ws.sequence.nextNumberText,
          counts: stats.counts,
          ytdByCurrency: stats.byCurrency,
          allTimeByCurrency: stats.allTime,
          overdueTotal: overdue.length,
          overdue: overdue.slice(0, limit),
          awaitingPaymentTotal: awaitingPayment.length,
          awaitingPayment: awaitingPayment.slice(0, limit),
          ...(includeDrafts ? { drafts } : {}),
          ...(pipeline ? { pipeline } : {}),
        },
      }
    },
  }),

  // ── 2. fn_clientBillingDossier ─────────────────────────────────────────
  defineAppFunction<InvoicingAgentToolContext>({
    name: 'fn_clientBillingDossier',
    category: 'clients',
    risk: 'read',
    requiresApproval: false,
    replaces: [
      'searchClients',
      'searchInvoices',
      'listAgreements',
      'listProposals',
      'listLibrary',
      'readLibraryDocument',
    ],
    description:
      'Compile a complete billing dossier for one client in a single call. Replaces calling searchClients, searchInvoices, listAgreements, listProposals, listLibrary, and readLibraryDocument. Returns client profile and billing defaults, lifetime and YTD totals, average days to pay, overdue/open/draft/recent paid invoices, active agreements with unbilled milestones, proposals, and any client-specific invoicing rules from the library.',
    inputSchema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description: 'Exact client ID if known.',
        },
        query: {
          type: 'string',
          description: 'Client name, contact name, or email fragment when clientId is not known.',
        },
        invoiceLimit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Maximum recent paid invoices to return (default 15).',
        },
        includeRuleExcerpts: {
          type: 'boolean',
          description: 'Include text excerpts of client invoice-rules library documents (default true).',
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const store = await ctx.repository.current()
      const today = todayOf(ctx)
      const clientIdArg = optionalString(args.clientId)
      const query = optionalString(args.query)
      const invoiceLimit = clampInt(args.invoiceLimit, 15, 1, 50)
      const includeRuleExcerpts = args.includeRuleExcerpts !== false

      if (!clientIdArg && !query) {
        throw new Error('Provide either "clientId" or "query" to identify the client.')
      }

      let client = clientIdArg ? store.clients[clientIdArg] : undefined
      if (clientIdArg && !client) {
        throw new Error(`Client "${clientIdArg}" not found. Call searchClients to list available clients.`)
      }

      let fallbackName: string | undefined
      if (!client && query) {
        const needle = query.toLocaleLowerCase()
        const exact = Object.values(store.clients).filter(
          c =>
            c.name.trim().toLocaleLowerCase() === needle ||
            (c.email ?? '').trim().toLocaleLowerCase() === needle,
        )
        const matches = exact.length
          ? exact
          : Object.values(store.clients).filter(c =>
              [c.name, c.contactName ?? '', c.email ?? '', c.billingAddress].some(v =>
                v.toLocaleLowerCase().includes(needle),
              ),
            )
        if (matches.length > 1) {
          return {
            summary: `Multiple clients match "${query}" (${matches.length} candidates).`,
            mutated: false,
            data: {
              matched: false,
              ambiguous: true,
              candidates: matches.map(c => ({
                id: c.id,
                name: c.name,
                email: c.email ?? null,
                currency: c.currency ?? null,
              })),
            },
          }
        }
        if (matches.length === 1) {
          client = matches[0]
        } else {
          fallbackName = query
        }
      }

      const targetClientId = client?.id
      const nameNeedle = (client?.name ?? fallbackName ?? '').trim().toLocaleLowerCase()
      const matchesInvoiceRecipient = (cid: string | undefined, recipientName: string) =>
        targetClientId
          ? cid === targetClientId || recipientName.trim().toLocaleLowerCase() === nameNeedle
          : recipientName.trim().toLocaleLowerCase().includes(nameNeedle)

      const overdue: Array<Record<string, unknown>> = []
      const open: Array<Record<string, unknown>> = []
      const paid: Array<Record<string, unknown>> = []
      const totalsByCurrency = new Map<
        string,
        { invoiced: string[]; collected: string[]; outstanding: string[]; overdue: string[] }
      >()

      for (const inv of Object.values(store.invoices)) {
        const version = getVersion(store, inv.id)
        if (!matchesInvoiceRecipient(version.content.clientId, version.content.recipient.name)) {
          continue
        }
        const standing = invoiceStanding(inv, today)
        const calc = calculateInvoice(version.content)
        const currency = version.content.currency ?? ''
        const bucket = totalsByCurrency.get(currency) ?? {
          invoiced: [],
          collected: [],
          outstanding: [],
          overdue: [],
        }
        bucket.invoiced.push(calc.total)
        if (standing.mark === 'paid') bucket.collected.push(calc.total)
        else {
          bucket.outstanding.push(calc.total)
          if (standing.mark === 'overdue') bucket.overdue.push(calc.total)
        }
        totalsByCurrency.set(currency, bucket)

        const item = {
          id: inv.id,
          numberText: issuedLabel(store, inv),
          invoiceDate: version.content.invoiceDate,
          dueDate: standing.dueDate,
          standing: standing.mark,
          daysOverdue: standing.daysOverdue,
          currency: version.content.currency,
          total: calc.total,
          reference: version.content.reference,
          sentAt: inv.marks?.sentAt ?? null,
          paidAt: inv.marks?.paidAt ?? null,
          paidReference: inv.marks?.paidReference ?? null,
        }
        if (standing.mark === 'overdue') overdue.push(item)
        else if (standing.mark === 'paid') paid.push(item)
        else open.push(item)
      }

      overdue.sort((a, b) => (b.daysOverdue as number) - (a.daysOverdue as number))
      open.sort((a, b) => String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999')))
      paid.sort((a, b) => String(b.paidAt ?? '').localeCompare(String(a.paidAt ?? '')))

      const drafts = Object.values(store.drafts)
        .filter(d => matchesInvoiceRecipient(d.content.clientId, d.content.recipient.name))
        .map(d => {
          const calc = calculateInvoice(d.content, d.currencyReviewRequired)
          return {
            id: d.id,
            kind: d.correctionOf ? 'correction' : 'draft',
            correctionOf: d.correctionOf ?? null,
            provisionalNumberText: d.correctionOf
              ? issuedLabel(store, store.invoices[d.correctionOf])
              : provisionalLabel(store, d.content.invoiceDate),
            currency: d.content.currency,
            total: calc.total,
            complete: calc.complete,
            updatedAt: d.updatedAt,
          }
        })

      const agreements = targetClientId
        ? Object.values(store.agreements ?? {})
            .filter(a => a.clientId === targetClientId)
            .map(a => {
              const billing = a.direction === 'client' ? agreementBilling(store, a) : null
              return {
                id: a.id,
                kind: a.kind,
                numberText: a.numberText ?? null,
                title: a.title,
                status: a.status,
                currency: a.currency,
                fee: a.fee,
                billing: billing
                  ? {
                      agreed: billing.agreed,
                      invoiced: billing.invoiced,
                      paid: billing.paid,
                      toBill: billing.toBill,
                    }
                  : null,
                readyMilestones: a.milestones
                  .filter(m => !m.invoiceId && m.doneAt && m.trigger !== 'period')
                  .map(m => ({ id: m.id, label: m.label, amount: m.amount, doneAt: m.doneAt })),
                unbilledPeriods: unbilledPeriods(a, today),
              }
            })
        : []

      const proposals = proposalRows(store).filter(p =>
        targetClientId
          ? p.clientId === targetClientId
          : p.customer.trim().toLocaleLowerCase().includes(nameNeedle),
      )

      const stats = archiveStats(store, today)
      const clientStat = stats.clients.find(c =>
        targetClientId ? c.clientId === targetClientId : c.name.trim().toLocaleLowerCase().includes(nameNeedle),
      )

      const currencyTotals = [...totalsByCurrency.entries()].map(([currency, row]) => ({
        currency,
        invoiced: sumMoney(row.invoiced, currency),
        collected: sumMoney(row.collected, currency),
        outstanding: sumMoney(row.outstanding, currency),
        overdue: sumMoney(row.overdue, currency),
      }))

      const label = client?.name ?? fallbackName ?? 'Unknown client'
      const foundAny =
        Boolean(client) ||
        overdue.length > 0 ||
        open.length > 0 ||
        paid.length > 0 ||
        drafts.length > 0 ||
        proposals.length > 0

      return {
        summary: foundAny
          ? `Client dossier for ${label}: ${overdue.length} overdue, ${open.length} open, ${paid.length} paid, ${drafts.length} drafts, ${agreements.length} agreements.`
          : `No client or billing history found matching "${label}".`,
        mutated: false,
        data: {
          matched: foundAny,
          client: client ?? null,
          averageDaysToPay: clientStat?.averageDaysToPay ?? null,
          lastIssuedAt: clientStat?.lastIssuedAt ?? null,
          totalsByCurrency: currencyTotals,
          overdue,
          open,
          drafts,
          recentPaid: paid.slice(0, invoiceLimit),
          paidTotal: paid.length,
          agreements,
          proposals,
          libraryDocuments: clientRulesExcerpts(store, targetClientId, includeRuleExcerpts),
        },
      }
    },
  }),

  // ── 3. fn_agingAndCashflowReport ───────────────────────────────────────
  defineAppFunction<InvoicingAgentToolContext>({
    name: 'fn_agingAndCashflowReport',
    category: 'reporting',
    risk: 'read',
    requiresApproval: false,
    replaces: ['getWorkspaceState', 'searchInvoices', 'getInvoice'],
    description:
      'Analyze accounts receivable aging buckets and recent cash collection across all issued invoices by currency. Replaces calling getWorkspaceState and paging through searchInvoices and getInvoice. Groups unpaid balances into current, 1-30, 31-60, 61-90, and 90+ days overdue buckets using exact currency rounding, computes collection velocity and recent paid totals, and ranks top overdue debtors.',
    inputSchema: {
      type: 'object',
      properties: {
        asOfDate: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: 'ISO date (YYYY-MM-DD) for aging calculations. Defaults to local today.',
        },
        currency: {
          type: 'string',
          pattern: '^[A-Z]{3}$',
          description: 'Optional ISO 4217 currency filter (e.g. USD, EUR).',
        },
        paidWindowDays: {
          type: 'integer',
          minimum: 1,
          maximum: 365,
          description: 'Lookback window in days for recent cash collections (default 90).',
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const store = await ctx.repository.current()
      const asOf = optionalString(args.asOfDate) ?? todayOf(ctx)
      if (!validDate(asOf)) {
        throw new Error('asOfDate must be a valid ISO date (YYYY-MM-DD).')
      }
      const currencyFilter = optionalString(args.currency)
      const paidWindowDays = clampInt(args.paidWindowDays, 90, 1, 365)
      const paidSince = dayMinus(asOf, paidWindowDays)

      type BucketKey = 'current' | 'days_1_30' | 'days_31_60' | 'days_61_90' | 'days_90_plus'
      type CurrencyState = {
        buckets: Record<BucketKey, { amounts: string[]; labels: string[] }>
        recentPaidAmounts: string[]
        recentPaidCount: number
        paidDays: number[]
        debtors: Map<string, { name: string; clientId: string | null; outstanding: string[]; overdue: string[]; maxDaysOverdue: number; openCount: number }>
      }

      const emptyBuckets = (): Record<BucketKey, { amounts: string[]; labels: string[] }> => ({
        current: { amounts: [], labels: [] },
        days_1_30: { amounts: [], labels: [] },
        days_31_60: { amounts: [], labels: [] },
        days_61_90: { amounts: [], labels: [] },
        days_90_plus: { amounts: [], labels: [] },
      })

      const perCurrency = new Map<string, CurrencyState>()
      const getState = (cur: string): CurrencyState => {
        let s = perCurrency.get(cur)
        if (!s) {
          s = {
            buckets: emptyBuckets(),
            recentPaidAmounts: [],
            recentPaidCount: 0,
            paidDays: [],
            debtors: new Map(),
          }
          perCurrency.set(cur, s)
        }
        return s
      }

      for (const inv of Object.values(store.invoices)) {
        const version = getVersion(store, inv.id)
        const content = version.content
        const cur = content.currency ?? 'UNSPECIFIED'
        if (currencyFilter && cur !== currencyFilter) continue

        const state = getState(cur)
        const total = calculateInvoice(content).total
        const standing = invoiceStanding(inv, asOf)
        const label = issuedLabel(store, inv)

        if (standing.mark === 'paid') {
          if (inv.marks?.paidAt && inv.marks.paidAt >= paidSince && inv.marks.paidAt <= asOf) {
            state.recentPaidAmounts.push(total)
            state.recentPaidCount += 1
          }
          if (inv.marks?.paidAt && content.invoiceDate) {
            state.paidDays.push(daysBetween(content.invoiceDate, inv.marks.paidAt))
          }
          continue
        }

        let key: BucketKey = 'current'
        if (standing.daysOverdue > 90) key = 'days_90_plus'
        else if (standing.daysOverdue > 60) key = 'days_61_90'
        else if (standing.daysOverdue > 30) key = 'days_31_60'
        else if (standing.daysOverdue > 0) key = 'days_1_30'

        state.buckets[key].amounts.push(total)
        state.buckets[key].labels.push(label)

        const debtorKey = content.clientId ?? `name:${content.recipient.name.trim().toLocaleLowerCase()}`
        const debtor = state.debtors.get(debtorKey) ?? {
          name: (content.clientId ? store.clients[content.clientId]?.name : undefined) ?? content.recipient.name,
          clientId: content.clientId ?? null,
          outstanding: [],
          overdue: [],
          maxDaysOverdue: 0,
          openCount: 0,
        }
        debtor.outstanding.push(total)
        debtor.openCount += 1
        if (standing.daysOverdue > 0) {
          debtor.overdue.push(total)
          debtor.maxDaysOverdue = Math.max(debtor.maxDaysOverdue, standing.daysOverdue)
        }
        state.debtors.set(debtorKey, debtor)
      }

      const currencies = [...perCurrency.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, state]) => {
          const allOpen = (Object.values(state.buckets) as Array<{ amounts: string[] }>).flatMap(b => b.amounts)
          const allOverdue = [
            ...state.buckets.days_1_30.amounts,
            ...state.buckets.days_31_60.amounts,
            ...state.buckets.days_61_90.amounts,
            ...state.buckets.days_90_plus.amounts,
          ]
          const bucketSummary = Object.fromEntries(
            (Object.entries(state.buckets) as Array<[BucketKey, { amounts: string[]; labels: string[] }]>).map(
              ([k, b]) => [
                k,
                {
                  count: b.amounts.length,
                  total: sumMoney(b.amounts, currency),
                  sampleInvoices: b.labels.slice(0, 10),
                },
              ],
            ),
          )
          const topDebtors = [...state.debtors.values()]
            .map(d => ({
              name: d.name,
              clientId: d.clientId,
              openCount: d.openCount,
              outstanding: sumMoney(d.outstanding, currency),
              overdue: sumMoney(d.overdue, currency),
              maxDaysOverdue: d.maxDaysOverdue,
            }))
            .sort(
              (a, b) =>
                Number(b.overdue) - Number(a.overdue) ||
                Number(b.outstanding) - Number(a.outstanding),
            )
            .slice(0, 10)

          return {
            currency,
            totalOutstanding: sumMoney(allOpen, currency),
            totalOverdue: sumMoney(allOverdue, currency),
            openInvoiceCount: allOpen.length,
            agingBuckets: bucketSummary,
            recentCollections: {
              windowDays: paidWindowDays,
              since: paidSince,
              paidCount: state.recentPaidCount,
              collectedTotal: sumMoney(state.recentPaidAmounts, currency),
              averageDaysToPay: state.paidDays.length
                ? Math.round(state.paidDays.reduce((a, b) => a + b, 0) / state.paidDays.length)
                : null,
            },
            topDebtors,
          }
        })

      return {
        summary: `Aging & cashflow report as of ${asOf} across ${currencies.length} currenc${currencies.length === 1 ? 'y' : 'ies'} (${paidWindowDays}-day collection window).`,
        mutated: false,
        data: {
          asOfDate: asOf,
          paidWindowDays,
          currencies,
        },
      }
    },
  }),

  // ── 4. fn_buildClientInvoiceDraft ──────────────────────────────────────
  defineAppFunction<InvoicingAgentToolContext>({
    name: 'fn_buildClientInvoiceDraft',
    category: 'invoices',
    risk: 'write',
    requiresApproval: true,
    replaces: [
      'searchClients',
      'listLibrary',
      'createInvoiceDraft',
      'applyDefaultsToDraft',
      'updateInvoiceDraft',
    ],
    description:
      'Prepare a complete, saved invoice draft for a client in one transaction. Replaces searchClients, createInvoiceDraft, applyDefaultsToDraft, and updateInvoiceDraft (or cloning a prior invoice). Resolves the client, applies business and client billing defaults, sets line items, dates, terms, reference, currency, and notes, and returns authoritative recalculated totals, validation diagnostics, and any client invoicing rules from the library. Never issues or assigns a permanent invoice number.',
    inputSchema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description: 'Exact client ID to apply billing details, currency, and terms from.',
        },
        clientQuery: {
          type: 'string',
          description: 'Client name or email to look up when clientId is omitted.',
        },
        sourceInvoiceId: {
          type: 'string',
          description: 'Optional prior invoice or draft ID to copy structure and lines from before applying overrides.',
        },
        invoiceDate: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: 'Optional ISO invoice date (defaults to local today).',
        },
        dueDate: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: 'Optional explicit ISO due date (sets termsDays to custom/null unless termsDays is also passed).',
        },
        termsDays: {
          type: 'integer',
          minimum: 0,
          description: 'Optional payment terms in days from invoiceDate.',
        },
        currency: {
          type: 'string',
          pattern: '^[A-Z]{3}$',
          description: 'Optional ISO 4217 currency code.',
        },
        reference: {
          type: 'string',
          description: 'Optional PO number or invoice reference.',
        },
        notes: {
          type: 'string',
          description: 'Optional notes printed on the invoice.',
        },
        paymentInstructions: {
          type: 'string',
          description: 'Optional payment instructions override.',
        },
        lineItems: {
          type: 'array',
          description: 'Ordered line items to place on the draft.',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              quantity: { type: 'number', exclusiveMinimum: 0 },
              unitPrice: { type: 'number', minimum: 0 },
              discountPercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              taxPercent: { type: ['number', 'null'], minimum: 0 },
            },
            required: ['description', 'quantity', 'unitPrice'],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const current = await ctx.repository.current()
      const clientIdArg = optionalString(args.clientId)
      const clientQuery = optionalString(args.clientQuery)
      const sourceInvoiceId = optionalString(args.sourceInvoiceId)

      let resolvedClientId = clientIdArg
      if (resolvedClientId && !Object.hasOwn(current.clients, resolvedClientId)) {
        throw new Error(`Client "${resolvedClientId}" not found. Call searchClients or saveClient first.`)
      }
      if (!resolvedClientId && clientQuery) {
        const needle = clientQuery.toLocaleLowerCase()
        const exact = Object.values(current.clients).filter(
          c =>
            c.name.trim().toLocaleLowerCase() === needle ||
            (c.email ?? '').trim().toLocaleLowerCase() === needle,
        )
        const matches = exact.length
          ? exact
          : Object.values(current.clients).filter(c =>
              [c.name, c.contactName ?? '', c.email ?? ''].some(v =>
                v.toLocaleLowerCase().includes(needle),
              ),
            )
        if (matches.length === 0) {
          throw new Error(`No saved client matched "${clientQuery}". Call saveClient first or create a draft manually.`)
        }
        if (matches.length > 1) {
          throw new Error(
            `Multiple clients matched "${clientQuery}": ${matches.map(c => `${c.name} (${c.id})`).join(', ')}. Pass an exact clientId.`,
          )
        }
        resolvedClientId = matches[0].id
      }

      const changes: ContentPatch = {}
      const invoiceDate = optionalString(args.invoiceDate)
      if (invoiceDate) {
        if (!validDate(invoiceDate)) throw new Error('invoiceDate must be a valid YYYY-MM-DD date.')
        changes.invoiceDate = invoiceDate
      }
      const dueDate = optionalString(args.dueDate)
      if (dueDate) {
        if (!validDate(dueDate)) throw new Error('dueDate must be a valid YYYY-MM-DD date.')
        changes.dueDate = dueDate
      }
      if (typeof args.termsDays === 'number') {
        if (!Number.isInteger(args.termsDays) || args.termsDays < 0) {
          throw new Error('termsDays must be a non-negative integer.')
        }
        changes.termsDays = args.termsDays
      }
      const currency = optionalString(args.currency)
      if (currency) {
        if (!supportedCurrencies.includes(currency)) {
          throw new Error(`Unsupported currency "${currency}".`)
        }
        changes.currency = currency
      }
      if (typeof args.reference === 'string') changes.reference = args.reference
      if (typeof args.notes === 'string') changes.notes = args.notes
      if (typeof args.paymentInstructions === 'string') {
        changes.paymentInstructions = args.paymentInstructions
      }
      if (Array.isArray(args.lineItems)) {
        const items: LineItem[] = args.lineItems.map((raw, i) => {
          if (!raw || typeof raw !== 'object') {
            throw new Error(`lineItems.${i} must be an object.`)
          }
          const item = raw as Record<string, unknown>
          if (typeof item.description !== 'string' || !item.description.trim()) {
            throw new Error(`lineItems.${i}.description is required.`)
          }
          if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0) {
            throw new Error(`lineItems.${i}.quantity must be a positive number.`)
          }
          if (typeof item.unitPrice !== 'number' || !Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
            throw new Error(`lineItems.${i}.unitPrice must be a non-negative number.`)
          }
          if (
            item.discountPercent !== undefined &&
            item.discountPercent !== null &&
            (typeof item.discountPercent !== 'number' ||
              !Number.isFinite(item.discountPercent) ||
              item.discountPercent < 0 ||
              item.discountPercent > 100)
          ) {
            throw new Error(`lineItems.${i}.discountPercent must be a number between 0 and 100, or null.`)
          }
          if (
            item.taxPercent !== undefined &&
            item.taxPercent !== null &&
            (typeof item.taxPercent !== 'number' ||
              !Number.isFinite(item.taxPercent) ||
              item.taxPercent < 0)
          ) {
            throw new Error(`lineItems.${i}.taxPercent must be a non-negative number, or null.`)
          }
          return {
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercent:
              typeof item.discountPercent === 'number' ? item.discountPercent : null,
            taxPercent: typeof item.taxPercent === 'number' ? item.taxPercent : null,
          }
        })
        changes.lineItems = items
      }

      const draftId = newId()
      const nowDate = ctx.now ? ctx.now() : new Date()
      const today = localToday(nowDate)
      const store = await ctx.repository.transact(s => {
        let next = createDraft(s, sourceInvoiceId, undefined, draftId, nowDate.toISOString(), today)
        if (resolvedClientId) {
          next = applyDefaults(next, draftId, ['client'], resolvedClientId)
        }
        if (Object.keys(changes).length > 0) {
          next = updateDraft(next, draftId, changes)
        }
        return next
      })

      const details = { ...invoiceDetails(store, draftId), saveStatus: 'saved' as const }
      const summaryRow = draftReply(details)
      const ws = workspaceState(store)
      const rules = clientRulesExcerpts(store, resolvedClientId ?? details.content.clientId, true)

      return {
        summary: `Draft ${summaryRow.provisionalNumberText ?? draftId} prepared for ${summaryRow.recipient || 'unnamed recipient'} (${summaryRow.lineCount} line${summaryRow.lineCount === 1 ? '' : 's'}, total ${summaryRow.totals?.total ?? '0'} ${summaryRow.currency ?? ''}). Not issued.`,
        mutated: true,
        data: {
          draft: summaryRow,
          setupReadyToIssue: ws.setup.readyToIssue,
          missingBusinessFields: ws.setup.missingBusinessFields,
          sequenceVerified: ws.setup.sequenceVerified,
          readyToPrepareFinalization: Boolean(summaryRow.complete && ws.setup.readyToIssue),
          clientRules: rules,
          note: 'This created an unnumbered draft only. Call prepareInvoiceFinalization and then finalizeInvoice (with user approval) to issue it.',
        },
      }
    },
  }),

  // ── 5. fn_auditInvoiceReadiness ────────────────────────────────────────
  defineAppFunction<InvoicingAgentToolContext>({
    name: 'fn_auditInvoiceReadiness',
    category: 'invoices',
    risk: 'read',
    requiresApproval: false,
    replaces: [
      'getWorkspaceState',
      'getInvoice',
      'listLibrary',
      'readLibraryDocument',
      'searchInvoices',
    ],
    description:
      'Audit one invoice draft or correction for issuance readiness, business setup completeness, client invoicing rule compliance, and potential duplicate billing. Replaces calling getWorkspaceState, getInvoice, listLibrary, and searchInvoices separately. Reports missing required fields, currency review flags, sequence verification status, matching client library rules, and recent invoices for the same recipient with identical amounts or references without modifying any data.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: {
          type: 'string',
          description: 'ID of the saved invoice draft or correction draft to audit.',
        },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const draftId = optionalString(args.draftId)
      if (!draftId) throw new Error('"draftId" is required.')
      const store = await ctx.repository.current()
      const draft = Object.hasOwn(store.drafts, draftId) ? store.drafts[draftId] : undefined
      if (!draft) {
        throw new Error(`Draft "${draftId}" not found. Only unissued drafts and unpublished corrections can be audited for readiness.`)
      }

      const ws = workspaceState(store)
      const calc = calculateInvoice(draft.content, draft.currencyReviewRequired)
      const blockingIssues: Array<{ area: string; field: string; message: string }> = []

      for (const field of ws.setup.missingBusinessFields) {
        blockingIssues.push({
          area: 'businessSetup',
          field: `business.${field}`,
          message: `Business ${field} is missing in workspace identity.`,
        })
      }
      if (!ws.setup.sequenceVerified) {
        blockingIssues.push({
          area: 'sequence',
          field: 'sequence.verified',
          message: 'Invoice number sequence has not been verified yet (use setNextInvoiceNumber).',
        })
      }
      for (const d of calc.diagnostics) {
        blockingIssues.push({ area: 'draft', field: d.field, message: d.message })
      }

      const recipientNeedle = draft.content.recipient.name.trim().toLocaleLowerCase()
      const refNeedle = draft.content.reference.trim().toLocaleLowerCase()
      const potentialDuplicates = Object.values(store.invoices)
        .filter(inv => inv.id !== draft.correctionOf)
        .map(inv => {
          const v = getVersion(store, inv.id)
          const invCalc = calculateInvoice(v.content)
          const sameClient =
            (draft.content.clientId && v.content.clientId === draft.content.clientId) ||
            (recipientNeedle.length > 0 &&
              v.content.recipient.name.trim().toLocaleLowerCase() === recipientNeedle)
          if (!sameClient) return null
          const sameReference =
            refNeedle.length > 0 &&
            v.content.reference.trim().toLocaleLowerCase() === refNeedle
          const sameTotal =
            calc.complete &&
            v.content.currency === draft.content.currency &&
            invCalc.total === calc.total
          if (!sameReference && !sameTotal) return null
          return {
            invoiceId: inv.id,
            numberText: issuedLabel(store, inv),
            invoiceDate: v.content.invoiceDate,
            reference: v.content.reference,
            currency: v.content.currency,
            total: invCalc.total,
            reason:
              sameReference && sameTotal
                ? 'matching reference and total'
                : sameReference
                  ? 'matching reference'
                  : 'matching amount and currency',
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .slice(0, 10)

      const rules = clientRulesExcerpts(store, draft.content.clientId, true)
      const readyForPrepare = blockingIssues.length === 0

      return {
        summary: readyForPrepare
          ? `Draft ${draftId} is ready for prepareInvoiceFinalization (${calc.total} ${draft.content.currency ?? ''}, ${potentialDuplicates.length} duplicate warning${potentialDuplicates.length === 1 ? '' : 's'}).`
          : `Draft ${draftId} has ${blockingIssues.length} blocking issue${blockingIssues.length === 1 ? '' : 's'} before issuance.`,
        mutated: false,
        data: {
          draftId: draft.id,
          kind: draft.correctionOf ? 'correction' : 'draft',
          correctionOf: draft.correctionOf ?? null,
          revision: draft.revision,
          provisionalNumberText: draft.correctionOf
            ? issuedLabel(store, store.invoices[draft.correctionOf])
            : provisionalLabel(store, draft.content.invoiceDate),
          readyForPrepare,
          blockingIssues,
          warnings: calc.warnings,
          currencyReviewRequired: draft.currencyReviewRequired,
          totals: {
            currency: calc.currency,
            subtotal: calc.subtotal,
            totalDiscount: calc.totalDiscount,
            net: calc.net,
            tax: calc.tax,
            total: calc.total,
          },
          potentialDuplicates,
          clientLibraryRules: rules,
          nextStep: readyForPrepare
            ? 'Call prepareInvoiceFinalization to validate rendered pages and obtain a confirmation token.'
            : 'Resolve blockingIssues via updateInvoiceDraft / updateBusinessIdentity / setNextInvoiceNumber.',
        },
      }
    },
  }),

  // ── 6. fn_reconcilePaymentsAudit ───────────────────────────────────────
  defineAppFunction<InvoicingAgentToolContext>({
    name: 'fn_reconcilePaymentsAudit',
    category: 'reporting',
    risk: 'read',
    requiresApproval: false,
    replaces: ['searchInvoices', 'getInvoice', 'listAgreements', 'getAgreement'],
    description:
      'Reconcile and audit payment status across issued invoices and contractor bills in one pass. Replaces calling searchInvoices, getInvoice, and getAgreement repeatedly. Identifies issued invoices not yet marked sent, sent invoices past due without a paid mark, paid invoices missing payment references, and unpaid or over-cap contractor bills, optionally matching supplied incoming payment amounts or references to open invoices.',
    inputSchema: {
      type: 'object',
      properties: {
        payments: {
          type: 'array',
          description: 'Optional incoming payment items to match against open invoices (read-only suggestions).',
          items: {
            type: 'object',
            properties: {
              amount: { type: 'number', minimum: 0 },
              currency: { type: 'string', pattern: '^[A-Z]{3}$' },
              reference: { type: 'string' },
              clientName: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
        includeContractorBills: {
          type: 'boolean',
          description: 'Also audit unpaid and warning-flagged contractor bills (default true).',
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const store = await ctx.repository.current()
      const today = todayOf(ctx)
      const includeContractorBills = args.includeContractorBills !== false

      const issuedNotSent: Array<Record<string, unknown>> = []
      const sentOverdue: Array<Record<string, unknown>> = []
      const paidWithoutReference: Array<Record<string, unknown>> = []
      const openWithCorrection: Array<Record<string, unknown>> = []
      const openInvoices: Array<{
        id: string
        numberText: string
        recipient: string
        reference: string
        currency: string
        total: string
        numericTotal: number
        dueDate: string | null
        daysOverdue: number
      }> = []

      for (const inv of Object.values(store.invoices)) {
        const version = getVersion(store, inv.id)
        const standing = invoiceStanding(inv, today)
        const total = calculateInvoice(version.content).total
        const numberText = issuedLabel(store, inv)
        const correction = Object.values(store.drafts).find(d => d.correctionOf === inv.id)

        if (standing.mark === 'paid') {
          if (!inv.marks?.paidReference?.trim()) {
            paidWithoutReference.push({
              id: inv.id,
              numberText,
              recipient: version.content.recipient.name,
              paidAt: inv.marks?.paidAt ?? null,
              currency: version.content.currency,
              total,
            })
          }
          continue
        }

        openInvoices.push({
          id: inv.id,
          numberText,
          recipient: version.content.recipient.name,
          reference: version.content.reference,
          currency: version.content.currency ?? '',
          total,
          numericTotal: Number(total),
          dueDate: standing.dueDate,
          daysOverdue: standing.daysOverdue,
        })

        if (!inv.marks?.sentAt) {
          issuedNotSent.push({
            id: inv.id,
            numberText,
            recipient: version.content.recipient.name,
            invoiceDate: version.content.invoiceDate,
            dueDate: standing.dueDate,
            currency: version.content.currency,
            total,
          })
        } else if (standing.mark === 'overdue') {
          sentOverdue.push({
            id: inv.id,
            numberText,
            recipient: version.content.recipient.name,
            sentAt: inv.marks.sentAt,
            dueDate: standing.dueDate,
            daysOverdue: standing.daysOverdue,
            currency: version.content.currency,
            total,
          })
        }

        if (correction) {
          openWithCorrection.push({
            invoiceId: inv.id,
            numberText,
            correctionDraftId: correction.id,
            recipient: version.content.recipient.name,
          })
        }
      }

      const incoming = Array.isArray(args.payments) ? args.payments : []
      const paymentMatches = incoming.map((raw, index) => {
        const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
        const amount = typeof p.amount === 'number' && Number.isFinite(p.amount) ? p.amount : undefined
        const currency = optionalString(p.currency)
        const ref = optionalString(p.reference)?.toLocaleLowerCase()
        const clientName = optionalString(p.clientName)?.toLocaleLowerCase()

        const candidates = openInvoices
          .map(inv => {
            let score = 0
            const reasons: string[] = []
            if (ref && (inv.numberText.toLocaleLowerCase().includes(ref) || ref.includes(inv.numberText.toLocaleLowerCase()))) {
              score += 50
              reasons.push('invoice number matches reference')
            } else if (ref && inv.reference && inv.reference.toLocaleLowerCase().includes(ref)) {
              score += 35
              reasons.push('invoice reference matches')
            }
            if (amount !== undefined && Math.abs(inv.numericTotal - amount) < 0.005) {
              if (!currency || inv.currency === currency) {
                score += 40
                reasons.push('exact amount match')
              }
            }
            if (clientName && inv.recipient.toLocaleLowerCase().includes(clientName)) {
              score += 20
              reasons.push('client name matches')
            }
            return score > 0 ? { invoiceId: inv.id, numberText: inv.numberText, recipient: inv.recipient, currency: inv.currency, total: inv.total, score, reasons } : null
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)

        return { inputIndex: index, payment: p, candidates }
      })

      const unpaidContractorBills: Array<Record<string, unknown>> = []
      const flaggedContractorBills: Array<Record<string, unknown>> = []
      if (includeContractorBills) {
        for (const a of Object.values(store.agreements ?? {})) {
          if (a.direction !== 'contractor') continue
          const contractor = partyName(store, a)
          for (const b of a.bills) {
            const check = billCheck(a, b)
            const entry = {
              agreementId: a.id,
              agreementNumber: a.numberText ?? null,
              contractor,
              billId: b.id,
              reference: b.reference,
              period: b.period,
              amount: sumMoney([String(b.amount)], a.currency),
              currency: a.currency,
              receivedAt: b.receivedAt,
              paidAt: b.paidAt ?? null,
              check,
            }
            if (!b.paidAt) unpaidContractorBills.push(entry)
            if (check.level === 'warn') flaggedContractorBills.push(entry)
          }
        }
      }

      return {
        summary: `Reconciliation audit (${today}): ${issuedNotSent.length} issued-not-sent, ${sentOverdue.length} sent-overdue, ${paidWithoutReference.length} paid-without-ref, ${unpaidContractorBills.length} unpaid contractor bills.`,
        mutated: false,
        data: {
          asOfDate: today,
          issuedNotSent,
          sentOverdue,
          paidWithoutReference,
          openWithCorrection,
          ...(incoming.length ? { paymentMatches } : {}),
          ...(includeContractorBills
            ? { unpaidContractorBills, flaggedContractorBills }
            : {}),
          note: 'Read-only audit. Confirm with the user before calling markInvoice or updateContractorBill.',
        },
      }
    },
  }),

  // ── 7. fn_agreementsBillingSummary ─────────────────────────────────────
  defineAppFunction<InvoicingAgentToolContext>({
    name: 'fn_agreementsBillingSummary',
    category: 'agreements',
    risk: 'read',
    requiresApproval: false,
    replaces: ['listAgreements', 'getAgreement', 'searchContractors'],
    description:
      'Summarize all client and contractor agreements, billing progress, ready-to-invoice milestones, unbilled retainer months, draft readiness blockers, and contractor bill checks in a single call. Replaces calling listAgreements followed by repeated getAgreement and searchContractors calls. Filters optionally by status, direction, clientId, or contractorId.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'draft', 'sent', 'signed', 'complete', 'ended'],
          description: 'Optional status filter (default "all").',
        },
        direction: {
          type: 'string',
          enum: ['client', 'contractor'],
          description: 'Optional direction filter.',
        },
        clientId: { type: 'string', description: 'Optional client ID filter.' },
        contractorId: { type: 'string', description: 'Optional contractor ID filter.' },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const store = await ctx.repository.current()
      const today = todayOf(ctx)
      const status = (optionalString(args.status) as AgreementStatus | 'all' | undefined) ?? 'all'
      const direction = optionalString(args.direction) as AgreementDirection | undefined
      const clientId = optionalString(args.clientId)
      const contractorId = optionalString(args.contractorId)

      const matched = Object.values(store.agreements ?? {}).filter(
        a =>
          (status === 'all' || a.status === status) &&
          (!direction || a.direction === direction) &&
          (!clientId || a.clientId === clientId) &&
          (!contractorId || a.contractorId === contractorId),
      )

      const byCurrency = new Map<
        string,
        { agreed: string[]; invoiced: string[]; paid: string[]; toBill: string[]; contractorBilled: string[]; contractorUnpaid: string[] }
      >()
      const readyMilestones: Array<Record<string, unknown>> = []
      const unbilledRetainers: Array<Record<string, unknown>> = []
      const draftBlockers: Array<Record<string, unknown>> = []
      const contractorBillWarnings: Array<Record<string, unknown>> = []

      const agreements = matched
        .map(a => {
          const cur = a.currency
          const bucket = byCurrency.get(cur) ?? {
            agreed: [],
            invoiced: [],
            paid: [],
            toBill: [],
            contractorBilled: [],
            contractorUnpaid: [],
          }
          const billing = a.direction === 'client' ? agreementBilling(store, a) : null
          const periods = unbilledPeriods(a, today)
          const checks = agreementChecks(store, a)
          const blocks = checks.filter(c => c.level === 'block')

          if (a.status === 'draft' && blocks.length) {
            draftBlockers.push({
              agreementId: a.id,
              title: a.title,
              party: partyName(store, a),
              blockers: blocks.map(b => b.message),
            })
          }

          if (a.direction === 'client' && billing && (a.status === 'signed' || a.status === 'complete')) {
            if (billing.agreed !== null) bucket.agreed.push(billing.agreed)
            bucket.invoiced.push(billing.invoiced)
            bucket.paid.push(billing.paid)
            if (billing.toBill !== null) bucket.toBill.push(billing.toBill)

            for (const m of a.milestones) {
              if (!m.invoiceId && m.doneAt && m.trigger !== 'period') {
                readyMilestones.push({
                  agreementId: a.id,
                  numberText: a.numberText ?? null,
                  title: a.title,
                  client: partyName(store, a),
                  milestoneId: m.id,
                  label: m.label,
                  amount: sumMoney([String(m.amount)], cur),
                  currency: cur,
                  doneAt: m.doneAt,
                })
              }
            }
            if (periods.length) {
              unbilledRetainers.push({
                agreementId: a.id,
                numberText: a.numberText ?? null,
                title: a.title,
                client: partyName(store, a),
                currency: cur,
                monthlyAmount: a.fee.amount !== undefined ? sumMoney([String(a.fee.amount)], cur) : null,
                unbilledPeriods: periods,
              })
            }
          }

          if (a.direction === 'contractor') {
            for (const b of a.bills) {
              bucket.contractorBilled.push(String(b.amount))
              if (!b.paidAt) bucket.contractorUnpaid.push(String(b.amount))
              const check = billCheck(a, b)
              if (check.level === 'warn') {
                contractorBillWarnings.push({
                  agreementId: a.id,
                  numberText: a.numberText ?? null,
                  contractor: partyName(store, a),
                  billId: b.id,
                  reference: b.reference,
                  period: b.period,
                  amount: sumMoney([String(b.amount)], cur),
                  currency: cur,
                  message: check.message,
                })
              }
            }
          }

          byCurrency.set(cur, bucket)
          return {
            id: a.id,
            kind: a.kind,
            direction: a.direction,
            numberText: a.numberText ?? null,
            title: a.title,
            party: partyName(store, a),
            status: a.status,
            currency: cur,
            fee: a.fee,
            billing: billing
              ? {
                  agreed: billing.agreed,
                  invoiced: billing.invoiced,
                  paid: billing.paid,
                  toBill: billing.toBill,
                }
              : null,
            unbilledPeriods: periods,
            blockerCount: blocks.length,
            billCount: a.bills.length,
          }
        })
        .sort((a, b) => a.direction.localeCompare(b.direction) || a.title.localeCompare(b.title))

      const totalsByCurrency = [...byCurrency.entries()].map(([currency, row]) => ({
        currency,
        clientAgreed: sumMoney(row.agreed, currency),
        clientInvoiced: sumMoney(row.invoiced, currency),
        clientPaid: sumMoney(row.paid, currency),
        clientToBill: sumMoney(row.toBill, currency),
        contractorBilled: sumMoney(row.contractorBilled, currency),
        contractorUnpaid: sumMoney(row.contractorUnpaid, currency),
      }))

      return {
        summary: `Agreements summary: ${agreements.length} agreements, ${readyMilestones.length} ready milestones, ${unbilledRetainers.length} retainers with unbilled months, ${draftBlockers.length} blocked drafts.`,
        mutated: false,
        data: {
          count: agreements.length,
          totalsByCurrency,
          readyMilestones,
          unbilledRetainers,
          draftBlockers,
          contractorBillWarnings,
          agreements,
        },
      }
    },
  }),

  // ── 8. fn_proposalsPipelineOverview ────────────────────────────────────
  defineAppFunction<InvoicingAgentToolContext>({
    name: 'fn_proposalsPipelineOverview',
    category: 'proposals',
    risk: 'read',
    requiresApproval: false,
    replaces: ['listProposals', 'getProposal', 'searchClients'],
    description:
      'Summarize the proposals and quotes pipeline across draft, offered, accepted, and declined stages in a single call. Replaces calling listProposals and getProposal for each proposal. Returns stage counts and totals by currency, accepted proposals awaiting conversion to an invoice draft, open offered proposals awaiting customer decision, and incomplete drafts with their blocking fields.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'draft', 'offered', 'accepted', 'declined'],
          description: 'Optional status filter (default "all").',
        },
        clientId: {
          type: 'string',
          description: 'Optional client ID filter.',
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const store = await ctx.repository.current()
      const statusFilter = (optionalString(args.status) as ProposalStatus | 'all' | undefined) ?? 'all'
      const clientId = optionalString(args.clientId)

      const allProposals = Object.values(store.proposals ?? {}).filter(p => {
        const st = proposalStatus(p)
        const latest = latestVersion(p)
        const shown = p.acceptedVersionId ? getProposalVersion(p, p.acceptedVersionId) : latest
        return (
          (statusFilter === 'all' || st === statusFilter) &&
          (!clientId || shown.content.clientId === clientId)
        )
      })

      const stageCounts: Record<ProposalStatus, number> = {
        draft: 0,
        offered: 0,
        accepted: 0,
        declined: 0,
      }
      const stageAmounts = new Map<string, Record<ProposalStatus, string[]>>()
      const acceptedNotYetInvoiced: Array<Record<string, unknown>> = []
      const awaitingDecision: Array<Record<string, unknown>> = []
      const incompleteDrafts: Array<Record<string, unknown>> = []

      for (const p of allProposals) {
        const st = proposalStatus(p)
        stageCounts[st] += 1
        const latest = latestVersion(p)
        const shown = p.acceptedVersionId ? getProposalVersion(p, p.acceptedVersionId) : latest
        const calc = calculateProposal(shown.content)
        const cur = shown.content.currency ?? 'UNSPECIFIED'
        const curMap = stageAmounts.get(cur) ?? {
          draft: [],
          offered: [],
          accepted: [],
          declined: [],
        }
        curMap[st].push(calc.total)
        stageAmounts.set(cur, curMap)

        const target = conversionTarget(store, p)
        if (st === 'accepted' && (!target || target.status === 'missing')) {
          acceptedNotYetInvoiced.push({
            proposalId: p.id,
            acceptedVersionId: p.acceptedVersionId,
            title: shown.content.title,
            customer: shown.content.customer.name,
            clientId: shown.content.clientId ?? null,
            decidedAt: shown.decidedAt ?? null,
            currency: shown.content.currency,
            total: calc.total,
          })
        } else if (st === 'offered') {
          const offeredVersion =
            [...p.versions].reverse().find(v => v.status === 'offered') ?? shown
          const offeredCalc = calculateProposal(offeredVersion.content)
          awaitingDecision.push({
            proposalId: p.id,
            offeredVersionId: offeredVersion.id,
            versionNumber: offeredVersion.number,
            hasRevisionDraft: latest.status === 'draft',
            title: offeredVersion.content.title,
            customer: offeredVersion.content.customer.name,
            offeredAt: offeredVersion.offeredAt ?? null,
            currency: offeredVersion.content.currency,
            total: offeredCalc.total,
          })
        } else if (st === 'draft' && !calc.complete) {
          incompleteDrafts.push({
            proposalId: p.id,
            versionId: latest.id,
            title: latest.content.title,
            customer: latest.content.customer.name,
            diagnostics: calc.diagnostics,
          })
        }
      }

      awaitingDecision.sort((a, b) =>
        String(a.offeredAt ?? '').localeCompare(String(b.offeredAt ?? '')),
      )

      const totalsByCurrency = [...stageAmounts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, buckets]) => ({
          currency,
          draft: sumMoney(buckets.draft, currency),
          offered: sumMoney(buckets.offered, currency),
          accepted: sumMoney(buckets.accepted, currency),
          declined: sumMoney(buckets.declined, currency),
        }))

      return {
        summary: `Proposals pipeline: ${allProposals.length} total (${stageCounts.draft} draft, ${stageCounts.offered} offered, ${stageCounts.accepted} accepted, ${stageCounts.declined} declined); ${acceptedNotYetInvoiced.length} accepted awaiting invoice conversion.`,
        mutated: false,
        data: {
          totalCount: allProposals.length,
          stageCounts,
          totalsByCurrency,
          acceptedNotYetInvoiced,
          awaitingDecision,
          incompleteDrafts,
        },
      }
    },
  }),
]
