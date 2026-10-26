import assert from 'node:assert/strict'
import { readFile, readdir, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
// Proposals end to end against the production domain, a disk stand-in with injectable failures, and the registered agent handlers.
const dir = await mkdtemp(join(tmpdir(), 'invoice-proposals-'))
const originalError = console.error
try {
  await writeFile(join(dir, 'package.json'), '{"type":"module"}')
  const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replace(/(from\s+['"])(\.[^'"]+)(['"])/g, '$1$2.js$3').replace('@purescience/platform-ui/bridge/agentToolHelpers', '../../bridge/agentToolHelpers.js')
  for (const directory of ['src/lib/invoices', 'src/agents', 'src/agents/handlers']) {
    await mkdir(join(dir, directory), { recursive: true })
    for (const file of await readdir(directory)) {
      if (!file.endsWith('.ts') || file === 'workspace.ts') continue
      await writeFile(join(dir, directory, file.replace(/\.ts$/, '.js')), transpile(await readFile(`${directory}/${file}`, 'utf8')))
    }
  }
  await mkdir(join(dir, 'src/bridge'), { recursive: true })
  await writeFile(join(dir, 'src/bridge/invoiceStorageCapabilities.js'), transpile(await readFile('src/bridge/invoiceStorageCapabilities.ts', 'utf8')))
  await writeFile(join(dir, 'src/bridge/agentToolHelpers.js'), transpile(await readFile('node_modules/@purescience/platform-ui/src/bridge/agentToolHelpers.ts', 'utf8')))
  await writeFile(join(dir, 'src/lib/invoices/workspace.js'), 'export const invoiceCommands = globalThis.proposalTest.commands')
  const load = name => import(pathToFileURL(join(dir, `src/lib/invoices/${name}.js`)).href)
  const { parseStore } = await load('parse')
  const { InvoiceRepository } = await load('repository')
  const { createInvoiceCommands } = await load('commands')
  const { createProposalCommands } = await load('proposalCommands')
  const { calculateProposal } = await load('proposals')
  const { proposalHtml } = await load('proposalHtml')
  const { calculateInvoice } = await load('calculations')
  const { provisionalLabel } = await load('updates')
  // A spec-compliant HTML parser, from the workspace's own dependencies.
  const require = createRequire(join(process.cwd(), 'package.json'))
  const { parse } = await import(pathToFileURL(require.resolve('parse5')).href)

  // ── Disk stand-in: compare-and-swap writes, a failure before the write lands, and a lost acknowledgement after it lands.
  const fixture = JSON.parse(await readFile('tests/fixtures/workspace-before-proposals.json', 'utf8'))
  let disk = structuredClone(fixture), revision = 1, failBefore = false, loseAck = false
  const port = {
    read: async () => ({ value: structuredClone(disk), version: String(revision) }),
    write: async (value, ifMatch) => {
      if (failBefore) { failBefore = false; throw new Error('Disk unavailable before the write') }
      if (ifMatch !== String(revision)) return { ok: false, conflict: true, value: structuredClone(disk), version: String(revision) }
      disk = structuredClone(value); revision++
      if (loseAck) { loseAck = false; throw new Error('Acknowledgement lost after the write') }
      return { ok: true, version: String(revision) }
    },
  }
  const exports = []
  const saveHtml = async (fileName, html) => { exports.push({ fileName, html }); return { cancelled: false, path: `/exports/${fileName}` } }
  /** A fresh app session: a new repository that loads from disk, as after a restart. */
  async function session() {
    const repo = new InvoiceRepository(port); repo.setEnabled(true); await repo.initialize()
    return { repo, commands: { ...createInvoiceCommands(repo), ...createProposalCommands(repo, saveHtml) } }
  }
  console.error = () => {} // Expected failures below log through the repository.
  const invoiceSide = store => JSON.stringify({ invoices: store.invoices, drafts: store.drafts, sequence: store.sequence, clients: store.clients, publications: store.publications ?? {} })

  // ── Compatibility: the pre-proposal workspace loads unchanged, and its numbering is the same.
  assert.deepEqual(parseStore(structuredClone(fixture)), fixture)
  let { commands: ui } = await session()
  const before = invoiceSide(disk)
  assert.equal(provisionalLabel(disk, '2026-10-25'), 'PS-2026-007')
  assert.equal((await ui.getInvoice({ invoiceId: 'invoice-six' })).numberText, 'PS-2026-006')

  // ── Every field survives save and reload.
  const details = {
    title: 'Harbour website refresh', enquiry: 'Mere called: the site is slow on phones and the booking form fails.', enquiryDate: '2026-10-20',
    customer: { name: 'Harbour Trust', address: '22 Quay Street\nAuckland 1010', contactName: 'Mere Tane', email: 'mere@harbour.example', phone: '+64 9 555 0100', taxIdentifier: 'NZ-123-456' },
    scope: 'Rebuild the public pages for speed.\n\nFix the booking form.', deliverables: 'New templates\nWorking booking form', exclusions: 'Hosting and domain fees.',
    timing: 'Four weeks from acceptance.', items: [{ description: 'Design and build', quantity: 3, unitPrice: 1999.99 }, { description: 'Form fix', quantity: 1.5, unitPrice: 0.1 }],
    currency: 'NZD', paymentTerms: '50% on acceptance, the rest on delivery.', paymentTermsDays: 20,
  }
  const created = await ui.createProposal({ details })
  const id = created.id, v1 = created.latestVersionId
  assert.equal(created.status, 'draft')
  ;({ commands: ui } = await session())
  let read = await ui.getProposal({ proposalId: id })
  assert.deepEqual(read.version.content, details)
  assert.equal(read.version.status, 'draft'); assert.equal(read.status, 'draft')
  // Copying a directory client is explicit and fills customer, currency and terms; the client record is not touched.
  const fromClient = await ui.createProposal({ clientId: 'client-harbour', details: { title: 'Support retainer' } })
  assert.deepEqual(fromClient.version.content.customer, { name: 'Harbour Trust', address: '22 Quay Street\nAuckland 1010', contactName: 'Mere Tane', email: 'mere@harbour.example', taxIdentifier: 'NZ-123-456' })
  assert.equal(fromClient.version.content.currency, 'NZD'); assert.equal(fromClient.version.content.paymentTermsDays, 20); assert.equal(fromClient.version.content.clientId, 'client-harbour')
  await ui.updateProposal({ proposalId: fromClient.id, changes: { customer: { name: 'Harbour Trust (Events)' } } })
  assert.equal(disk.clients['client-harbour'].name, 'Harbour Trust')

  // ── Money: exact decimal arithmetic, rounded once to each currency's precision. Each case defeats binary floating point.
  const money = (currency, items) => { const c = calculateProposal({ ...read.version.content, currency, items: items.map(([quantity, unitPrice]) => ({ description: 'x', quantity, unitPrice })) }); return [...c.lines.map(l => l.amount), c.total] }
  assert.equal(0.1 * 3, 0.30000000000000004); assert.equal(1.15 * 3, 3.4499999999999997); assert.equal((1.005).toFixed(2), '1.00'); assert.equal(0.07 * 100, 7.000000000000001)
  assert.deepEqual(money('USD', [[3, 0.1]]), ['0.30', '0.30'])
  assert.deepEqual(money('USD', [[1, 1.005], [1, 1.005]]), ['1.01', '1.01', '2.02'])
  assert.deepEqual(money('USD', [[3, 1.15], [3, 19.99]]), ['3.45', '59.97', '63.42'])
  assert.deepEqual(money('EUR', [[100, 0.07], [1, 2.675]]), ['7.00', '2.68', '9.68'])
  assert.deepEqual(money('NZD', [[3, 1999.99], [1.5, 0.1]]), ['5999.97', '0.15', '6000.12'])
  assert.deepEqual(money('JPY', [[1, 2.5], [3, 0.5], [1234, 1.1]]), ['3', '2', '1357', '1362'])
  assert.deepEqual(money('KWD', [[1, 0.0005], [1, 1.0005], [3, 0.1]]), ['0.001', '1.001', '0.300', '1.302'])
  assert.deepEqual(money('BHD', [[3, 0.0145]]), ['0.044', '0.044'])
  // Every currency the app offers, by its precision: 0.1 × 3 and 1.005 + 2.675 written out per precision.
  const expected = { 0: ['0', '1', '3', '4'], 2: ['0.30', '1.01', '2.68', '3.99'], 3: ['0.300', '1.005', '2.675', '3.980'] }
  const { supportedCurrencies } = await load('defaults')
  for (const currency of supportedCurrencies) {
    const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits
    assert.deepEqual(money(currency, [[3, 0.1], [1, 1.005], [1, 2.675]]), expected[digits], currency)
  }
  assert.ok(supportedCurrencies.length > 100)
  assert.deepEqual(money('ISK', [[0.5, 3]]), ['2', '2'])
  read = await ui.getProposal({ proposalId: id })
  assert.deepEqual(read.version.calculation.lines.map(l => l.amount), ['5999.97', '0.15'])
  assert.equal(read.version.calculation.total, '6000.12')
  assert.ok(calculateProposal({ ...details, items: [{ description: 'x', quantity: 0, unitPrice: 1 }] }).diagnostics.some(d => d.field === 'items.0.quantity'))

  // ── Versions: an offer is fixed; later edits make a distinct draft version; acceptance records the exact offered version.
  await assert.rejects(ui.setProposalStatus({ proposalId: id, versionId: v1, status: 'accepted' }), /Only an offered version/)
  const offered = await ui.setProposalStatus({ proposalId: id, versionId: v1, status: 'offered' })
  assert.equal(offered.status, 'offered'); assert.equal(offered.version.status, 'offered'); assert.ok(offered.version.offeredAt)
  const offeredSnapshot = structuredClone(disk.proposals[id].versions[0])
  ;({ commands: ui } = await session())
  assert.equal((await ui.getProposal({ proposalId: id })).version.status, 'offered')
  const revised = await ui.updateProposal({ proposalId: id, changes: { customer: { name: 'Harbour Trust Board', email: 'board@harbour.example' }, items: [{ description: 'Design and build', quantity: 2, unitPrice: 1999.99 }], timing: 'Six weeks.' } })
  const v2 = revised.latestVersionId
  assert.notEqual(v2, v1); assert.equal(revised.versions.length, 2)
  assert.deepEqual(revised.versions.map(v => [v.number, v.status]), [[1, 'offered'], [2, 'draft']])
  assert.deepEqual(disk.proposals[id].versions[0], offeredSnapshot)
  assert.equal(disk.proposals[id].versions[0].content.customer.name, 'Harbour Trust')
  assert.equal(disk.proposals[id].versions[1].basedOnVersionId, v1)
  await ui.updateProposal({ proposalId: id, changes: { exclusions: 'Hosting, domain fees and photography.' } })
  assert.equal(disk.proposals[id].versions.length, 2, 'a draft version takes edits in place')
  assert.deepEqual(disk.proposals[id].versions[0], offeredSnapshot)
  // An offered version cannot be rewritten even by a direct store write.
  const { repo: raw } = await session()
  await assert.rejects(raw.transact(s => { s.proposals[id].versions[0].content.scope = 'changed'; return s }), /offered; its content is fixed/)
  await assert.rejects(raw.transact(s => { s.proposals[id].versions[0].status = 'draft'; return s }), /Invalid invoice store|cannot be undone/)
  ;({ commands: ui } = await session())
  await assert.rejects(ui.setProposalStatus({ proposalId: id, versionId: v1, status: 'offered' }).then(() => ui.setProposalStatus({ proposalId: id, versionId: v2, status: 'accepted' })), /Only an offered version/)
  await ui.setProposalStatus({ proposalId: id, versionId: v2, status: 'offered' })
  const accepted = await ui.setProposalStatus({ proposalId: id, versionId: v2, status: 'accepted' })
  assert.equal(accepted.acceptedVersionId, v2); assert.equal(accepted.status, 'accepted')
  await assert.rejects(ui.setProposalStatus({ proposalId: id, versionId: v1, status: 'accepted' }), /already the accepted one/)
  await assert.rejects(ui.updateProposal({ proposalId: id, changes: { title: 'late change' } }), /accepted, so this proposal is settled/)
  ;({ commands: ui } = await session())
  read = await ui.getProposal({ proposalId: id, versionId: v1 })
  assert.equal(read.acceptedVersionId, v2); assert.equal(read.status, 'accepted')
  assert.deepEqual(read.versions.map(v => [v.id, v.status]), [[v1, 'offered'], [v2, 'accepted']])
  assert.deepEqual(read.version.content, offeredSnapshot.content)
  assert.equal(read.version.content.customer.name, 'Harbour Trust')
  assert.equal((await ui.getProposal({ proposalId: id, versionId: v2 })).version.content.customer.name, 'Harbour Trust Board')

  // ── Export: a standalone page for the selected version, parsed; the person's markup stays text.
  const hostile = await ui.createProposal({ details: {
    title: '</title><script>alert(1)</script>', enquiry: '', customer: { name: '<script>alert("c")</script>', address: '<img src=x onerror=alert(2)>', email: '"><svg onload=alert(3)>' },
    scope: '<iframe src="javascript:alert(4)"></iframe>', deliverables: '<a href="javascript:alert(5)" onclick="x()">link</a>', exclusions: "' onmouseover='alert(6)",
    timing: '<style>body{display:none}</style>', items: [{ description: '<b onclick=alert(7)>Bold</b> & co', quantity: 2, unitPrice: 0.1 }], currency: 'EUR',
    paymentTerms: '<meta http-equiv="refresh" content="0;url=https://example.test">', paymentTermsDays: 7 } })
  const exported = await ui.exportProposal({ proposalId: hostile.id, versionId: hostile.latestVersionId })
  assert.equal(exported.status, 'saved'); assert.equal(exported.path, `/exports/${exported.fileName}`); assert.match(exported.fileName, /\.html$/)
  const elements = [], texts = []
  const walk = node => {
    if (node.nodeName === '#text') texts.push(node.value)
    else if (node.tagName) elements.push(node)
    for (const child of node.childNodes ?? []) walk(child)
    if (node.content) walk(node.content)
  }
  const pageOf = html => { elements.length = 0; texts.length = 0; walk(parse(html)); return { elements: [...elements], text: texts.join(' ') } }
  const allowed = new Set(['html', 'head', 'meta', 'title', 'style', 'body', 'main', 'header', 'section', 'footer', 'div', 'h1', 'h2', 'p', 'br', 'b', 'span', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td'])
  const allowedAttributes = new Set(['lang', 'charset', 'name', 'content', 'http-equiv', 'class', 'data-field', 'colspan'])
  const page = pageOf(exports.at(-1).html)
  for (const element of page.elements) {
    assert.ok(allowed.has(element.tagName), `unexpected <${element.tagName}>`)
    for (const attribute of element.attrs) {
      assert.ok(allowedAttributes.has(attribute.name), `unexpected attribute ${attribute.name}`)
      assert.ok(!/^on/i.test(attribute.name) && !/javascript:|refresh/i.test(attribute.value), `unsafe attribute ${attribute.name}=${attribute.value}`)
    }
  }
  assert.equal(page.elements.filter(e => e.tagName === 'style').length, 1)
  assert.equal(page.elements.filter(e => e.tagName === 'meta' && e.attrs.some(a => a.name === 'http-equiv')).length, 1, 'only the content policy')
  for (const value of ['</title><script>alert(1)</script>', '<script>alert("c")</script>', '<img src=x onerror=alert(2)>', '"><svg onload=alert(3)>', '<iframe src="javascript:alert(4)"></iframe>',
    '<a href="javascript:alert(5)" onclick="x()">link</a>', "' onmouseover='alert(6)", '<style>body{display:none}</style>', '<b onclick=alert(7)>Bold</b> & co', '<meta http-equiv="refresh" content="0;url=https://example.test">']) {
    assert.ok(page.text.includes(value), `shown as text: ${value}`)
  }
  // The accepted proposal's exported version 1 carries version 1's content, not the latest.
  const diskBeforeExport = JSON.stringify(disk)
  await ui.exportProposal({ proposalId: id, versionId: v1 })
  assert.equal(JSON.stringify(disk), diskBeforeExport, 'exporting writes nothing to the workspace')
  const field = (pageObject, name) => { const found = []; const visit = node => { if (node.attrs?.some(a => a.name === 'data-field' && a.value === name)) found.push(node); for (const c of node.childNodes ?? []) visit(c) }; visit(parse(pageObject)); const t = []; const text = n => { if (n.nodeName === '#text') t.push(n.value); for (const c of n.childNodes ?? []) text(c) }; found.forEach(text); return t.join(' ').replace(/\s+/g, ' ').trim() }
  const v1Html = exports.at(-1).html
  assert.match(field(v1Html, 'customer'), /Harbour Trust 22 Quay Street Auckland 1010 Attn\. Mere Tane mere@harbour\.example \+64 9 555 0100 Tax ID NZ-123-456/)
  assert.doesNotMatch(field(v1Html, 'customer'), /Board/)
  assert.equal(field(v1Html, 'scope'), 'Scope Rebuild the public pages for speed. Fix the booking form.')
  assert.equal(field(v1Html, 'deliverables'), 'Deliverables New templates Working booking form')
  assert.equal(field(v1Html, 'exclusions'), 'Not included Hosting and domain fees.')
  assert.equal(field(v1Html, 'timing'), 'Timing Four weeks from acceptance.')
  assert.equal(field(v1Html, 'items'), 'Prices Item Qty Unit price Amount (NZD) Design and build 3 1,999.99 5,999.97 Form fix 1.5 0.10 0.15 Total NZD 6,000.12')
  assert.equal(field(v1Html, 'total'), 'NZD 6,000.12')
  assert.equal(field(v1Html, 'currency'), 'NZD')
  assert.equal(field(v1Html, 'paymentTerms'), 'Payment terms 50% on acceptance, the rest on delivery. Invoices are due 20 days after the invoice date.')
  assert.match(field(v1Html, 'status'), /^Offered · offered \d{4}-\d{2}-\d{2}$/)
  assert.doesNotMatch(v1Html, /Mere called/, 'the enquiry notes stay internal')
  const v2Html = proposalHtml(disk, disk.proposals[id], v2)
  assert.match(field(v2Html, 'customer'), /^Prepared for Harbour Trust Board /); assert.equal(field(v2Html, 'timing'), 'Timing Six weeks.')

  // ── No invoice from saving, exporting, offering or accepting; nothing consumed from the counter.
  assert.equal(invoiceSide(disk), before)
  assert.deepEqual(disk.sequence, fixture.sequence); assert.deepEqual(disk.invoices, fixture.invoices); assert.deepEqual(disk.drafts, fixture.drafts)
  assert.equal(provisionalLabel(disk, '2026-10-25'), 'PS-2026-007')

  // ── Conversion: only the accepted version, explicitly; a matching unnumbered draft.
  await assert.rejects(ui.convertProposalToInvoice({ proposalId: id, versionId: v1 }), /Only the accepted version becomes an invoice\. Version 1 is offered/)
  await assert.rejects(ui.convertProposalToInvoice({ proposalId: hostile.id, versionId: hostile.latestVersionId }), /Version 1 is draft/)
  const declined = await ui.createProposal({ details: { ...details, title: 'Declined one' } })
  await ui.setProposalStatus({ proposalId: declined.id, versionId: declined.latestVersionId, status: 'offered' })
  await ui.setProposalStatus({ proposalId: declined.id, versionId: declined.latestVersionId, status: 'declined' })
  await assert.rejects(ui.convertProposalToInvoice({ proposalId: declined.id, versionId: declined.latestVersionId }), /Version 1 is declined/)
  assert.deepEqual(disk.drafts, fixture.drafts)
  const converted = await ui.convertProposalToInvoice({ proposalId: id, versionId: v2 })
  assert.equal(converted.created, true); assert.equal(converted.invoiceStatus, 'draft'); assert.equal(converted.versionId, v2)
  const invoice = await ui.getInvoice({ invoiceId: converted.invoiceId })
  const accept = disk.proposals[id].versions[1].content
  assert.equal(invoice.status, 'draft'); assert.equal(invoice.number ?? null, null)
  assert.deepEqual(invoice.content.recipient, { name: 'Harbour Trust Board', address: '22 Quay Street\nAuckland 1010', contactName: 'Mere Tane', email: 'board@harbour.example', phone: '+64 9 555 0100', taxIdentifier: 'NZ-123-456' })
  assert.equal(invoice.content.currency, 'NZD')
  assert.deepEqual(invoice.content.lineItems, [{ description: 'Design and build', quantity: 2, unitPrice: 1999.99 }])
  assert.equal(invoice.content.termsDays, 20)
  assert.equal(invoice.content.dueDate, new Date(Date.parse(`${invoice.content.invoiceDate}T00:00:00Z`) + 20 * 864e5).toISOString().slice(0, 10))
  assert.equal(invoice.content.notes, 'Payment terms: 50% on acceptance, the rest on delivery.')
  assert.equal(invoice.content.reference, 'Harbour website refresh')
  assert.equal(invoice.content.sender.name, 'Pure Science Ltd'); assert.equal(invoice.content.paymentInstructions, 'Bank transfer to 12-3456-7890123-00')
  const invoiceMoney = calculateInvoice(invoice.content), offerMoney = calculateProposal(accept)
  assert.deepEqual(invoiceMoney.lines.map(l => l.total), offerMoney.lines.map(l => l.amount)); assert.equal(invoiceMoney.total, offerMoney.total); assert.equal(invoiceMoney.total, '3999.98')
  assert.equal(disk.drafts[converted.invoiceId].currencyReviewRequired, false)
  assert.deepEqual(disk.drafts[converted.invoiceId].proposalSource, { proposalId: id, versionId: v2 })
  // The existing draft rules: unnumbered, the next label provisional, the counter untouched until issue.
  assert.deepEqual(disk.sequence, fixture.sequence); assert.deepEqual(disk.invoices, fixture.invoices)
  assert.equal(converted.provisionalNumberText, provisionalLabel(disk, invoice.content.invoiceDate)); assert.match(converted.provisionalNumberText, /^PS-\d{4}-007$/)
  assert.equal(invoice.provisionalNumberText, converted.provisionalNumberText)
  assert.deepEqual(disk.drafts['draft-open'], fixture.drafts['draft-open'])

  // ── Repeats return the same invoice, in the same session and after reload.
  const again = await ui.convertProposalToInvoice({ proposalId: id, versionId: v2 })
  assert.equal(again.invoiceId, converted.invoiceId); assert.equal(again.created, false)
  ;({ commands: ui } = await session())
  assert.equal((await ui.convertProposalToInvoice({ proposalId: id, versionId: v2 })).invoiceId, converted.invoiceId)
  assert.equal(Object.values(disk.drafts).filter(d => d.proposalSource?.proposalId === id).length, 1)
  assert.equal((await ui.getProposal({ proposalId: id })).invoice.invoiceId, converted.invoiceId)

  // ── Persistence failures: the accepted proposal is kept and a retry makes exactly one invoice.
  async function acceptedProposal(title) {
    const p = await ui.createProposal({ details: { ...details, title } })
    await ui.setProposalStatus({ proposalId: p.id, versionId: p.latestVersionId, status: 'offered' })
    await ui.setProposalStatus({ proposalId: p.id, versionId: p.latestVersionId, status: 'accepted' })
    return { id: p.id, versionId: p.latestVersionId }
  }
  const failing = await acceptedProposal('Write fails')
  const draftsBefore = Object.keys(disk.drafts).length
  failBefore = true
  await assert.rejects(ui.convertProposalToInvoice({ proposalId: failing.id, versionId: failing.versionId }), /Disk unavailable/)
  assert.equal(Object.keys(disk.drafts).length, draftsBefore)
  assert.equal(disk.proposals[failing.id].acceptedVersionId, failing.versionId); assert.equal(disk.proposals[failing.id].versions[0].status, 'accepted'); assert.equal(disk.proposals[failing.id].conversion, undefined)
  ;({ commands: ui } = await session())
  const retried = await ui.convertProposalToInvoice({ proposalId: failing.id, versionId: failing.versionId })
  assert.equal(retried.created, true)
  assert.equal((await ui.convertProposalToInvoice({ proposalId: failing.id, versionId: failing.versionId })).invoiceId, retried.invoiceId)
  assert.equal(Object.keys(disk.drafts).length, draftsBefore + 1)
  const lost = await acceptedProposal('Acknowledgement lost')
  loseAck = true
  const recovered = await ui.convertProposalToInvoice({ proposalId: lost.id, versionId: lost.versionId })
  assert.equal(disk.proposals[lost.id].conversion.invoiceId, recovered.invoiceId)
  ;({ commands: ui } = await session())
  assert.equal((await ui.convertProposalToInvoice({ proposalId: lost.id, versionId: lost.versionId })).invoiceId, recovered.invoiceId)
  assert.equal(Object.keys(disk.drafts).length, draftsBefore + 2)
  assert.equal(Object.values(disk.drafts).filter(d => d.proposalSource?.proposalId === lost.id).length, 1)
  // A discarded conversion draft is replaced by a fresh one, linked in its place; the link never points nowhere.
  await ui.discardInvoiceDraft({ draftId: recovered.invoiceId })
  assert.equal((await ui.getProposal({ proposalId: lost.id })).invoice.status, 'missing')
  const remade = await ui.convertProposalToInvoice({ proposalId: lost.id, versionId: lost.versionId })
  assert.notEqual(remade.invoiceId, recovered.invoiceId); assert.equal(remade.created, true)
  assert.deepEqual(disk.sequence, fixture.sequence, 'conversions use no number')

  // ── Agent tools: the registered handlers, the same records and rules.
  ;({ commands: ui } = await session())
  globalThis.proposalTest = { commands: ui }
  const { appAgentHandlers } = await import(pathToFileURL(join(dir, 'src/agents/handlers/index.js')).href)
  const { APP_AGENT_TOOL_NAMES } = await import(pathToFileURL(join(dir, 'src/agents/catalog.js')).href)
  const manifest = JSON.parse(await readFile('plugin.json', 'utf8'))
  const proposalTools = ['listProposals', 'getProposal', 'createProposal', 'updateProposal', 'setProposalStatus', 'exportProposal', 'convertProposalToInvoice']
  for (const name of proposalTools) {
    assert.ok(APP_AGENT_TOOL_NAMES.includes(name) && typeof appAgentHandlers[name] === 'function', name)
    assert.equal(manifest.app.agents.tools.find(t => t.name === name).requiresApproval, !['listProposals', 'getProposal'].includes(name))
  }
  const tool = async (name, args) => {
    const result = await appAgentHandlers[name]({ arguments: args })
    assert.equal(typeof result.content, 'string')
    return result.isError ? { error: result.content } : JSON.parse(result.content)
  }
  const made = await tool('createProposal', { clientId: 'client-harbour', details: { title: 'Agent offer', scope: 'Audit', items: [{ description: 'Audit day', quantity: 2, unitPrice: 1.005 }] } })
  assert.equal(made.status, 'draft'); assert.equal(made.customer, 'Harbour Trust'); assert.equal(made.version.total, '2.01'); assert.equal(made.version.currency, 'NZD')
  ;({ commands: ui } = await session())
  assert.equal((await ui.getProposal({ proposalId: made.id })).version.content.scope, 'Audit', 'the screen reads what the agent wrote')
  const agentV1 = made.latestVersionId
  assert.match((await tool('updateProposal', { proposalId: made.id, changes: { number: 7 } })).error, /unknown field/)
  assert.match((await tool('setProposalStatus', { proposalId: made.id, versionId: agentV1, status: 'draft' })).error, /unsupported value/)
  assert.match((await tool('convertProposalToInvoice', { proposalId: made.id, versionId: agentV1 })).error, /Only the accepted version/)
  assert.equal((await tool('setProposalStatus', { proposalId: made.id, versionId: agentV1, status: 'offered' })).version.status, 'offered')
  const agentRevised = await tool('updateProposal', { proposalId: made.id, changes: { timing: 'Next week' } })
  const agentV2 = agentRevised.latestVersionId
  assert.notEqual(agentV2, agentV1); assert.deepEqual(agentRevised.versions.map(v => v.status), ['offered', 'draft'])
  assert.equal((await ui.getProposal({ proposalId: made.id, versionId: agentV1 })).version.content.timing, '', 'the agent edit left the offer as it was')
  const listed = await tool('listProposals', { status: 'offered', query: 'agent' })
  assert.deepEqual(listed.proposals.map(p => p.id), [made.id])
  const got = await tool('getProposal', { proposalId: made.id, versionId: agentV1 })
  assert.deepEqual(got.version.content, (await ui.getProposal({ proposalId: made.id, versionId: agentV1 })).version.content)
  const agentExport = await tool('exportProposal', { proposalId: made.id, versionId: agentV1 })
  assert.equal(agentExport.status, 'saved'); assert.equal(agentExport.versionNumber, 1)
  assert.ok(pageOf(exports.at(-1).html).text.includes('Audit day'))
  assert.match((await tool('setProposalStatus', { proposalId: made.id, versionId: agentV2, status: 'accepted' })).error, /Only an offered version/)
  assert.equal((await tool('setProposalStatus', { proposalId: made.id, versionId: agentV1, status: 'accepted' })).acceptedVersionId, agentV1)
  const draftCount = Object.keys(disk.drafts).length
  const first = await tool('convertProposalToInvoice', { proposalId: made.id, versionId: agentV1 })
  const second = await tool('convertProposalToInvoice', { proposalId: made.id, versionId: agentV1 })
  assert.equal(second.invoiceId, first.invoiceId); assert.equal(first.created, true); assert.equal(second.created, false)
  assert.equal(Object.keys(disk.drafts).length, draftCount + 1)
  ;({ commands: ui } = await session())
  assert.equal((await ui.convertProposalToInvoice({ proposalId: made.id, versionId: agentV1 })).invoiceId, first.invoiceId, 'the screen finds the agent’s conversion')
  const agentInvoice = await ui.getInvoice({ invoiceId: first.invoiceId })
  assert.deepEqual(agentInvoice.content.lineItems, [{ description: 'Audit day', quantity: 2, unitPrice: 1.005 }])
  assert.equal(agentInvoice.calculation.total, '2.01'); assert.equal(agentInvoice.content.currency, 'NZD')
  assert.deepEqual(disk.sequence, fixture.sequence); assert.deepEqual(disk.invoices, fixture.invoices)
  console.error = originalError
  console.log('Proposals: fields and status across reload, currency precision with float-defeating inputs, fixed offers and new draft versions, exact acceptance, parsed safe HTML export, no invoice before explicit conversion, idempotent conversion across reload and write failures, unchanged invoice numbering, and the registered agent tools passed.')
} finally {
  console.error = originalError
  await rm(dir, { recursive: true, force: true })
}
