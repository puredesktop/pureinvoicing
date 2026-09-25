import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import ts from 'typescript'
// Contract tests for the production pipeline. Geometry itself is measured by the host renderer.
const dir = await mkdtemp(join(tmpdir(), 'invoice-rendering-'))
const previousParser = globalThis.DOMParser, previousError = console.error
try {
  await mkdir(join(dir, 'src/lib/invoices'), { recursive: true })
  await mkdir(join(dir, 'src/bridge'), { recursive: true })
  await writeFile(join(dir, 'package.json'), '{"type":"module"}')
  for (const name of ['rendering', 'presentation', 'calculations', 'defaults', 'parse', 'versionDocuments', 'money', 'lifecycle', 'dates']) {
    let source = await readFile(`src/lib/invoices/${name}.ts`, 'utf8')
    if (name === 'presentation') source = source.replace("import fontCss from './fonts/embedded.css?raw'", `const fontCss = ${JSON.stringify(await readFile('src/lib/invoices/fonts/embedded.css', 'utf8'))}`)
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/(from\s+['"])(\.[^'"]+)(['"])/g, '$1$2.js$3')
    await writeFile(join(dir, `src/lib/invoices/${name}.js`), js)
  }
  const files = new Map(), records = new Map(), calls = [], errors = []
  let texts = ['Invoice 9 Alice', 'Long description continued', 'Total USD: 30.00'], mismatch = false, overflow = false, missingMetrics = false, assetFailure = false
  globalThis.DOMParser = class {
    parseFromString(html) {
      return { body: { textContent: texts.join(' ') }, querySelector: () => null,
        querySelectorAll: selector => html === 'PAGED' && selector === '.pagedjs_page' ? texts.map(textContent => ({ textContent })) : [] }
    }
  }
  globalThis.invoiceRenderTest = {
    digest: async bytes => createHash('sha256').update(bytes).digest('hex'),
    pdfPages: async () => mismatch ? [texts.join(' ')] : texts,
    readRetainedAsset: async (_store, id) => {
      if (assetFailure) throw new Error('Retained asset corrupted')
      const asset = records.get(id)
      if (!asset) throw new Error('Retained asset missing')
      return { path: asset.path, base64: files.get(asset.path), byteLength: 50, truncated: false, mimeType: asset.mimeType }
    },
    retainBytes: async (repository, name, mimeType, base64) => {
      const id = String(records.size + 1), asset = { id, path: `/retained/${id}/${name}`, name, mimeType, readable: true }
      records.set(id, asset); files.set(asset.path, base64)
      await repository.transact(s => ({ ...s, assets: { ...s.assets, [id]: asset } }))
      return asset
    },
    prepareInvoicePages: async path => { calls.push(['preview', path]); return { html: 'PAGED', pageCount: 3 } },
    captureInvoicePage: async (path, outputPath, page) => { calls.push(['capture', path, page]); return { imagePath: outputPath, page, pageCount: 3,
      metrics: missingMetrics ? undefined : { overlappingBlocks: 0, overflowingBlocks: overflow ? 1 : 0, usedHeightRatio: .8 } } },
    printInvoiceDocument: async (path, outputPath) => { calls.push(['pdf', path]); return outputPath },
    readPlatformFileBinary: async () => ({ base64: 'cGRm', byteLength: 3, mimeType: 'image/png', truncated: false }),
    readPlatformTextFile: async path => Buffer.from(files.get(path), 'base64').toString(),
  }
  await writeFile(join(dir, 'src/lib/invoices/assets.js'), `export const ASSET_LIMIT = 40000000; export const {digest,pdfPages,readRetainedAsset,retainBytes} = globalThis.invoiceRenderTest`)
  await writeFile(join(dir, 'src/bridge/platformBridge.js'), `export const {prepareInvoicePages,captureInvoicePage,printInvoiceDocument,readPlatformFileBinary,readPlatformTextFile} = globalThis.invoiceRenderTest`)
  const load = name => import(pathToFileURL(join(dir, `src/lib/invoices/${name}.js`)))
  const { renderInvoice, requirePrintableInvoice } = await load('rendering')
  const { emptyStore } = await load('defaults')
  const { invoiceHtml, presentationDiagnostics, fontDiagnostics } = await load('presentation')
  const { assertForwardTransition } = await load('parse')
  let store = emptyStore()
  const repository = { getSnapshot: () => ({ status: 'saved' }), current: async () => store, transact: async update => (store = update(structuredClone(store))) }
  const content = { sender: { name: 'Business', address: 'Street' }, recipient: { name: 'Alice', address: 'Road' },
    invoiceDate: '2026-09-19', dueDate: '2026-10-01', reference: '', currency: 'USD', lineItems: [{ description: 'Long description '.repeat(1000), quantity: 1, unitPrice: 30 }], notes: '', paymentInstructions: '', presentation: store.template }
  console.error = (...args) => errors.push(args)
  const result = await renderInvoice(repository, content, 9)
  assert.equal(result.canFinalize, true); assert.equal(result.pages.length, 3)
  assert.equal(new Set(calls.map(c => c[1])).size, 1, 'preview, all snapshots and PDF must share retained HTML')
  assert.equal(calls.filter(c => c[0] === 'capture').length, 3)
  assert.ok(result.document.pdfAssetId)
  const html = invoiceHtml(content, 9)
  assert.match(html, /table-header-group/); assert.match(html, /break-inside: avoid/)
  assert.match(html, /@page:first/); assert.match(html, /counter\(page\)/); assert.match(html, /data:font\/woff2;base64/)
  assert.equal(presentationDiagnostics({ ...store.template, bodyTextSizePt: 3 }).length > 0, true)
  assert.equal(fontDiagnostics({ ...content, notes: '🧾' }).length, 1)
  const issuedStore = structuredClone(store), changed = structuredClone(store)
  delete changed.assets[result.document.htmlAssetId]
  assert.throws(() => assertForwardTransition(issuedStore, changed), /Retained asset/)
  overflow = true
  assert.equal((await renderInvoice(repository, content, 9)).canFinalize, false)
  overflow = false; missingMetrics = true
  await assert.rejects(requirePrintableInvoice(repository, content, 9), /diagnostics/)
  missingMetrics = false; mismatch = true
  assert.equal((await renderInvoice(repository, content, 9)).canFinalize, false)
  mismatch = false; assetFailure = true
  assert.equal((await renderInvoice(repository, content, 9)).canFinalize, false)
  assert.ok(errors.every(args => args[1] instanceof Error))
  console.log('Invoice rendering: shared multipage source, PDF disagreement, layout diagnostics, retained fonts, immutable assets and asset failures passed.')
} finally {
  globalThis.DOMParser = previousParser; console.error = previousError
  delete globalThis.invoiceRenderTest
  await rm(dir, { recursive: true, force: true })
}
