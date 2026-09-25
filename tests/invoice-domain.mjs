import assert from 'node:assert/strict'
import { readFile, readdir, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
// Exercise the production domain against a deterministic guarded-storage test double.
const temporary = await mkdtemp(join(tmpdir(), 'invoice-domain-'))
try {
  await writeFile(join(temporary, 'package.json'), '{"type":"module"}')
  for (const directory of ['src/lib/invoices', 'src/agents']) {
    await mkdir(join(temporary, directory), { recursive: true })
    for (const file of await readdir(directory)) {
      if (!file.endsWith('.ts') || file === 'workspace.ts' || file === 'catalog.ts') continue
      const source = await readFile(`${directory}/${file}`, 'utf8')
      const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      await writeFile(join(temporary, directory, file.replace(/\.ts$/, '.js')), output.replace(/(from\s+['"])(\.[^'"]+)(['"])/g, '$1$2.js$3'))
    }
  }
  const capabilitySource = await readFile('src/bridge/invoiceStorageCapabilities.ts', 'utf8')
  const capabilityCode = ts.transpileModule(capabilitySource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  await mkdir(join(temporary, 'src/bridge'), { recursive: true })
  await writeFile(join(temporary, 'src/bridge/invoiceStorageCapabilities.js'), capabilityCode)
  const { canUseInvoiceStorage } = await import(pathToFileURL(join(temporary, 'src/bridge/invoiceStorageCapabilities.js')).href)
  const storageMethods = ['storage.readJson', 'storage.writeJson']
  assert.equal(canUseInvoiceStorage(false, storageMethods), false)
  assert.equal(canUseInvoiceStorage(true, undefined), false)
  assert.equal(canUseInvoiceStorage(true, ['settings.app.get']), false)
  assert.equal(canUseInvoiceStorage(true, ['storage.readJson']), false)
  assert.equal(canUseInvoiceStorage(true, storageMethods), true)
  const load = name => import(pathToFileURL(join(temporary, `src/lib/invoices/${name}.js`)).href)
  const { emptyStore } = await load('defaults')
  const { calculateInvoice } = await load('calculations')
  const { parseStore, assertForwardTransition } = await load('parse')
  const u = await load('updates')
  const { invoiceDetails, searchInvoices, searchClients } = await load('queries')
  const { InvoiceRepository } = await load('repository')
  const { createInvoiceCommands } = await load('commands')
  const { domainSchemas } = await import(pathToFileURL(join(temporary, 'src/agents/domainSchemas.js')).href)
  const { validateDomainArguments } = await import(pathToFileURL(join(temporary, 'src/agents/validateDomainArguments.js')).href)
  const manifest = JSON.parse(await readFile('plugin.json', 'utf8'))
  for (const [name, schema] of Object.entries(domainSchemas)) {
    const tool = manifest.app.agents.tools.find(tool => tool.name === name)
    assert.deepEqual(schema, tool.inputSchema)
    assert.equal(tool.requiresApproval, !['getWorkspaceState', 'getInvoice', 'searchInvoices', 'searchClients', 'getInvoicePreview', 'prepareInvoiceFinalization', 'previewInvoiceImport', 'listAgreements', 'getAgreement', 'searchContractors', 'listAgreementTemplates', 'getAgreementTemplate', 'findAgreementSpecifics', 'previewAgreementFromTemplate'].includes(name))
  }
  assert.throws(() => validateDomainArguments('updateInvoiceDraft', { draftId: 'a', changes: { number: 4 } }))
  assert.throws(() => validateDomainArguments('setNextInvoiceNumber', { nextNumber: 4, unregisteredHistoryChecked: false }))
  let store = u.createDraft(emptyStore(), undefined, undefined, 'first', '2026-09-19T10:00:00Z', '2026-09-19')
  const content = structuredClone(store.drafts.first.content)
  content.sender = { name: 'Business', address: 'Address' }; content.recipient = { name: 'Client', address: 'Address' }
  content.dueDate = '2026-09-30'
  content.lineItems = [{ description: 'A', quantity: 1, unitPrice: 1.005 }]
  assert.equal(calculateInvoice(content).total, '1.01')
  content.lineItems = [{ description: 'A', quantity: 3, unitPrice: 19.99, discountPercent: 12.5, taxPercent: 10 }]
  let totals = calculateInvoice(content)
  assert.deepEqual([totals.subtotal, totals.totalDiscount, totals.net, totals.tax, totals.total], ['59.97', '7.50', '52.47', '5.25', '57.72'])
  content.lineItems = [{ description: 'A', quantity: 1, unitPrice: .015 }, { description: 'B', quantity: 1, unitPrice: .015 }]
  assert.equal(calculateInvoice(content).total, '0.04')
  content.currency = 'JPY'; content.lineItems = [{ description: 'A', quantity: 1, unitPrice: .5 }]
  assert.equal(calculateInvoice(content).total, '1')
  content.currency = 'KWD'; content.lineItems[0].unitPrice = .0005
  assert.equal(calculateInvoice(content).total, '0.001')
  content.lineItems[0].quantity = null
  assert.equal(calculateInvoice(content).complete, false)
  assert.equal(calculateInvoice(content).lines[0].total, null)
  assert.ok(calculateInvoice(content).diagnostics.some(d => d.field === 'lineItems.0.quantity'))
  content.invoiceDate = '2026-02-30'
  assert.ok(calculateInvoice(content).diagnostics.some(d => d.field === 'invoiceDate'))
  store = u.updateDraft(store, 'first', { currency: 'EUR', reference: 'old reference', dueDate: '2026-10-01' })
  assert.equal(store.drafts.first.currencyReviewRequired, true)
  const before = structuredClone(store.drafts.first)
  store = u.updateBusiness(store, { name: 'New business' })
  store = u.updateTemplate(store, { footerText: 'New footer' })
  store = u.saveClient(store, { name: 'Reusable', billingAddress: 'Before' }, 'client')
  assert.deepEqual(store.drafts.first, before)
  store = u.applyDefaults(store, 'first', ['client'], 'client')
  store = u.saveClient(store, { billingAddress: 'After' }, 'client', undefined, false)
  assert.equal(store.drafts.first.content.recipient.address, 'Before')
  assert.equal(store.drafts.first.content.sender.name, '')
  store = u.createDraft(store, 'first', undefined, 'copy', undefined, '2026-09-20')
  assert.equal(store.drafts.copy.content.invoiceDate, '2026-09-20')
  assert.equal(store.drafts.copy.content.dueDate, null)
  assert.equal(store.drafts.copy.content.reference, '')
  assert.equal(store.drafts.copy.number, undefined)
  assert.equal(store.drafts.copy.source.invoiceId, 'first')
  assert.throws(() => u.configureSequence(store, 10, false))
  store = u.configureSequence(store, 10, true)
  assert.throws(() => u.configureSequence(store, 9, true))
  store = u.reserveNumber(store, 10)
  assert.equal(u.nextAvailableNumber(store.sequence), 11)
  assert.throws(() => u.reserveNumber(store, 10))
  store = u.reserveNumber(store, 50, true)
  assert.equal(u.nextAvailableNumber(store.sequence), 51)
  const issued = { id: 'issued', number: 10, historical: false, createdAt: '2026-09-19', updatedAt: '2026-09-19', currentVersionId: 'v1',
    versions: [{ id: 'v1', issuedAt: '2026-09-19', content: structuredClone(store.drafts.first.content) }], history: [] }
  store = { ...store, invoices: { issued } }
  assert.deepEqual(parseStore(store), store)
  const original = structuredClone(issued)
  const draftsBeforeDirectoryEdit = structuredClone(store.drafts)
  store = u.saveClient(store, { name: 'Renamed client', billingAddress: 'New address', contactName: 'New contact',
    email: 'billing@example.com', phone: '555-1234', taxIdentifier: 'TAX-42' }, 'client', undefined, false)
  assert.deepEqual(store.drafts, draftsBeforeDirectoryEdit)
  assert.deepEqual(store.invoices.issued, original)
  for (const query of ['renamed', 'new address', 'new contact', 'billing@example', '555-1234', 'tax-42']) {
    assert.equal(searchClients(store, { query }).items[0].id, 'client')
  }
  store = u.saveClient(store, { name: 'Incomplete client' }, 'incomplete')
  assert.equal(store.clients.incomplete.billingAddress, '')
  assert.throws(() => u.saveClient(store, { name: '  ' }, 'invalid'))
  store = u.applyDefaults(store, 'copy', ['client'], 'client')
  assert.equal(store.drafts.copy.content.recipient.taxIdentifier, 'TAX-42')
  store = u.updateDraft(store, 'copy', { recipient: { address: 'Invoice-only address', email: 'invoice@example.com' } })
  assert.equal(store.clients.client.billingAddress, 'New address')
  assert.equal(store.clients.client.email, 'billing@example.com')
  assert.deepEqual(store.invoices.issued, original)
  store = u.startCorrection(store, 'issued', 'correction')
  store = u.updateDraft(store, 'correction', { notes: 'Correction work' })
  store = u.startCorrection(store, 'issued', 'unused')
  assert.equal(store.drafts.unused, undefined)
  assert.equal(store.drafts.correction.content.notes, 'Correction work')
  assert.deepEqual(store.invoices.issued, original)
  store = u.applyDefaults(store, 'correction', ['businessIdentity', 'template'])
  store = u.discardDraft(store, 'correction')
  assert.deepEqual(store.invoices.issued, original)
  assert.equal(invoiceDetails(store, 'issued').selectedVersion.id, 'v1')
  assert.equal(searchInvoices(store, { query: '10' }).total, 1)
  assert.equal(searchInvoices(store, { status: 'draft', limit: 1 }).nextCursor, '1')
  assert.equal(searchInvoices(store, { historicalOnly: true }).total, 0)
  const corrupted = structuredClone(store); corrupted.invoices.issued.versions[0].content.notes = 'changed'
  assert.throws(() => assertForwardTransition(store, corrupted))
  assert.throws(() => parseStore({ ...store, schemaVersion: 99 }))
  // No production browser storage or unguarded writes: all persistence uses this port.
  let disk = null, revision = 0, failBefore = false, loseAck = false, writes = 0, reads = 0
  const port = {
    async read() { reads++; return { value: structuredClone(disk), version: disk ? String(revision) : null } },
    async write(value, ifMatch) {
      writes++
      if (failBefore) { failBefore = false; throw new Error('Offline') }
      if (ifMatch !== (disk ? String(revision) : null)) return { ok: false, conflict: true, value: structuredClone(disk), version: String(revision) }
      disk = structuredClone(value); revision++
      if (loseAck) { loseAck = false; throw new Error('Acknowledgement lost') }
      return { ok: true, version: String(revision) }
    },
  }
  const a = new InvoiceRepository(port), b = new InvoiceRepository(port)
  await assert.rejects(a.initialize(), /shell bridge/)
  a.setEnabled(canUseInvoiceStorage(true, ['settings.app.get']))
  await assert.rejects(a.initialize(), /shell bridge/)
  assert.equal(reads, 0); assert.equal(writes, 0)
  a.setEnabled(canUseInvoiceStorage(true, storageMethods)); b.setEnabled(true)
  await Promise.all([a.initialize(), b.initialize()])
  const log = console.error; const errors = []
  console.error = (...args) => errors.push(args)
  try {
    let permissionGranted = false
    const denied = new InvoiceRepository({
      read: async () => {
        if (!permissionGranted) throw new Error('Missing permission "filesystem" for bridge method "storage.readJson"')
        return port.read()
      },
      write: port.write,
    })
    denied.setEnabled(true)
    const initialErrors = errors.length
    await assert.rejects(denied.initialize(), /Missing permission/)
    assert.equal(denied.getSnapshot().status, 'unavailable')
    assert.match(denied.getSnapshot().error, /Reopen PureInvoicing/)
    assert.equal(errors.length, initialErrors)
    assert.equal(writes, 0)
    permissionGranted = true
    await denied.retry()
    assert.equal(denied.getSnapshot().status, 'saved')
    failBefore = true
    await assert.rejects(a.transact(s => u.createDraft(s, undefined, undefined, 'recover')))
    assert.equal(a.getSnapshot().status, 'error'); assert.ok(a.getSnapshot().value.drafts.recover)
    await a.retry(); assert.ok(disk.drafts.recover)
    await b.transact(s => u.createDraft(s, undefined, undefined, 'other'))
    assert.ok(disk.drafts.recover && disk.drafts.other)
    await a.refresh()
    await a.transact(s => u.updateDraft(s, 'recover', { notes: 'Local A' }))
    await assert.rejects(b.transact(s => u.updateDraft(s, 'recover', { notes: 'Local B' })))
    assert.equal(b.getSnapshot().status, 'conflict')
    assert.equal(b.getSnapshot().value.drafts.recover.content.notes, 'Local B')
    assert.equal(b.getSnapshot().remote.drafts.recover.content.notes, 'Local A')
    await b.resolveConflicts({ 'drafts.recover': 'local' })
    assert.equal(disk.drafts.recover.content.notes, 'Local B')
    loseAck = true
    await assert.rejects(b.transact(s => u.createDraft(s, undefined, undefined, 'ack')))
    await b.retry()
    assert.equal(Object.keys(disk.drafts).filter(id => id === 'ack').length, 1)
    assert.equal(b.getSnapshot().status, 'saved')
    const c = new InvoiceRepository(port); c.setEnabled(true); await c.initialize()
    assert.deepEqual(c.getSnapshot().value, disk)
    const commands = createInvoiceCommands(c)
    const result = await commands.updateInvoiceDraft({ draftId: 'ack', changes: { currency: null, lineItems: [{ description: '', quantity: null, unitPrice: null }] } })
    assert.equal(result.saveStatus, 'saved'); assert.ok(result.calculation.diagnostics.length)
    assert.equal(result.calculation.warnings.length, 1)
    assert.equal(disk.drafts.ack.content.currency, null)
    await a.refresh(); await b.refresh()
    await a.transact(s => u.configureSequence(s, 100, true))
    await assert.rejects(b.transact(s => u.configureSequence(s, 50, true)))
    assert.equal(b.getSnapshot().status, 'conflict')
    await assert.rejects(b.resolveConflicts({ sequence: 'local' }), /cannot be reset/)
    assert.equal(disk.sequence.nextNumber, 100)
    await b.resolveConflicts({ sequence: 'remote' })
    assert.equal(b.getSnapshot().value.sequence.nextNumber, 100)
    const corruptRepo = new InvoiceRepository({ read: async () => ({ value: { broken: true }, version: 'bad' }), write: port.write })
    corruptRepo.setEnabled(true); const count = writes
    await assert.rejects(corruptRepo.initialize()); assert.equal(writes, count)
    assert.ok(errors.length > 0 && errors.every(args => args[1] instanceof Error))
  } finally { console.error = log }
  // Number patterns, terms, marks and stats.
  {
    const n = await load('numbering'), life = await load('lifecycle'), { archiveStats } = await load('stats'), money = await load('money')
    assert.equal(n.formatInvoiceNumber(4, 'PS-{YYYY}-{NNN}', '2026-09-19'), 'PS-2026-004')
    assert.equal(n.formatInvoiceNumber(42, 'INV{NNNN}'), 'INV0042')
    assert.equal(n.formatInvoiceNumber(7), '7')
    assert.equal(n.validateNumberPattern('PS-{YYYY}-{NNN}'), null)
    assert.ok(n.validateNumberPattern('PS-{YYYY}')); assert.ok(n.validateNumberPattern('{N}-{NN}')); assert.ok(n.validateNumberPattern('a{b}{N}'))
    assert.deepEqual(n.suggestNumberFormat('PS-2026-004'), { pattern: 'PS-{YYYY}-{NNN}', number: 4 })
    assert.deepEqual(n.suggestNumberFormat('INV0042'), { pattern: 'INV{NNNN}', number: 42 })
    assert.deepEqual(n.suggestNumberFormat('17'), { pattern: '{N}', number: 17 })
    assert.equal(n.suggestNumberFormat('no digits'), null)
    assert.ok(n.numberMatches('PS-2026-004', 4, '004') && n.numberMatches('PS-2026-004', 4, '4') && n.numberMatches('PS-2026-004', 4, 'ps-2026') && !n.numberMatches('PS-2026-004', 4, '40'))
    assert.equal(life.termsDueDate('2026-09-19', 15), '2026-10-04'); assert.equal(life.termsDueDate('2026-09-19', 0), '2026-09-19'); assert.equal(life.termsDueDate('2026-09-19', null), null)
    assert.equal(money.sumMoney(['15000.00', '8400.00', '0.01'], 'USD'), '23400.01'); assert.equal(money.sumMoney([], 'JPY'), '0'); assert.equal(money.formatMoney('15000.00', 'USD'), '$15,000.00')
    let s = emptyStore()
    s = u.updateBusiness(s, { name: 'Example Services Inc.', address: 'Example City', defaultTermsDays: 15 })
    s = u.configureSequence(s, 4, true)
    s = u.configureNumberFormat(s, 'PS-{YYYY}-{NNN}')
    assert.throws(() => u.configureNumberFormat(s, 'PS-{YYYY}'))
    s = u.createDraft(s, undefined, undefined, 'd1', '2026-09-19T10:00:00Z', '2026-09-19')
    assert.equal(s.drafts.d1.content.termsDays, 15); assert.equal(s.drafts.d1.content.dueDate, '2026-10-04')
    assert.equal(u.provisionalLabel(s, '2026-09-19'), 'PS-2026-004')
    s = u.updateDraft(s, 'd1', { invoiceDate: '2026-09-20' }); assert.equal(s.drafts.d1.content.dueDate, '2026-10-05')
    s = u.updateDraft(s, 'd1', { termsDays: 30 }); assert.equal(s.drafts.d1.content.dueDate, '2026-10-20')
    s = u.updateDraft(s, 'd1', { dueDate: '2026-12-01' }); assert.equal(s.drafts.d1.content.termsDays, null); assert.equal(s.drafts.d1.content.dueDate, '2026-12-01')
    s = u.saveClient(s, { name: 'Example Publishing', billingAddress: 'Example City', termsDays: 15, currency: 'EUR' }, 'c1', '2026-09-19T10:00:00Z')
    s = u.applyDefaults(s, 'd1', ['client'], 'c1')
    assert.equal(s.drafts.d1.content.termsDays, 15); assert.equal(s.drafts.d1.content.currency, 'EUR'); assert.equal(s.drafts.d1.currencyReviewRequired, true)
    assert.equal(parseStore(structuredClone(s)).drafts.d1.content.termsDays, 15)
    // An issued invoice keeps its label when the pattern changes; marks set its standing.
    const content = structuredClone(s.drafts.d1.content)
    content.recipient = { name: 'Example Publishing', address: 'Example City' }; content.currency = 'USD'; content.lineItems = [{ description: 'Work', quantity: 1, unitPrice: 15000 }]
    content.invoiceDate = '2026-09-02'; content.dueDate = '2026-09-17'; content.termsDays = 15
    s = u.reserveNumber(s, 4, false, '2026-09-02T10:00:00Z')
    s = { ...s, invoices: { ...s.invoices, i1: { id: 'i1', number: 4, numberText: 'PS-2026-004', historical: false, createdAt: '2026-09-02T10:00:00Z', updatedAt: '2026-09-02T10:00:00Z',
      currentVersionId: 'v1', versions: [{ id: 'v1', issuedAt: '2026-09-02T10:00:00Z', content }], history: [{ id: 'h1', at: '2026-09-02T10:00:00Z', kind: 'issued', versionId: 'v1' }] } } }
    s = parseStore(s)
    s = u.configureNumberFormat(s, 'X-{NN}')
    assert.equal(u.issuedLabel(s, s.invoices.i1), 'PS-2026-004'); assert.equal(u.provisionalLabel(s, '2026-09-19'), 'X-05')
    assert.throws(() => assertForwardTransition(s, { ...s, invoices: { i1: { ...s.invoices.i1, numberText: 'other' } } }), /immutable/)
    assert.equal(life.invoiceStanding(s.invoices.i1, '2026-09-19').mark, 'overdue'); assert.equal(life.invoiceStanding(s.invoices.i1, '2026-09-19').daysOverdue, 2)
    assert.equal(life.invoiceStanding(s.invoices.i1, '2026-09-10').mark, 'issued')
    s = life.applyMark(s, 'i1', { kind: 'sent', to: 'ap@publisher-c.example' }, '2026-09-03T10:00:00Z')
    assert.equal(life.invoiceStanding(s.invoices.i1, '2026-09-10').mark, 'sent')
    s = life.applyMark(s, 'i1', { kind: 'paid', at: '2026-09-14', reference: 'TEST-REFERENCE' }, '2026-09-14T10:00:00Z')
    assert.equal(life.invoiceStanding(s.invoices.i1, '2026-09-19').mark, 'paid'); assert.equal(s.invoices.i1.history.length, 3)
    assert.throws(() => life.applyMark(s, 'i1', { kind: 'paid', at: 'yesterday' }))
    assertForwardTransition(parseStore(structuredClone(s)), s)
    const stats = archiveStats(s, '2026-09-19')
    assert.equal(stats.byCurrency[0].currency, 'USD'); assert.equal(stats.byCurrency[0].invoiced, '15000.00'); assert.equal(stats.byCurrency[0].collected, '15000.00'); assert.equal(stats.byCurrency[0].outstanding, '0.00')
    assert.equal(stats.counts.paid, 1); assert.equal(stats.clients[0].averageDaysToPay, 12); assert.equal(stats.clients[0].name, 'Example Publishing')
    const found = searchInvoices(s, { status: 'paid' }); assert.equal(found.total, 1); assert.equal(found.items[0].numberText, 'PS-2026-004'); assert.equal(found.items[0].mark, 'paid')
    assert.equal(searchInvoices(s, { query: '004' }).total, 1); assert.equal(searchInvoices(s, { status: 'overdue' }).total, 0)
    s = life.applyMark(s, 'i1', { kind: 'clear', which: 'paid' }, '2026-09-19T10:00:00Z')
    assert.equal(searchInvoices(s, { status: 'overdue' }).total, 1); assert.equal(searchInvoices(s, { status: 'open' }).total, 1)
    assert.equal(invoiceDetails(s, 'i1').numberText, 'PS-2026-004'); assert.equal(invoiceDetails(s, 'i1').standing.mark, 'overdue')
    globalThis.__renumberBase = { ...s, invoices: { i1: { ...s.invoices.i1, numberText: 'X-1' }, i2: { ...s.invoices.i1, id: 'i2', number: 5, numberText: 'X-1' } }, sequence: { ...s.sequence, nextNumber: Math.max(s.sequence.nextNumber, 6), reservedNumbers: [...new Set([...s.sequence.reservedNumbers, 4, 5])] } }
  }
  // Renumbering a registered invoice: a new version carries the corrected label; the original keeps its own.
  {
    const rn = await load('renumber'), { parseStore: parse2, assertForwardTransition: forward } = await load('parse')
    let s = parse2(structuredClone(JSON.parse(JSON.stringify(globalThis.__renumberBase))))
    const [a, b] = Object.keys(s.invoices)
    assert.throws(() => rn.renumberRegistered(s, { invoiceId: a, numberText: 'X-9', reason: 'dup', content: s.invoices[a].versions[0].content, pdfAssetId: 'p' }), /Only registered/)
    s.invoices[a].historical = true; s.invoices[b].historical = true
    assert.equal(rn.duplicateNumbers(s).length, 1)
    assert.throws(() => rn.renumberRegistered(s, { invoiceId: b, numberText: 'X-9', reason: ' ', content: s.invoices[b].versions[0].content, pdfAssetId: 'p' }), /why/)
    const next = rn.renumberRegistered(s, { invoiceId: b, numberText: 'X-9', reason: 'Duplicated X-1.', content: s.invoices[b].versions[0].content, pdfAssetId: 'p' }, '2026-09-21T10:00:00Z')
    forward(s, next)
    assert.equal(next.invoices[b].versions.length, 2); assert.equal(next.invoices[b].versions[0].numberText, undefined); assert.equal(next.invoices[b].versions[1].numberText, 'X-9')
    assert.equal(rn.duplicateNumbers(next).length, 0); assert.match(next.invoices[b].history.at(-1).note, /X-1 → X-9/)
    assert.throws(() => rn.renumberRegistered(next, { invoiceId: a, numberText: 'X-9', reason: 'x', content: next.invoices[a].versions[0].content, pdfAssetId: 'p' }), /already used/)
    parse2(structuredClone(next))
  }
  // Agreements: draft → checks → send → sign → milestone invoices; retainers by month; contractor bills; the store guard.
  {
    const ag = await load('agreements'), up = await load('updates'), { emptyStore: fresh } = await load('defaults'), pz = await load('parse')
    let s = up.saveClient(fresh(), { name: 'Example Training, Inc.', billingAddress: 'NY', termsDays: 45, currency: 'USD' }, 'amp')
    s = { ...s, sequence: { ...s.sequence, format: { pattern: 'PS-{YYYY}-{NNN}' } } }
    s = ag.createAgreement(s, { kind: 'msa', direction: 'client', clientId: 'amp', registered: { numberText: 'PS-MSA-EXAMPLE', signedAt: '2020-01-01' } }, 'msa', '2026-09-01T10:00:00Z')
    assert.equal(s.agreements.msa.status, 'signed'); assert.equal(s.agreements.msa.sections.length, 0)
    s = ag.updateAgreement(s, 'msa', { paymentDays: 45 })
    s = ag.createAgreement(s, { kind: 'sow', direction: 'client', clientId: 'amp', parentId: 'msa' }, 'sow', '2026-09-01T10:00:00Z')
    let a = s.agreements.sow
    assert.equal(a.title, 'Statement of Work #1'); assert.equal(a.paymentDays, 45); assert.equal(a.fee.kind, 'fixed')
    assert.ok(ag.agreementChecks(s, a).some(c => c.level === 'block' && /placeholder/.test(c.message)))
    assert.throws(() => ag.sendAgreement(s, 'sow'), /Not ready/)
    s = ag.updateAgreement(s, 'sow', { fee: { kind: 'fixed', amount: 16000 }, endDate: '2026-12-31',
      sections: [{ heading: 'Scope of work', body: 'Workflows.' }, { heading: 'Acceptance', body: 'Accepted in 10 days.' }],
      milestones: [{ label: 'On signature', amount: 6400, trigger: 'signature' }, { label: 'Delivered', amount: 4800, trigger: 'done' }, { label: 'Accepted', amount: 4000, trigger: 'acceptance' }] })
    assert.ok(ag.agreementChecks(s, s.agreements.sow).some(c => c.level === 'block' && /add up/.test(c.message)))
    s = ag.updateAgreement(s, 'sow', { milestones: s.agreements.sow.milestones.map((m, i) => ({ id: m.id, label: m.label, amount: i === 2 ? 4800 : m.amount, trigger: m.trigger })) })
    assert.deepEqual(ag.agreementChecks(s, s.agreements.sow).filter(c => c.level === 'block'), [])
    const sent = ag.sendAgreement(s, 'sow', '2026-09-02T10:00:00Z')
    assert.equal(sent.agreements.sow.numberText, 'PS-SOW-2026-01'); assert.equal(ag.nextAgreementNumber(sent, 'sow', '2026-09-03'), 'PS-SOW-2026-02')
    assert.throws(() => ag.editSection(sent, 'sow', { sectionId: sent.agreements.sow.sections[0].id, body: 'x' }), /fixed/)
    assert.throws(() => pz.assertForwardTransition(sent, { ...sent, agreements: { ...sent.agreements, sow: { ...sent.agreements.sow, sections: [] } } }), /text is fixed/)
    s = ag.markSigned(sent, 'sow', { ours: { name: 'Alex Example', at: '2026-09-03' }, theirs: { name: 'Client', at: '2026-09-04' } })
    a = s.agreements.sow
    assert.equal(a.status, 'signed'); assert.equal(a.signedAt, '2026-09-04'); assert.equal(a.milestones[0].doneAt, '2026-09-04')
    assert.throws(() => ag.invoiceMilestone(s, 'sow', a.milestones[1].id), /not due/)
    s = ag.invoiceMilestone(s, 'sow', a.milestones[0].id, 'd1', '2026-09-05T10:00:00Z', '2026-09-05')
    const d1 = s.drafts.d1.content
    assert.equal(d1.clientId, 'amp'); assert.equal(d1.lineItems[0].unitPrice, 6400); assert.equal(d1.termsDays, 45); assert.equal(d1.dueDate, '2026-10-20'); assert.match(d1.reference, /PS-SOW-2026-01 · milestone 1/)
    assert.throws(() => ag.invoiceMilestone(s, 'sow', a.milestones[0].id), /already invoiced/)
    const bill = ag.agreementBilling(s, s.agreements.sow)
    assert.equal(bill.lines.length, 1); assert.equal(bill.lines[0].status, 'draft'); assert.equal(bill.invoiced, '0.00'); assert.equal(bill.toBill, '16000.00')
    assert.throws(() => pz.assertForwardTransition(s, { ...s, agreements: { ...s.agreements, sow: { ...s.agreements.sow, status: 'draft' } } }), /signed agreement/)
    pz.parseStore(structuredClone(s))
    // A retainer, billed by month once.
    s = ag.createAgreement(s, { kind: 'sow', direction: 'client', clientId: 'amp', title: 'Retainer' }, 'ret')
    s = ag.updateAgreement(s, 'ret', { fee: { kind: 'monthly', amount: 6000 }, startDate: '2026-07-01', sections: [{ heading: 'Scope', body: 'Monthly work.' }] })
    s = ag.markSigned(s, 'ret', { ours: { name: 'A', at: '2026-07-01' }, theirs: { name: 'B', at: '2026-07-01' } })
    assert.deepEqual(ag.unbilledPeriods(s.agreements.ret, '2026-09-21'), ['2026-07', '2026-08', '2026-09'])
    s = ag.invoicePeriod(s, 'ret', '2026-08', 'd2')
    assert.throws(() => ag.invoicePeriod(s, 'ret', '2026-08'), /already invoiced/)
    assert.deepEqual(ag.unbilledPeriods(s.agreements.ret, '2026-09-21'), ['2026-07', '2026-09'])
    // A contractor and their bills.
    s = ag.saveContractor(s, { name: 'Dev Co' }, 'dev')
    s = ag.createAgreement(s, { kind: 'contractor', direction: 'contractor', contractorId: 'dev' }, 'ica')
    s = ag.updateAgreement(s, 'ica', { fee: { kind: 'hourly', rate: 100, cap: 5000 }, endDate: '2026-12-31', sections: [{ heading: 'Services', body: 'Code.' }] })
    assert.throws(() => ag.addBill(s, 'ica', { reference: 'INV-1', period: '2026-09', amount: 100 }), /signed/)
    s = ag.markSigned(s, 'ica', { ours: { name: 'A', at: '2026-09-01' }, theirs: { name: 'Dev', at: '2026-09-01' } })
    let r = ag.addBill(s, 'ica', { reference: 'INV-1', period: '2026-09', hours: 40, amount: 4000 }); s = r.store
    assert.equal(ag.billCheck(s.agreements.ica, s.agreements.ica.bills[0]).level, 'ok')
    r = ag.addBill(s, 'ica', { reference: 'INV-2', period: '2026-09', hours: 20, amount: 2100 }); s = r.store
    assert.equal(ag.billCheck(s.agreements.ica, s.agreements.ica.bills[0]).level, 'ok', 'a later bill does not flag an earlier one')
    r = ag.addBill(s, 'ica', { reference: 'INV-3', period: '2026-09', hours: 1, amount: 100 }); s = r.store
    assert.match(ag.billCheck(s.agreements.ica, s.agreements.ica.bills[2]).message, /over the \$5,000\.00 cap/)
    assert.match(ag.billCheck(s.agreements.ica, s.agreements.ica.bills[1]).message, /agreed rate is \$2,000\.00/)
    s = ag.updateBill(s, 'ica', r.billId, { approvedOverCap: true, paidAt: '2026-09-20' })
    assert.throws(() => ag.invoiceMilestone(s, 'ica', 'x'), /Milestone not found/)
    assert.equal(ag.agreementRows(s, '2026-09-21').length, 4)
    pz.parseStore(structuredClone(s))
  }
  // Templates: make one from a finished SOW, fields and prompts replace its specifics; generate a new draft; shares split the fee exactly.
  {
    const ag = await load('agreements'), tp = await load('templates'), up = await load('updates'), { emptyStore: fresh } = await load('defaults'), pz = await load('parse')
    let s = up.saveClient(fresh(), { name: 'Example Training, Inc.', billingAddress: 'NY', termsDays: 30, currency: 'USD' }, 'amp')
    s = up.saveClient(s, { name: 'Example Publishing, Inc.', billingAddress: 'CA', termsDays: 15, currency: 'USD' }, 'sage')
    s = { ...s, business: { ...s.business, name: 'Example Services Inc.' } }
    s = ag.createAgreement(s, { kind: 'msa', direction: 'client', clientId: 'amp', registered: { numberText: 'MSA-EXAMPLE', signedAt: '2020-01-01' } }, 'msa')
    s = ag.updateAgreement(s, 'msa', { paymentDays: 45 })
    s = ag.createAgreement(s, { kind: 'sow', direction: 'client', clientId: 'amp', parentId: 'msa', title: 'Statement of Work #1 — Software Training Workshops' }, 'sow')
    s = ag.updateAgreement(s, 'sow', { fee: { kind: 'fixed', amount: 10000 }, sections: [
      { heading: 'Parties', body: 'Between Example Services Inc. and Example Training, Inc., under the MSA dated January 1, 2020.' },
      { heading: 'Scope of work', body: 'Workshops on workflow design use cases for Example Training, Inc.' },
      { heading: 'Fees', body: 'A fee of $10,000, payable within 45 days.' }],
      milestones: [{ label: 'On signature', amount: 4000, trigger: 'signature' }, { label: 'Prototype delivered', amount: 3000, trigger: 'done' }, { label: 'Summary accepted', amount: 3000, trigger: 'acceptance' }] })
    const found = tp.findSpecifics(s, 'sow', ['workflow design'])
    const texts = found.map(f => f.text)
    assert.ok(texts.includes('Example Training, Inc.') && texts.includes('January 1, 2020') && texts.includes('$10,000') && texts.includes('45 days') && texts.includes('Software Training Workshops') && texts.includes('workflow design'), JSON.stringify(texts))
    assert.equal(found.find(f => f.text === 'Example Services Inc.').suggestion.as, 'keep')
    s = tp.templateFromAgreement(s, 'sow', { name: 'Workshop series', choices: found.map(f => ({ text: f.text, becomes: f.text === 'workflow design' ? { as: 'prompt', label: 'the team or process' } : f.suggestion })) }, 'tpl')
    const t = s.templates.tpl
    assert.equal(t.title, 'Statement of Work #{{sequence}} — {{project}}')
    assert.match(t.sections[0].body, /Between Example Services Inc\. and \{\{party\}\}, under the MSA dated \{\{parentDate\}\}\./)
    assert.match(t.sections[1].body, /\[the team or process\] use cases for \{\{party\}\}/)
    assert.match(t.sections[2].body, /\{\{fee\}\}, payable within \{\{paymentDays\}\}/)
    assert.deepEqual(t.milestones.map(m => m.share), [40, 30, 30]); assert.equal(t.fee.amountField, 'fee'); assert.equal(t.paymentDays, 'parent')
    assert.match(t.origin, /Made from Statement of Work #1 with Example Training/)
    assert.deepEqual(tp.templateProblems(t), [])
    // Generate for Example Training with a new fee: fields fill, shares split exactly, one prompt left.
    const pv = tp.previewTemplate(s, t, { clientId: 'amp', parentId: 'msa', answers: { project: 'Agent rollout', fee: '16,001' } }, '2026-09-22')
    assert.equal(pv.title, 'Statement of Work #2 — Agent rollout'); assert.deepEqual(pv.milestones.map(m => m.amount), [6400.4, 4800.3, 4800.3]); assert.equal(pv.paymentDays, 45); assert.equal(pv.prompts, 1)
    s = tp.generateFromTemplate(s, 'tpl', { clientId: 'amp', parentId: 'msa', answers: { project: 'Agent rollout', fee: '16000' } }, 'gen', '2026-09-22T10:00:00Z')
    const g = s.agreements.gen
    assert.equal(g.status, 'draft'); assert.equal(g.fee.amount, 16000); assert.deepEqual(g.milestones.map(m => m.amount), [6400, 4800, 4800]); assert.equal(g.paymentDays, 45)
    assert.match(g.sections[0].body, /Example Training, Inc\., under the MSA dated January 1, 2020/); assert.match(g.sections[2].body, /\$16,000\.00, payable within 45 days/)
    assert.match(g.history[0].note, /template “Workshop series”/)
    assert.ok(ag.agreementChecks(s, g).some(c => c.level === 'block' && /placeholder/.test(c.message)), 'the prompt blocks sending')
    // Unanswered asked fields become placeholders; no parent means the client's terms.
    s = tp.generateFromTemplate(s, 'tpl', { clientId: 'sage' }, 'gen2')
    assert.match(s.agreements.gen2.title, /#1 — \[Project name\]/); assert.equal(s.agreements.gen2.paymentDays, 15)
    // Validation and defaults.
    assert.match(tp.templateProblems({ ...t, milestones: [{ label: 'A', share: 50, trigger: 'signature' }] }).join(' '), /add up to 50%/)
    assert.match(tp.templateProblems({ ...t, title: '{{nope}}' }).join(' '), /not a field/)
    const half = tp.saveTemplate(s, { ...t, milestones: [{ label: 'A', share: 50, trigger: 'signature' }] }, 'half')
    assert.throws(() => tp.generateFromTemplate(half, 'half', { clientId: 'amp' }), /needs attention/)
    assert.throws(() => tp.saveTemplate(s, { ...t, name: ' ' }), /name/)
    s = tp.saveTemplate(s, { ...tp.outlineTemplate('sow', 'client'), isDefault: true }, 'o1')
    s = tp.saveTemplate(s, { ...tp.outlineTemplate('sow', 'client', 'Other'), isDefault: true }, 'o2')
    assert.equal(s.templates.o1.isDefault, false); assert.equal(tp.templatesFor(s, 'sow', 'client')[0].id, 'o2')
    assert.deepEqual(tp.splitFee(100, [33.33, 33.33, 33.34]), [33.33, 33.33, 33.34])
    pz.parseStore(structuredClone(s))
  }
  // Bulk import: parse, plan, apply.
  {
    const imp = await load('importFormat')
    const bad = imp.parseImportDocument({ format: 'nope', invoices: [] })
    assert.equal(bad.document, null); assert.ok(bad.problems.some(p => p.where === 'format') && bad.problems.some(p => p.where === 'invoices'))
    const doc = { format: 'pure-invoicing/1', business: { name: 'Example Services Inc.', address: 'Example City', paymentInstructions: 'Bank', termsDays: 15 }, numberFormat: 'PS-{YYYY}-{NNN}',
      clients: [{ key: 'sage', name: 'Example Publishing', billingAddress: 'Example City', termsDays: 15, currency: 'USD' }],
      invoices: [
        { number: 2, label: 'PS-2026-002', client: 'sage', issuedAt: '2026-04-20', termsDays: 15, lines: [{ description: 'Workshop', quantity: 1, unitPrice: 15000 }], sentAt: '2026-04-20', paidAt: '2026-05-04', paidReference: 'ACH', pdf: 'pdfs/a.pdf', total: 15000 },
        { number: 4, client: { name: 'Book Sprints', address: 'Somewhere' }, issuedAt: '2026-09-02', dueAt: '2026-09-17', currency: 'USD', lines: [{ description: 'Days', quantity: 5, unitPrice: 1600 }], sentAt: '2026-09-02', total: 8100 },
      ] }
    const parsed = imp.parseImportDocument(JSON.stringify(doc)); assert.deepEqual(parsed.problems, []); assert.ok(parsed.document)
    let s = emptyStore()
    const plan = imp.planImport(s, parsed.document)
    assert.equal(plan.ok, true); assert.equal(plan.business, 'fill'); assert.deepEqual(plan.clients, { creating: ['Example Publishing'], linking: [] })
    assert.equal(plan.rows[0].label, 'PS-2026-002'); assert.equal(plan.rows[1].label, 'PS-2026-004'); assert.equal(plan.rows[0].standing, 'paid'); assert.equal(plan.rows[1].standing, 'sent')
    assert.equal(plan.rows[0].total, '15000.00'); assert.ok(plan.rows[1].warnings.some(w => /8000/.test(w))); assert.deepEqual(plan.counter, { before: 1, after: 5 })
    s = imp.applyImport(s, { document: parsed.document, plan, pdfAssets: { 'pdfs/a.pdf': 'asset1' }, now: '2026-09-19T10:00:00Z' })
    s = { ...s, assets: { asset1: { id: 'asset1', name: 'a.pdf', mimeType: 'application/pdf', readable: true } } }
    parseStore(structuredClone(s)); assertForwardTransition(emptyStore(), s)
    assert.equal(s.business.name, 'Example Services Inc.'); assert.equal(s.sequence.format.pattern, 'PS-{YYYY}-{NNN}'); assert.equal(s.sequence.nextNumber, 5); assert.deepEqual(s.sequence.reservedNumbers, [2, 4])
    const invoices = Object.values(s.invoices).sort((a, b) => a.number - b.number)
    assert.equal(invoices.length, 2); assert.equal(invoices[0].numberText, 'PS-2026-002'); assert.equal(invoices[0].historical, true); assert.equal(invoices[0].marks.paidAt, '2026-05-04'); assert.equal(invoices[0].historicalPdf.assetId, 'asset1')
    assert.equal(invoices[0].versions[0].content.dueDate, '2026-05-05'); assert.ok(invoices[0].versions[0].content.clientId); assert.equal(Object.values(s.clients)[0].name, 'Example Publishing')
    assert.equal(invoices[1].versions[0].content.clientId, undefined); assert.equal(invoices[1].versions[0].content.recipient.name, 'Book Sprints')
    assert.equal(searchInvoices(s, { status: 'paid' }).total, 1); assert.equal(searchInvoices(s, { status: 'overdue' }).total, 1)
    // A second run: conflicts refuse unless skipped; a new counter still lands.
    const again = imp.parseImportDocument({ ...doc, invoices: [doc.invoices[0], { number: 5, client: 'sage', issuedAt: '2026-09-10', lines: [{ description: 'More', unitPrice: 100 }] }] }).document
    assert.equal(imp.planImport(s, again).ok, false)
    const skipped = imp.planImport(s, again, { skipConflicts: true }); assert.equal(skipped.ok, true); assert.equal(skipped.counts.conflicts, 1); assert.equal(skipped.counts.importing, 1)
    s = imp.applyImport(s, { document: again, plan: skipped, now: '2026-09-19T11:00:00Z' })
    assert.equal(Object.keys(s.invoices).length, 3); assert.equal(s.sequence.nextNumber, 6); assert.equal(Object.keys(s.clients).length, 1)
    assert.throws(() => imp.applyImport(s, { document: again, plan: imp.planImport(s, again) }), /problems/)
  }
  console.log('Invoice domain: rounding, schemas, snapshots, defaults, archive, sequence, guarded conflicts, recovery and reload passed.')
} finally { await rm(temporary, { recursive: true, force: true }) }
