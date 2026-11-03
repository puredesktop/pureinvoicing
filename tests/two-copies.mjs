import assert from 'node:assert/strict'
import { readFile, readdir, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import ts from 'typescript'
/**
 * Two running copies of PureInvoicing (a tab and a mini app) over one file: two real
 * InvoiceRepository instances, each with its own memory, against one fake shell store that
 * behaves as the shell's does (a content version, ifMatch checked at write). Every scenario
 * runs and reports, so a run on older code shows exactly which ones fail.
 */
const dir = await mkdtemp(join(tmpdir(), 'invoice-two-copies-'))
const failures = []
const quiet = console.error
try {
  await writeFile(join(dir, 'package.json'), '{"type":"module"}')
  await mkdir(join(dir, 'src/lib/invoices'), { recursive: true }); await mkdir(join(dir, 'src/bridge'), { recursive: true })
  const stubbed = new Set(['workspace.ts', 'assets.ts', 'rendering.ts', 'presentation.ts'])
  const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replace(/(from\s+['"])(\.[^'"]+)(['"])/g, '$1$2.js$3')
  for (const file of await readdir('src/lib/invoices')) {
    if (!file.endsWith('.ts') || stubbed.has(file)) continue
    await writeFile(join(dir, 'src/lib/invoices', file.replace(/\.ts$/, '.js')), compile(await readFile(`src/lib/invoices/${file}`, 'utf8')))
  }
  await writeFile(join(dir, 'src/bridge/invoiceStorageCapabilities.js'), compile(await readFile('src/bridge/invoiceStorageCapabilities.ts', 'utf8')))
  const render = async (repo, content, number) => {
    const id = createHash('sha256').update(JSON.stringify({ content, number })).digest('hex')
    const document = { id, htmlAssetId: 'html', pdfAssetId: 'pdf', pageCount: 1 }
    await repo.guardedTransact(s => ({ ...s, documents: { ...s.documents, [id]: document } }))
    return { canFinalize: true, document, pages: [{ pageNumber: 1, diagnostics: [], text: 'Page' }], pageCount: 1, diagnostics: [] }
  }
  globalThis.twoCopies = {
    digest: async bytes => createHash('sha256').update(bytes).digest('hex'),
    readRetainedAsset: async () => ({ base64: 'pdf' }), importInvoiceAsset: async () => {}, renderInvoice: render, requirePrintableInvoice: render,
    exportInvoiceBytes: async () => ({ cancelled: true }),
  }
  await writeFile(join(dir, 'src/lib/invoices/assets.js'), 'export const {digest,readRetainedAsset,importInvoiceAsset} = globalThis.twoCopies')
  await writeFile(join(dir, 'src/lib/invoices/rendering.js'), 'export const {renderInvoice,requirePrintableInvoice} = globalThis.twoCopies')
  await writeFile(join(dir, 'src/lib/invoices/presentation.js'), `export const presentationDiagnostics = () => []
export const fontDiagnostics = () => []
export const invoiceHtml = () => ''
export const embeddedFontCss = ''
export const escapeHtml = text => String(text ?? '')`)
  await writeFile(join(dir, 'src/bridge/platformBridge.js'), 'export const {exportInvoiceBytes} = globalThis.twoCopies; export const printInvoiceDocument = async () => {}; export const readPrintedPdf = async () => \'\'; export const writeAgreementPrintFile = async () => \'\'')
  const load = name => import(pathToFileURL(join(dir, `src/lib/invoices/${name}.js`)))
  const { emptyStore } = await load('defaults'), u = await load('updates'), ag = await load('agreements')
  const { InvoiceRepository } = await load('repository'), { createFinalizationCommands } = await load('finalization')
  const { createPresentationCommands } = await load('presentationCommands'), { createInvoiceCommands } = await load('commands')
  const { createAgreementCommands } = await load('agreementCommands')
  const { parseStore } = await load('parse')

  /** The shell's store for one file: JSON on disk, a version from its content, ifMatch checked at write. */
  function sharedFile(initial) {
    const version = raw => createHash('sha256').update(raw).digest('hex').slice(0, 12)
    let raw = initial ? JSON.stringify(initial) : null, writes = 0
    return {
      read: async () => ({ value: raw ? JSON.parse(raw) : null, version: raw ? version(raw) : null }),
      write: async (value, ifMatch) => {
        const current = raw ? version(raw) : null
        if (ifMatch !== undefined && ifMatch !== current) return { ok: false, conflict: true, value: raw ? JSON.parse(raw) : null, version: current }
        raw = JSON.stringify(value); writes++
        return { ok: true, version: version(raw) }
      },
      disk: () => JSON.parse(raw),
      writes: () => writes,
    }
  }
  const ready = () => {
    let store = u.configureSequence(emptyStore(), 10, true)
    store = u.updateBusiness(store, { name: 'Business', address: 'Street' })
    for (const id of ['html', 'pdf']) store.assets[id] = { id, name: id, readable: true, mimeType: id === 'html' ? 'text/html' : 'application/pdf' }
    store = u.saveClient(store, { name: 'Acme', billingAddress: 'Road' }, 'acme')
    for (const id of ['d1', 'd2', 'd3']) {
      store = u.createDraft(store, undefined, undefined, id)
      store = u.updateDraft(store, id, { sender: { name: 'Business', address: 'Street' }, recipient: { name: 'Client', address: 'Road' }, invoiceDate: '2026-09-19', dueDate: '2026-09-30', lineItems: [{ description: 'Service', quantity: 1, unitPrice: 20 }] })
    }
    return store
  }
  /** One running copy: its own repository and commands over the shared file. */
  async function openCopy(file) {
    const repo = new InvoiceRepository(file); repo.setEnabled(true); await repo.initialize()
    const presentation = createPresentationCommands(repo)
    return { repo, core: createInvoiceCommands(repo), agreements: createAgreementCommands(repo),
      final: createFinalizationCommands(repo, presentation.exportInvoicePdf, { renderInvoice: render, readRetainedAsset: globalThis.twoCopies.readRetainedAsset, now: () => Date.now() }) }
  }
  const two = async initial => { const file = sharedFile(initial ?? ready()); return { file, a: await openCopy(file), b: await openCopy(file) } }
  const notes = (copy, id, text) => copy.repo.transact(s => u.updateDraft(s, id, { notes: text }))
  const scenario = async (name, run) => {
    console.error = () => {}
    try { await run(); console.log(`  ok    ${name}`) }
    catch (error) { failures.push(name); console.log(`  FAIL  ${name}\n          ${String(error?.message ?? error).split('\n')[0]}`) }
    finally { console.error = quiet }
  }
  console.log('Two copies of PureInvoicing over one file:')

  await scenario('adding different records in each copy keeps both', async () => {
    const { file, a, b } = await two()
    await a.repo.transact(s => u.saveClient(s, { name: 'From A' }, 'from-a'))
    await b.repo.transact(s => u.saveClient(s, { name: 'From B' }, 'from-b'))
    const disk = file.disk()
    assert.ok(disk.clients['from-a'] && disk.clients['from-b'] && disk.clients.acme)
  })
  await scenario('editing different records in each copy keeps both', async () => {
    const { file, a, b } = await two()
    await notes(a, 'd1', 'A wrote this')
    await notes(b, 'd2', 'B wrote this')
    const disk = file.disk()
    assert.equal(disk.drafts.d1.content.notes, 'A wrote this')
    assert.equal(disk.drafts.d2.content.notes, 'B wrote this')
  })
  await scenario('deleting a record in one copy while the other edits another: delete and edit both stand', async () => {
    const { file, a, b } = await two()
    await a.repo.transact(s => u.discardDraft(s, 'd1'))
    await notes(b, 'd2', 'B wrote this')
    const disk = file.disk()
    assert.equal(disk.drafts.d1, undefined)
    assert.equal(disk.drafts.d2.content.notes, 'B wrote this')
  })
  await scenario('a record deleted in one copy is not brought back by the other editing it', async () => {
    const { file, a, b } = await two()
    await a.repo.transact(s => u.discardDraft(s, 'd1'))
    await notes(b, 'd1', 'edit from a copy that still shows it').catch(() => {})
    assert.equal(file.disk().drafts.d1, undefined, 'the deleted draft came back')
    assert.equal(b.repo.getSnapshot().status, 'saved', `the copy is left at ${b.repo.getSnapshot().status}`)
    assert.equal(b.repo.getSnapshot().value.drafts.d1, undefined, 'the copy still shows it')
  })
  await scenario('an edit to the same record keeps the newer one', async () => {
    const { file, a, b } = await two()
    await notes(a, 'd1', 'first')
    await notes(b, 'd1', 'second, and newer').catch(() => {})
    assert.equal(file.disk().drafts.d1.content.notes, 'second, and newer')
    assert.equal(b.repo.getSnapshot().status, 'saved', `the copy is left at ${b.repo.getSnapshot().status}`)
    await notes(a, 'd1', 'third, newer still').catch(() => {})
    assert.equal(file.disk().drafts.d1.content.notes, 'third, newer still')
  })
  await scenario('edits to different fields of one record both survive', async () => {
    const { file, a, b } = await two()
    await notes(a, 'd1', 'notes from A')
    await b.repo.transact(s => u.updateDraft(s, 'd1', { reference: 'PO-1 from B' })).catch(() => {})
    const draft = file.disk().drafts.d1
    assert.equal(draft.content.notes, 'notes from A')
    assert.equal(draft.content.reference, 'PO-1 from B')
  })
  await scenario('opening with an older snapshot and saving at once loses nothing', async () => {
    const { file, a, b } = await two()
    // b opened first and still holds the old file; a adds, edits and deletes.
    await a.repo.transact(s => u.saveClient(s, { name: 'New from A' }, 'new-a'))
    await notes(a, 'd2', 'edited by A')
    await a.repo.transact(s => u.discardDraft(s, 'd3'))
    await b.repo.transact(s => u.saveClient(s, { name: 'New from B' }, 'new-b'))
    const disk = file.disk()
    assert.ok(disk.clients['new-a'] && disk.clients['new-b'])
    assert.equal(disk.drafts.d2.content.notes, 'edited by A')
    assert.equal(disk.drafts.d3, undefined)
    assert.ok(b.repo.getSnapshot().value.clients['new-a'], 'the saving copy now holds what the other saved')
  })
  await scenario('a copy opened on an older snapshot that changes nothing writes nothing', async () => {
    const { file, a, b } = await two()
    await notes(a, 'd1', 'edited by A')
    const writes = file.writes()
    await b.repo.retry()
    assert.equal(file.writes(), writes)
    assert.equal(file.disk().drafts.d1.content.notes, 'edited by A')
  })
  await scenario('a copy left open picks up what the other saved without saving itself', async () => {
    const { a, b } = await two()
    await a.repo.transact(s => u.saveClient(s, { name: 'New from A' }, 'new-a'))
    await a.repo.transact(s => u.discardDraft(s, 'd3'))
    assert.equal(typeof b.repo.sync, 'function', 'the repository has no way to take another copy\'s saves')
    const before = b.repo.getSnapshot()
    await b.repo.sync(); await b.repo.sync()
    assert.ok(b.repo.getSnapshot().value.clients['new-a'])
    assert.equal(b.repo.getSnapshot().value.drafts.d3, undefined)
    assert.notEqual(b.repo.getSnapshot(), before)
    const settled = b.repo.getSnapshot()
    await b.repo.sync()
    assert.equal(b.repo.getSnapshot(), settled, 'a look with nothing new does not disturb the screen')
  })
  await scenario('a save that lands while the other copy looks at the same moment is not lost', async () => {
    const { file, a, b } = await two()
    await Promise.all([notes(a, 'd1', 'A'), b.repo.transact(s => u.saveClient(s, { name: 'B' }, 'b-client')), a.repo.transact(s => u.saveClient(s, { name: 'A' }, 'a-client')), notes(b, 'd2', 'B')])
    const disk = file.disk()
    assert.equal(disk.drafts.d1.content.notes, 'A'); assert.equal(disk.drafts.d2.content.notes, 'B')
    assert.ok(disk.clients['a-client'] && disk.clients['b-client'])
  })
  const issued = disk => Object.values(disk.invoices).map(invoice => invoice.number)
  await scenario('invoices issued at the same moment from two copies never share a number', async () => {
    const { file, a, b } = await two()
    const [first, second] = await Promise.all([
      a.final.prepareInvoiceFinalization({ draftId: 'd1', action: { kind: 'issue' } }),
      b.final.prepareInvoiceFinalization({ draftId: 'd2', action: { kind: 'issue' } }),
    ])
    const results = await Promise.allSettled([a.final.finalizeInvoice({ confirmationToken: first.confirmationToken }), b.final.finalizeInvoice({ confirmationToken: second.confirmationToken })])
    // One may have to prepare again: a number it showed the person has gone. It never issues under that number.
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') continue
      assert.match(String(result.reason?.message), /stale|Prepare again/i)
      const copy = index ? b : a, draftId = index ? 'd2' : 'd1'
      const again = await copy.final.prepareInvoiceFinalization({ draftId, action: { kind: 'issue' } })
      await copy.final.finalizeInvoice({ confirmationToken: again.confirmationToken })
    }
    const numbers = issued(file.disk()).sort((x, y) => x - y)
    assert.equal(numbers.length, 2)
    assert.equal(new Set(numbers).size, 2, `two invoices share number ${numbers[0]}`)
    assert.deepEqual(numbers, [10, 11])
    assert.equal(file.disk().sequence.nextNumber, 12)
  })
  await scenario('a copy with an old view issues the next free number, not the one it last saw', async () => {
    const { file, a, b } = await two()
    const prepared = await a.final.prepareInvoiceFinalization({ draftId: 'd1', action: { kind: 'issue' } })
    await a.final.finalizeInvoice({ confirmationToken: prepared.confirmationToken })
    assert.equal(b.repo.getSnapshot().value.sequence.nextNumber, 10, 'b still shows 10')
    const late = await b.final.prepareInvoiceFinalization({ draftId: 'd2', action: { kind: 'issue' } })
    await b.final.finalizeInvoice({ confirmationToken: late.confirmationToken })
    assert.deepEqual(issued(file.disk()).sort((x, y) => x - y), [10, 11])
  })
  await scenario('saving in a copy with an old view never moves the invoice counter back', async () => {
    const { file, a, b } = await two()
    await a.repo.transact(s => u.configureSequence(s, 100, true))
    await b.repo.transact(s => u.saveClient(s, { name: 'From B' }, 'from-b'))
    assert.equal(file.disk().sequence.nextNumber, 100)
    await b.repo.transact(s => u.configureSequence(s, 50, true)).catch(() => {})
    assert.equal(file.disk().sequence.nextNumber, 100)
    assert.equal(b.repo.getSnapshot().status, 'saved', `the copy is left at ${b.repo.getSnapshot().status}`)
  })
  const sendable = (store, id) => {
    const made = ag.createAgreement(store, { kind: 'nda', direction: 'client', clientId: 'acme' }, id)
    const agreement = made.agreements[id]
    return { ...made, agreements: { ...made.agreements, [id]: { ...agreement, sections: [{ id: `${id}-s`, heading: 'Terms', body: 'Plain words.' }] } } }
  }
  const agreementNumbers = disk => Object.values(disk.agreements).map(item => item.numberText).filter(Boolean).sort()
  await scenario('agreements sent from two copies never share a number', async () => {
    let store = ready(); store = sendable(store, 'ag1'); store = sendable(store, 'ag2')
    const { file, a, b } = await two(store)
    await a.agreements.sendAgreement({ agreementId: 'ag1' })
    await b.agreements.sendAgreement({ agreementId: 'ag2' })
    const numbers = agreementNumbers(file.disk())
    assert.equal(numbers.length, 2)
    assert.equal(new Set(numbers).size, 2, `both agreements went out as ${numbers[0]}`)
  })
  await scenario('agreements sent at the same moment from two copies never share a number', async () => {
    let store = ready(); store = sendable(store, 'ag1'); store = sendable(store, 'ag2')
    const { file, a, b } = await two(store)
    await Promise.all([a.agreements.sendAgreement({ agreementId: 'ag1' }), b.agreements.sendAgreement({ agreementId: 'ag2' })])
    const numbers = agreementNumbers(file.disk())
    assert.equal(numbers.length, 2)
    assert.equal(new Set(numbers).size, 2, `both agreements went out as ${numbers[0]}`)
  })
  await scenario('business details and template defaults changed in different copies both stay', async () => {
    const { file, a, b } = await two()
    await b.repo.transact(s => u.updateBusiness(s, { phone: '555' }))
    await a.repo.transact(s => u.updateTemplate(s, { accentColor: '#123456' }))
    const raw = file.disk()
    parseStore(raw)
    assert.equal(raw.business.phone, '555')
    assert.equal(raw.template.accentColor, '#123456')
  })
} finally {
  console.error = quiet
  await rm(dir, { recursive: true, force: true })
}
if (failures.length) {
  console.log(`\n${failures.length} scenario(s) failed.`)
  process.exit(1)
}
console.log('Two copies: adds, edits and deletes in both, a delete staying deleted, the newer edit kept, an older snapshot saving at once, and no shared invoice or agreement number passed.')
