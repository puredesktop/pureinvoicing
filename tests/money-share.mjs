import assert from 'node:assert/strict'
import { readFile, readdir, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
// The Executive app's money share (ps-suite#1013 §2b) built from the production domain, and its publisher's on/off and ordering rules.
const dir = await mkdtemp(join(tmpdir(), 'invoice-money-share-'))
try {
  await writeFile(join(dir, 'package.json'), '{"type":"module"}')
  const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replace(/(from\s+['"])(\.[^'"]+)(['"])/g, '$1$2.js$3')
  await mkdir(join(dir, 'src/lib/invoices'), { recursive: true })
  for (const file of await readdir('src/lib/invoices')) {
    if (!file.endsWith('.ts') || file === 'workspace.ts') continue
    await writeFile(join(dir, 'src/lib/invoices', file.replace(/\.ts$/, '.js')), transpile(await readFile(`src/lib/invoices/${file}`, 'utf8')))
  }
  await mkdir(join(dir, 'src/bridge'), { recursive: true })
  await writeFile(join(dir, 'src/bridge/invoiceStorageCapabilities.js'), transpile(await readFile('src/bridge/invoiceStorageCapabilities.ts', 'utf8')))
  const load = name => import(pathToFileURL(join(dir, `src/lib/invoices/${name}.js`)).href)
  const { emptyStore } = await load('defaults')
  const { parseStore } = await load('parse')
  const u = await load('updates')
  const { applyMark } = await load('lifecycle')
  const ag = await load('agreements')
  const { invoicingShare, nextMilestone, shareRequested, createMoneySharePublisher } = await load('moneyShare')

  const now = new Date('2026-10-26T09:00:00.000Z')
  const today = '2026-10-26'
  const at = '2026-10-01T10:00:00Z'
  // A business, two clients, and invoices issued straight into the record (the share never issues anything).
  let store = emptyStore()
  store.business = { name: 'Pure Science', address: '1 Main St', defaultPaymentInstructions: 'Wire' }
  store.clients = {
    acme: { id: 'acme', name: 'Acme', billingAddress: '2 Side St', updatedAt: at },
    beta: { id: 'beta', name: 'Beta Ltd', billingAddress: '3 Far St', updatedAt: at },
  }
  store.sequence = { verified: true, nextNumber: 50, reservedNumbers: [30, 40, 41, 42, 43], history: [], format: { pattern: 'INV-{NNNN}' } }
  const content = (clientId, invoiceDate, dueDate, unitPrice, currency = 'USD') => {
    let s = u.createDraft(emptyStore(), undefined, undefined, 'tmp', at, invoiceDate)
    return { ...s.drafts.tmp.content, sender: { name: 'Pure Science', address: '1 Main St' }, recipient: { name: store.clients[clientId]?.name ?? clientId, address: 'X' },
      clientId, invoiceDate, dueDate, currency, termsDays: null, lineItems: [{ description: 'Work', quantity: 1, unitPrice, discountPercent: null, taxPercent: null }] }
  }
  const issue = (id, number, c) => ({ id, number, historical: false, createdAt: at, updatedAt: at, currentVersionId: `${id}-v1`,
    versions: [{ id: `${id}-v1`, issuedAt: `${c.invoiceDate}T12:00:00Z`, content: c }], history: [] })
  store.invoices = {
    current: issue('current', 42, content('acme', '2026-10-01', '2026-10-31', 1200)),
    late: issue('late', 41, content('beta', '2026-09-01', '2026-10-01', 300.5)),
    paidRecent: issue('paidRecent', 40, content('acme', '2026-09-01', '2026-09-30', 900)),
    paidOld: issue('paidOld', 30, content('acme', '2026-03-01', '2026-03-31', 100)),
    euro: issue('euro', 43, content('beta', '2026-10-10', '2026-11-09', 75, 'EUR')),
  }
  store = applyMark(store, 'paidRecent', { kind: 'paid', at: '2026-10-10' }, '2026-10-10T09:00:00Z')
  store = applyMark(store, 'paidOld', { kind: 'paid', at: '2026-04-15' }, '2026-04-15T09:00:00Z')
  store = applyMark(store, 'late', { kind: 'sent', at: '2026-09-01' }, '2026-09-01T09:00:00Z')
  // Two drafts: a new invoice, and a correction of an issued one (not new money).
  store = u.createDraft(store, undefined, undefined, 'draft1', '2026-10-20T09:00:00Z', today)
  store.drafts.draft1 = { ...store.drafts.draft1, content: content('acme', today, '2026-11-25', 800) }
  store = u.startCorrection(store, 'current', 'fix1')
  // Agreements: a signed SOW with milestones, a retainer, a draft and a contractor's (none of which are shared).
  store = ag.createAgreement(store, { kind: 'sow', direction: 'client', clientId: 'acme', title: 'Pilot' }, 'sow', at)
  store = ag.updateAgreement(store, 'sow', { fee: { kind: 'fixed', amount: 10000 }, milestones: [
    { id: 'm1', label: 'Kick-off', amount: 5000, trigger: 'signature' }, { id: 'm2', label: 'Phase 2', amount: 5000, trigger: 'done' }] }, at)
  const plain = [{ heading: 'Scope', body: 'The work as agreed.' }]
  store = ag.updateAgreement(store, 'sow', { sections: plain }, at)
  store = ag.sendAgreement(store, 'sow', at)
  store = ag.markSigned(store, 'sow', { ours: { name: 'A', at: '2026-10-02' }, theirs: { name: 'B', at: '2026-10-03' } }, at)
  store = ag.createAgreement(store, { kind: 'msa', direction: 'client', clientId: 'beta', title: 'Retainer' }, 'retainer', at)
  store = ag.updateAgreement(store, 'retainer', { fee: { kind: 'monthly', amount: 2000 }, startDate: '2026-09-01' }, at)
  store = ag.updateAgreement(store, 'retainer', { sections: plain }, at)
  store = ag.sendAgreement(store, 'retainer', at)
  store = ag.markSigned(store, 'retainer', { ours: { name: 'A', at: '2026-09-01' }, theirs: { name: 'B', at: '2026-09-01' } }, at)
  store = ag.invoicePeriod(store, 'retainer', '2026-09', 'ret-sep', at, '2026-09-30')
  store = ag.createAgreement(store, { kind: 'nda', direction: 'client', clientId: 'beta', title: 'Unsent NDA' }, 'nda', at)
  store = ag.saveContractor(store, { name: 'Dev Co' }, 'devco', true, at)
  store = ag.createAgreement(store, { kind: 'contractor', direction: 'contractor', contractorId: 'devco', title: 'Dev work' }, 'ica', at)
  store = parseStore(store)
  const before = JSON.stringify(store)

  const share = invoicingShare(store, now)
  assert.equal(JSON.stringify(store), before, 'building the share never changes the store')
  assert.equal(share.v, 1)
  assert.equal(share.at, '2026-10-26T09:00:00Z')
  assert.equal(share.currency, 'USD')
  assert.deepEqual(Object.keys(share), ['v', 'at', 'currency', 'owedToUs', 'drafts', 'paid', 'agreements'])
  // Owed: issued and unpaid, most overdue first, plain numbers in the invoice's own currency, the label the client saw.
  assert.deepEqual(share.owedToUs, [
    { number: 'INV-0041', client: 'Beta Ltd', amount: 300.5, currency: 'USD', issued: '2026-09-01', due: '2026-10-01', daysOverdue: 25 },
    { number: 'INV-0042', client: 'Acme', amount: 1200, currency: 'USD', issued: '2026-10-01', due: '2026-10-31', daysOverdue: 0 },
    { number: 'INV-0043', client: 'Beta Ltd', amount: 75, currency: 'EUR', issued: '2026-10-10', due: '2026-11-09', daysOverdue: 0 },
  ])
  // Paid in the last 90 days only, with the day the paid mark carries.
  assert.deepEqual(share.paid, [{ number: 'INV-0040', client: 'Acme', amount: 900, currency: 'USD', paidOn: '2026-10-10' }])
  // Drafts: new invoices only, newest first; the retainer's September draft is one of them, the correction is not.
  assert.deepEqual(share.drafts.map(d => d.id).sort(), ['draft1', 'ret-sep'])
  assert.deepEqual(share.drafts.find(d => d.id === 'draft1'), { id: 'draft1', client: 'Acme', amount: 800, currency: 'USD' })
  assert.deepEqual(share.drafts.find(d => d.id === 'ret-sep'), { id: 'ret-sep', client: 'Beta Ltd', amount: 2000, currency: 'USD' })
  // Agreements: client agreements out for signature or running, soonest due first; never drafts or contractors'.
  assert.deepEqual(share.agreements, [
    { title: 'Retainer', client: 'Beta Ltd', state: 'signed', nextMilestone: { title: ag.periodLabel('2026-10'), due: '2026-10-01', amount: 2000, currency: 'USD' } },
    { title: 'Pilot', client: 'Acme', state: 'signed', nextMilestone: { title: 'Kick-off', due: '2026-10-03', amount: 5000, currency: 'USD' } },
  ])
  // A milestone waiting on work has no date in the app; once done, it is due from that day; once all are invoiced, nothing is next.
  let later = ag.invoiceMilestone(store, 'sow', 'm1', 'kick', at, today)
  assert.deepEqual(nextMilestone(later.agreements.sow, today), { title: 'Phase 2', due: null, amount: 5000, currency: 'USD' })
  later = ag.setMilestoneDone(later, 'sow', 'm2', true, at, '2026-10-20')
  assert.equal(nextMilestone(later.agreements.sow, today).due, '2026-10-20')
  later = ag.invoiceMilestone(later, 'sow', 'm2', 'p2', at, today)
  assert.equal(nextMilestone(later.agreements.sow, today), null)
  later = ag.closeAgreement(later, 'sow', 'complete', at)
  assert.equal(invoicingShare(later, now).agreements.some(a => a.title === 'Pilot'), false, 'a completed agreement with nothing left to invoice drops out')
  // A retainer invoiced through this month looks to the next; past its end date it has nothing next.
  later = ag.invoicePeriod(store, 'retainer', '2026-10', 'ret-oct', at, today)
  assert.deepEqual(nextMilestone(later.agreements.retainer, today), { title: ag.periodLabel('2026-11'), due: '2026-11-01', amount: 2000, currency: 'USD' })
  assert.equal(nextMilestone({ ...later.agreements.retainer, endDate: '2026-10-31' }, today), null)
  // An empty workspace still writes a whole, valid file.
  assert.deepEqual(invoicingShare(emptyStore(), now), { v: 1, at: '2026-10-26T09:00:00Z', currency: 'USD', owedToUs: [], drafts: [], paid: [], agreements: [] })
  // Marking paid moves an invoice from owed to paid.
  const paidNow = invoicingShare(applyMark(store, 'late', { kind: 'paid', at: today }, now.toISOString()), now)
  assert.equal(paidNow.owedToUs.some(i => i.number === 'INV-0041'), false)
  assert.deepEqual(paidNow.paid[0], { number: 'INV-0041', client: 'Beta Ltd', amount: 300.5, currency: 'USD', paidOn: today })

  // The request: only { "v": 1 } turns sharing on.
  assert.equal(shareRequested(null), false)
  assert.equal(shareRequested('{ "v": 1 }'), true)
  assert.equal(shareRequested('{ "v": 2 }'), false)
  assert.equal(shareRequested('not json'), false)

  // The publisher: nothing without a request; written on open; skipped when unchanged; in order; stops when the request goes.
  let request = null
  const written = []
  let release
  const port = { readRequest: async () => request, write: async text => { if (release) await release; written.push(JSON.parse(text)) } }
  const publisher = createMoneySharePublisher(port)
  assert.equal(await publisher.publish(store, now), 'not-shared')
  assert.equal(written.length, 0)
  request = '{"v":1}'
  assert.equal(await publisher.publish(store, now), 'written')
  assert.equal(await publisher.publish(store, new Date('2026-10-26T09:05:00Z')), 'unchanged', 'a new instant alone is not a change')
  const changed = applyMark(store, 'late', { kind: 'paid', at: today }, now.toISOString())
  let open; release = new Promise(resolve => { open = resolve })
  const first = publisher.publish(changed, now), second = publisher.publish(store, now)
  open(); await Promise.all([first, second]); release = null
  assert.deepEqual(written.map(w => w.paid.length), [1, 2, 1], 'publishes land in the order they were asked for')
  request = null
  assert.equal(await publisher.publish(changed, now), 'not-shared')
  request = '{"v":1}'
  assert.equal(await publisher.publish(store, now), 'written', 'after sharing stops and starts again, the file is written afresh')
  console.log('Money share: owed, paid within 90 days, drafts, agreements with their next milestone, and the publisher passed.')
} finally {
  await rm(dir, { recursive: true, force: true })
}
