import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import ts from 'typescript'
const dir = await mkdtemp(join(tmpdir(), 'invoice-finalization-'))
const originalError = console.error, errors = []
try {
  await mkdir(join(dir, 'src/lib/invoices'), { recursive: true }); await mkdir(join(dir, 'src/bridge'), { recursive: true })
  await writeFile(join(dir, 'package.json'), '{"type":"module"}')
  for (const file of ['lib/invoices/templatePreview', 'lib/invoices/finalization', 'lib/invoices/presentationCommands', 'lib/invoices/versionDocuments', 'lib/invoices/calculations',
    'lib/invoices/defaults', 'lib/invoices/parse', 'lib/invoices/repository', 'lib/invoices/updates', 'lib/invoices/commands', 'lib/invoices/queries',
    'lib/invoices/lifecycle', 'lib/invoices/numbering', 'lib/invoices/money', 'lib/invoices/stats', 'bridge/invoiceStorageCapabilities']) {
    const source = await readFile(`src/${file}.ts`, 'utf8')
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    await writeFile(join(dir, `src/${file}.js`), code.replace(/(from\s+['"])(\.[^'"]+)(['"])/g, '$1$2.js$3'))
  }
  // React and styled-components resolve from wherever the workspace hoisted them.
  const require = createRequire(join(process.cwd(), 'package.json'))
  for (const name of ['react', 'react-dom', 'styled-components']) {
    const target = dirname(require.resolve(`${name}/package.json`))
    await mkdir(join(dir, 'node_modules'), { recursive: true })
    await symlink(target, join(dir, 'node_modules', name), 'dir')
  }
  for (const file of ['agents/handlers/index', 'agents/validateDomainArguments', 'agents/domainSchemas',
    'components/desk/IssueSheet', 'components/desk/IssuedView', 'components/desk/PreviewPane', 'components/desk/bits', 'components/desk/deskStyles',
    'lib/invoices/dates']) {
    const extension = file.endsWith('deskStyles') || file.startsWith('agents') || file.startsWith('lib') ? 'ts' : 'tsx'
    const source = await readFile(`src/${file}.${extension}`, 'utf8')
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText
    await mkdir(join(dir, 'src', file.substring(0, file.lastIndexOf('/'))), { recursive: true })
    await writeFile(join(dir, `src/${file}.js`), code.replace(/(from\s+['"])(\.[^'"]+)(['"])/g, '$1$2.js$3')
      .replace('@purescience/platform-ui/bridge/agentToolHelpers', '../../bridge/agentToolHelpers.js')
      .replace("import styled from 'styled-components';", "import { styled } from 'styled-components';"))
  }
  const helperSource = await readFile('node_modules/@purescience/platform-ui/src/bridge/agentToolHelpers.ts', 'utf8')
  await writeFile(join(dir, 'src/bridge/agentToolHelpers.js'), ts.transpileModule(helperSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText)
  let now = Date.now(), pdfFailure = false, cancelled = false, unreadable = false, blockedPages = false, exports = 0, beforeExport
  const digest = async bytes => createHash('sha256').update(bytes).digest('hex')
  const readAsset = async (store, id) => { if (unreadable || !store.assets[id]) throw new Error('PDF unavailable'); return { base64: 'pdf' } }
  const render = async (repo, content, number) => {
    const id = await digest(new TextEncoder().encode(JSON.stringify({ content, number })))
    const document = { id, htmlAssetId: 'html', pdfAssetId: 'pdf', pageCount: 2 }
    await repo.guardedTransact(s => ({ ...s, documents: { ...s.documents, [id]: document } }))
    return { canFinalize: !blockedPages, document, pages: [{ pageNumber: 1, diagnostics: [], text: 'Page one' }, { pageNumber: 2, diagnostics: [], text: 'Page two' }], pageCount: 2,
      diagnostics: blockedPages ? [{ field: 'pages.2', message: 'Content overlaps' }] : [] }
  }
  globalThis.finalizationTest = { digest, readRetainedAsset: readAsset, importInvoiceAsset: async () => {}, renderInvoice: render,
    requirePrintableInvoice: render, exportInvoiceBytes: async (_name, _bytes, check) => {
      if (pdfFailure) throw new Error('Export disk failure')
      if (cancelled) return { cancelled: true }
      await beforeExport?.(); await check?.(); exports++; return { cancelled: false, path: '/export/invoice.pdf' }
    } }
  await writeFile(join(dir, 'src/lib/invoices/assets.js'), 'export const {digest,readRetainedAsset,importInvoiceAsset} = globalThis.finalizationTest')
  await writeFile(join(dir, 'src/lib/invoices/rendering.js'), 'export const {renderInvoice,requirePrintableInvoice} = globalThis.finalizationTest')
  await writeFile(join(dir, 'src/lib/invoices/presentation.js'), 'export const presentationDiagnostics = () => []')
  await writeFile(join(dir, 'src/bridge/platformBridge.js'), 'export const {exportInvoiceBytes} = globalThis.finalizationTest')
  const load = name => import(pathToFileURL(join(dir, `src/lib/invoices/${name}.js`)))
  const { emptyStore } = await load('defaults'), u = await load('updates')
  const { InvoiceRepository } = await load('repository'), { createFinalizationCommands } = await load('finalization')
  const { createPresentationCommands } = await load('presentationCommands'), { createInvoiceCommands } = await load('commands')
  const { assertForwardTransition } = await load('parse')
  let disk = u.configureSequence(emptyStore(), 10, true), revision = 1, loseAck = false, failBefore = false
  for (const id of ['html', 'pdf', 'original']) disk.assets[id] = { id, name: id, readable: true, mimeType: id === 'html' ? 'text/html' : 'application/pdf' }
  const port = {
    read: async () => ({ value: structuredClone(disk), version: String(revision) }),
    write: async (value, ifMatch) => {
      if (failBefore) { failBefore = false; throw new Error('Interrupted before write') }
      if (ifMatch !== String(revision)) return { ok: false, conflict: true, value: structuredClone(disk), version: String(revision) }
      disk = structuredClone(value); revision++
      if (loseAck) { loseAck = false; throw new Error('Interrupted after write') }
      return { ok: true, version: String(revision) }
    },
  }
  async function session() {
    const repo = new InvoiceRepository(port); repo.setEnabled(true); await repo.initialize()
    const presentation = createPresentationCommands(repo)
    return { repo, core: createInvoiceCommands(repo), presentation, final: createFinalizationCommands(repo, presentation.exportInvoicePdf,
      { renderInvoice: render, readRetainedAsset: readAsset, now: () => now }) }
  }
  const a = await session(), b = await session()
  globalThis.finalizationCommands = { ...a.core, ...a.presentation, ...a.final }
  await writeFile(join(dir, 'src/lib/invoices/workspace.js'), 'export const invoiceCommands = globalThis.finalizationCommands')
  const { appAgentHandlers } = await import(pathToFileURL(join(dir, 'src/agents/handlers/index.js')))
  const callAgent = async (name, args = {}) => {
    const result = await appAgentHandlers[name]({ arguments: args })
    assert.equal(result.isError, undefined, result.content)
    return JSON.parse(result.content)
  }
  const { createElement } = await import('react'), { renderToStaticMarkup } = await import('react-dom/server')
  const { IssueSheet } = await import(pathToFileURL(join(dir, 'src/components/desk/IssueSheet.js')))
  const { IssuedView } = await import(pathToFileURL(join(dir, 'src/components/desk/IssuedView.js')))
  const noop = () => {}
  const publicationMarkup = (id, confirmation, extra = {}) => renderToStaticMarkup(createElement(IssueSheet, {
    disabled: false, product: { selected: disk.drafts[id], content: disk.drafts[id].content, confirmation, dirty: false, cancelPublication: noop, finalize: noop, ...extra },
  }))
  async function draft(id) {
    await a.repo.guardedTransact(s => {
      s = u.createDraft(s, undefined, undefined, id)
      return u.updateDraft(s, id, { sender: { name: 'Business', address: 'Street' }, recipient: { name: 'Client', address: 'Road' },
        invoiceDate: '2026-09-19', dueDate: '2026-09-30', lineItems: [{ description: 'Service', quantity: 1, unitPrice: 20 }] })
    })
  }
  const prepare = (session, id, action = { kind: 'issue' }) => session.final.prepareInvoiceFinalization({ draftId: id, action })
  const finalize = (session, prepared) => session.final.finalizeInvoice({ confirmationToken: prepared.confirmationToken })
  console.error = (...args) => errors.push(args)
  await draft('first'); await draft('second')
  blockedPages = true; assert.equal((await prepare(a, 'first')).ready, false); blockedPages = false
  const p = await prepare(a, 'first'), q = await prepare(b, 'second')
  const issueUi = publicationMarkup('first', p)
  for (const text of ['Assign', '>10<', 'Client', 'Road', 'Sep 19, 2026', 'Sep 30, 2026', '20.00', 'USD', 'Issue 10', 'Cancel review', 'Back to draft']) assert.ok(issueUi.includes(text), text)
  assert.ok(disk.drafts.first); assert.equal(Object.keys(disk.invoices).length, 0) // Preparing or cancelling review is unpublished.
  const competing = await Promise.allSettled([finalize(a, p), finalize(b, q)])
  assert.equal(competing.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(Object.keys(disk.invoices).length, 1); assert.equal(disk.sequence.nextNumber, 11)
  assert.equal(Object.keys(disk.publications).length, 1)
  const success = competing.find(r => r.status === 'fulfilled').value
  const token = success.publication.confirmationToken, invoiceId = success.publication.invoiceId
  const restart = await session(), exportCount = exports
  const replay = await restart.final.finalizeInvoice({ confirmationToken: token })
  assert.deepEqual(replay.publication, success.publication); assert.equal(exports, exportCount)
  await draft('stale')
  const stale = await prepare(a, 'stale'); await a.repo.transact(s => u.updateDraft(s, 'stale', { notes: 'new' }))
  await assert.rejects(finalize(a, stale), /stale/)
  const settings = await prepare(a, 'stale'); await a.repo.transact(s => u.updateTemplate(s, { footerText: 'Changed settings' }))
  await assert.rejects(finalize(a, settings), /stale/)
  const expired = await prepare(a, 'stale'); now += 600001; await assert.rejects(finalize(a, expired), /expired/)
  const interrupted = await prepare(a, 'stale'); failBefore = true
  await assert.rejects(finalize(a, interrupted), /Interrupted/); assert.ok(disk.drafts.stale); assert.equal(disk.publications[interrupted.confirmationToken], undefined)
  loseAck = true; pdfFailure = true
  const recovered = await finalize(a, interrupted)
  assert.equal(recovered.issued, true); assert.match(recovered.pdf.error, /disk failure/)
  const assigned = disk.sequence.nextNumber
  pdfFailure = false
  await a.presentation.exportInvoicePdf({ invoiceId: recovered.publication.invoiceId, request: { kind: 'downloadVersion', versionId: recovered.publication.versionId } })
  assert.equal(disk.sequence.nextNumber, assigned)
  const correction = await a.core.startInvoiceCorrection({ invoiceId })
  const correctionId = Object.values(disk.drafts).find(d => d.correctionOf === invoiceId).id
  await a.repo.transact(s => u.updateDraft(s, correctionId, { notes: 'Unpublished' }))
  await b.core.startInvoiceCorrection({ invoiceId }); assert.equal(disk.drafts[correctionId].content.notes, 'Unpublished')
  const cancelToken = await prepare(a, correctionId, { kind: 'publishCorrection', changeNote: 'note' })
  const original = structuredClone(disk.invoices[invoiceId]); await a.core.discardInvoiceDraft({ draftId: correctionId })
  assert.deepEqual(disk.invoices[invoiceId], original); await assert.rejects(finalize(a, cancelToken), /Draft not found/)
  await a.core.startInvoiceCorrection({ invoiceId })
  const nextCorrection = Object.values(disk.drafts).find(d => d.correctionOf === invoiceId).id
  await assert.rejects(prepare(a, nextCorrection, { kind: 'publishCorrection', changeNote: '  ' }), /change note/)
  await a.repo.transact(s => u.updateDraft(s, nextCorrection, { notes: 'Corrected' }))
  const cp = await prepare(a, nextCorrection, { kind: 'publishCorrection', changeNote: 'Notes corrected' })
  const correctionUi = publicationMarkup(nextCorrection, cp)
  assert.ok(correctionUi.includes('Notes corrected')); assert.ok(correctionUi.includes('Previously shared copies are not automatically replaced'))
  const publishedCorrection = await finalize(a, cp)
  assert.equal(publishedCorrection.publication.number, original.number); assert.equal(disk.sequence.nextNumber, assigned)
  assert.deepEqual(disk.invoices[invoiceId].versions[0], original.versions[0]); assert.equal(disk.invoices[invoiceId].versions.length, 2)
  assert.deepEqual((await restart.final.finalizeInvoice({ confirmationToken: token })).publication, success.publication)
  await draft('history')
  await assert.rejects(prepare(a, 'history', { kind: 'registerHistorical', originalNumber: original.number }), /reserved/)
  const hp = await prepare(a, 'history', { kind: 'registerHistorical', originalNumber: 99, originalPdfAssetId: 'original' })
  const historicalUi = publicationMarkup('history', hp, { registering: true, historicalAsset: disk.assets.original })
  for (const text of ['Register 99', 'Next proposed number', '100', 'Unverified original PDF attached: original', 'No PDF is produced']) assert.ok(historicalUi.includes(text), text)
  const historical = await finalize(a, hp)
  const historicalVersions = structuredClone(disk.invoices.history.versions)
  await callAgent('setHistoricalPdfReference', { invoiceId: 'history', pdfAssetId: 'pdf' })
  assert.deepEqual(disk.invoices.history.versions, historicalVersions)
  const historyUi = renderToStaticMarkup(createElement(IssuedView, { disabled: false, store: disk, product: {
    issued: disk.invoices.history, version: disk.invoices.history.versions[0], availability: { available: true }, preview: null, busy: false, label: '99', labelFor: () => null,
    markInvoice: noop, selectClient: noop, openAssistant: noop, download: noop, copyInvoice: noop, startCorrection: noop, importHistoricalPdf: noop, removeHistoricalPdf: noop, selectVersion: noop, openInvoice: noop, preparePreview: noop,
  } }))
  for (const text of ['Download PDF', 'New invoice from this', 'Reissue same PDF', 'Replace original PDF', 'Remove reference', 'unverified reference', 'Historical record', 'Where it stands']) assert.ok(historyUi.includes(text), text)
  assert.equal(disk.sequence.nextNumber, 100); assert.equal(disk.invoices.history.historicalPdf.provenance, 'unverified-historical-original')
  await a.presentation.setHistoricalPdfReference({ invoiceId: 'history', pdfAssetId: null })
  assert.equal(disk.invoices.history.historicalPdf, undefined); assert.ok(disk.assets.original)
  await assert.rejects(a.presentation.setHistoricalPdfReference({ invoiceId, pdfAssetId: 'original' }), /Only historical/)
  const versions = structuredClone(disk.invoices[invoiceId].versions)
  cancelled = true
  const cancelledReissue = await a.presentation.exportInvoicePdf({ invoiceId, request: { kind: 'reissue' } })
  assert.equal(cancelledReissue.reissueRecorded, false); cancelled = false
  const reissued = await a.presentation.exportInvoicePdf({ invoiceId, request: { kind: 'reissue' } })
  assert.equal(reissued.reissueRecorded, true); assert.equal(reissued.deliveryClaimed, false)
  assert.deepEqual(disk.invoices[invoiceId].versions, versions)
  unreadable = true
  const failedReissue = await a.presentation.exportInvoicePdf({ invoiceId, request: { kind: 'reissue' } })
  assert.equal(failedReissue.reissueRecorded, false); assert.equal(failedReissue.available, false); unreadable = false
  const superseded = await a.presentation.exportInvoicePdf({ invoiceId, request: { kind: 'downloadVersion', versionId: original.currentVersionId } })
  assert.equal(superseded.superseded, true)
  for (const mutate of [s => delete s.invoices[invoiceId], s => s.invoices[invoiceId].number++, s => s.invoices[invoiceId].versions.shift(), s => delete s.publications[token]]) {
    const bad = structuredClone(disk); mutate(bad); assert.throws(() => assertForwardTransition(disk, bad))
  }
  const copied = await callAgent('createInvoiceDraft', { sourceInvoiceId: invoiceId })
  assert.equal(copied.content.dueDate, null)
  await callAgent('updateInvoiceDraft', { draftId: copied.id, changes: { dueDate: copied.content.invoiceDate } })
  const agentPreview = await callAgent('getInvoicePreview', { target: { draftId: copied.id } })
  assert.equal(agentPreview.numberStatus, 'provisional')
  const agentPrepared = await callAgent('prepareInvoiceFinalization', { draftId: copied.id, action: { kind: 'issue' } })
  cancelled = true
  const agentIssued = await callAgent('finalizeInvoice', { confirmationToken: agentPrepared.confirmationToken })
  assert.equal(agentIssued.issued, true); assert.equal(agentIssued.pdf.cancelled, true)
  cancelled = false
  const agentRetry = await callAgent('exportInvoicePdf', { invoiceId: copied.id, request: { kind: 'downloadVersion', versionId: agentIssued.publication.versionId } })
  assert.equal(agentRetry.available, true); assert.match(agentRetry.fileName, /Invoice-100-Client-v1\.pdf/)
  const reopened = await callAgent('getInvoice', { invoiceId: copied.id })
  assert.equal(reopened.number, 100); assert.equal(disk.invoices[copied.id].versions.length, 1)
  assert.equal(disk.invoices[invoiceId].versions.length, 2)
  const invalidTool = await appAgentHandlers.finalizeInvoice({ arguments: { confirmationToken: 'unknown' } })
  assert.equal(invalidTool.isError, true)
  assert.ok(errors.length && errors.every(args => args[1] instanceof Error))
  console.log('Invoice finalization: competing CAS commits, restart replay, lost acknowledgements, stale/expired tokens, correction resume/cancel/history, historical conflicts, PDF failure/retry, reissue, publication/detail UI rendering and agent-handler copy-to-PDF recovery passed.')
} finally { console.error = originalError; delete globalThis.finalizationTest; delete globalThis.finalizationCommands; await rm(dir, { recursive: true, force: true }) }
