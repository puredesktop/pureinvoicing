import assert from 'node:assert/strict'
import { readFile, readdir, writeFile, mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
// The proposal screens, rendered with React in a headless DOM: the form shows every field, typing saves, and each button runs the proposal command on the same records the agent tools use.
const dir = await mkdtemp(join(tmpdir(), 'invoice-proposal-screen-'))
const originalError = console.error
try {
  await writeFile(join(dir, 'package.json'), '{"type":"module"}')
  const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText
    .replace(/(from\s+['"])(\.[^'"]+)(['"])/g, '$1$2.js$3').replace("import styled from 'styled-components';", "import { styled } from 'styled-components';")
  const copy = async (directory, only) => {
    await mkdir(join(dir, directory), { recursive: true })
    for (const file of await readdir(directory)) {
      if (!/\.tsx?$/.test(file) || file === 'workspace.ts' || (only && !only.includes(file))) continue
      await writeFile(join(dir, directory, file.replace(/\.tsx?$/, '.js')), transpile(await readFile(`${directory}/${file}`, 'utf8')))
    }
  }
  await copy('src/lib/invoices'); await copy('src/lib', ['agentRefs.ts']); await copy('src/components/desk/proposals'); await copy('src/components/desk', ['bits.tsx', 'deskStyles.ts'])
  await mkdir(join(dir, 'src/bridge'), { recursive: true })
  await writeFile(join(dir, 'src/bridge/invoiceStorageCapabilities.js'), transpile(await readFile('src/bridge/invoiceStorageCapabilities.ts', 'utf8')))
  await writeFile(join(dir, 'src/lib/invoices/workspace.js'), 'export const invoiceCommands = globalThis.proposalTest.commands')
  const require = createRequire(join(process.cwd(), 'package.json'))
  await mkdir(join(dir, 'node_modules'), { recursive: true })
  for (const name of ['react', 'react-dom', 'styled-components']) await symlink(dirname(require.resolve(`${name}/package.json`)), join(dir, 'node_modules', name), 'dir')
  const { Window } = await import(pathToFileURL(require.resolve('happy-dom')).href)
  const window = new Window({ url: 'https://app.test/' })
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true })

  const load = name => import(pathToFileURL(join(dir, `src/${name}.js`)).href)
  const { InvoiceRepository } = await load('lib/invoices/repository')
  const { createInvoiceCommands } = await load('lib/invoices/commands')
  const { createProposalCommands } = await load('lib/invoices/proposalCommands')
  const fixture = JSON.parse(await readFile('tests/fixtures/workspace-before-proposals.json', 'utf8'))
  let disk = structuredClone(fixture), revision = 1
  const port = {
    read: async () => ({ value: structuredClone(disk), version: String(revision) }),
    write: async (value, ifMatch) => { if (ifMatch !== String(revision)) return { ok: false, conflict: true, value: structuredClone(disk), version: String(revision) }; disk = structuredClone(value); revision++; return { ok: true, version: String(revision) } },
  }
  const exported = []
  const repo = new InvoiceRepository(port); repo.setEnabled(true); await repo.initialize()
  globalThis.proposalTest = { commands: { ...createInvoiceCommands(repo), ...createProposalCommands(repo, async (fileName, html) => { exported.push({ fileName, html }); return { cancelled: false, path: `/exports/${fileName}` } }) } }
  const { createElement } = await import('react'), { act } = await import('react'), { createRoot } = await import('react-dom/client')
  const { ProposalPage } = await load('components/desk/proposals/ProposalPage')
  const { ProposalsView } = await load('components/desk/proposals/ProposalsView')
  console.error = () => {}

  // A fake desk: actions run at once, and navigation is recorded.
  const opened = [], messages = []
  const product = {
    selectedProposalId: null,
    act: async (action, done) => { const result = await action(); const text = typeof done === 'function' ? done(result) : done; if (text) messages.push(text) },
    quietly: action => action(),
    openProposal: async id => { opened.push(['proposal', id]) },
    openDraft: async id => { opened.push(['invoice', id]) },
    openDocument: async () => {},
  }
  const container = document.createElement('div'); document.body.appendChild(container)
  const root = createRoot(container)
  const show = async element => { await act(async () => { root.render(element) }); await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }
  const page = async id => show(createElement(ProposalPage, { key: id, product, store: await repo.current(), proposal: (await repo.current()).proposals[id], disabled: false }))
  const button = text => { const found = [...container.querySelectorAll('button')].find(b => b.textContent.trim().includes(text)); assert.ok(found, `button "${text}"`); return found }
  const press = async text => { await act(async () => { button(text).click() }); await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }
  const fieldByLabel = text => { const label = [...container.querySelectorAll('label')].find(l => l.firstElementChild?.textContent === text); assert.ok(label, `field "${text}"`); return label.querySelector('input, textarea, select') }
  const type = async (element, value) => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set
      setter.call(element, value); element.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    await act(async () => { element.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })) })
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  }

  // The list: empty, then New proposal creates one and opens it.
  await show(createElement(ProposalsView, { product, store: await repo.current(), disabled: false }))
  assert.ok(container.textContent.includes('Answer an enquiry with an offer'))
  await press('New proposal')
  const id = opened.at(-1)[1]
  assert.ok(disk.proposals[id], 'New proposal saved a draft proposal')
  assert.deepEqual(disk.invoices, fixture.invoices); assert.deepEqual(disk.sequence, fixture.sequence)

  // The form: every field is there, and typing saves it to the same record.
  await page(id)
  for (const name of ['Received', 'What they asked for', 'Customer name', 'Contact', 'Address', 'Email', 'Phone', 'Tax ID', 'Title', 'Scope', 'Deliverables', 'Not included', 'Timing', 'Currency', 'Terms', 'Invoice due after (days)']) fieldByLabel(name)
  await type(fieldByLabel('What they asked for'), 'Phone call: <b>urgent</b> refresh')
  await type(fieldByLabel('Customer name'), 'Kauri & Co')
  await type(fieldByLabel('Address'), '5 Rimu Road\nNelson')
  await type(fieldByLabel('Title'), 'Brand refresh')
  await type(fieldByLabel('Scope'), 'New logo and colours')
  await type(fieldByLabel('Deliverables'), 'Logo files')
  await type(fieldByLabel('Not included'), 'Printing')
  await type(fieldByLabel('Timing'), 'Three weeks')
  await type(fieldByLabel('Terms'), 'Half up front')
  await type(fieldByLabel('Invoice due after (days)'), '10')
  await act(async () => { const select = fieldByLabel('Currency'); select.value = 'EUR'; select.dispatchEvent(new window.Event('change', { bubbles: true })) })
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  await type(container.querySelector('[aria-label="Item 1 description"]'), 'Logo design')
  await type(container.querySelector('[aria-label="Item 1 quantity"]'), '3')
  await type(container.querySelector('[aria-label="Item 1 unit price"]'), '0.1')
  let saved = disk.proposals[id].versions[0].content
  assert.deepEqual({ ...saved, enquiryDate: null }, { title: 'Brand refresh', enquiry: 'Phone call: <b>urgent</b> refresh', enquiryDate: null, customer: { name: 'Kauri & Co', address: '5 Rimu Road\nNelson' },
    scope: 'New logo and colours', deliverables: 'Logo files', exclusions: 'Printing', timing: 'Three weeks', items: [{ description: 'Logo design', quantity: 3, unitPrice: 0.1 }], currency: 'EUR', paymentTerms: 'Half up front', paymentTermsDays: 10 })
  assert.ok(container.textContent.includes('€0.30'), 'the total follows the exact amount')
  // A decimal comma is a decimal: 0,5 is half, 19,95 is nineteen ninety-five, never 5 or 1995.
  await type(container.querySelector('[aria-label="Item 1 quantity"]'), '0,5')
  await type(container.querySelector('[aria-label="Item 1 unit price"]'), '19,95')
  assert.deepEqual(disk.proposals[id].versions[0].content.items, [{ description: 'Logo design', quantity: 0.5, unitPrice: 19.95 }])
  assert.ok(container.textContent.includes('€9.98'))
  // An ambiguous amount is refused on screen and not saved; the saved price stays as it was.
  await type(container.querySelector('[aria-label="Item 1 unit price"]'), '1,000')
  assert.equal(disk.proposals[id].versions[0].content.items[0].unitPrice, 19.95)
  assert.ok(container.textContent.includes('Not saved yet.') && container.textContent.includes('could mean 1000 or 1 and a fraction'))
  assert.equal(container.querySelector('[aria-label="Item 1 unit price"]').getAttribute('aria-invalid'), 'true')
  assert.equal(button('Mark as offered').disabled, true)
  await type(container.querySelector('[aria-label="Item 1 unit price"]'), '1.250,00')
  await type(container.querySelector('[aria-label="Item 1 quantity"]'), '3')
  await type(container.querySelector('[aria-label="Item 1 unit price"]'), '0.1')
  assert.deepEqual(disk.proposals[id].versions[0].content.items, [{ description: 'Logo design', quantity: 3, unitPrice: 0.1 }])
  assert.ok(!container.textContent.includes('Not saved yet.'))

  // Explicit actions, each on the version shown.
  await press('Mark as offered')
  assert.equal(disk.proposals[id].versions[0].status, 'offered')
  await page(id)
  assert.equal(fieldByLabel('Customer name').readOnly, true, 'an offered version is read-only')
  await press('Export HTML')
  assert.equal(exported.length, 1); assert.ok(exported[0].html.includes('Kauri &amp; Co')); assert.deepEqual(disk.drafts, fixture.drafts)
  await press('Revise offer')
  assert.deepEqual(disk.proposals[id].versions.map(v => [v.number, v.status]), [[1, 'offered'], [2, 'draft']])
  await page(id)
  await type(fieldByLabel('Timing'), 'Two weeks')
  assert.equal(disk.proposals[id].versions[0].content.timing, 'Three weeks'); assert.equal(disk.proposals[id].versions[1].content.timing, 'Two weeks')
  await press('Mark as offered')
  await page(id)
  await press('Accepted')
  assert.equal(disk.proposals[id].acceptedVersionId, disk.proposals[id].versions[1].id)
  assert.deepEqual(disk.drafts, fixture.drafts, 'accepting made no invoice')
  await page(id)
  await press('Create invoice draft')
  const link = disk.proposals[id].conversion
  assert.ok(link && disk.drafts[link.invoiceId]); assert.deepEqual(opened.at(-1), ['invoice', link.invoiceId])
  assert.equal(disk.drafts[link.invoiceId].content.recipient.name, 'Kauri & Co'); assert.deepEqual(disk.drafts[link.invoiceId].content.lineItems, [{ description: 'Logo design', quantity: 3, unitPrice: 0.1 }])
  await page(id)
  await press('Open invoice draft')
  assert.deepEqual(opened.at(-1), ['invoice', link.invoiceId])
  assert.equal(Object.keys(disk.drafts).length, Object.keys(fixture.drafts).length + 1)
  assert.deepEqual(disk.sequence, fixture.sequence)

  // Accepting an earlier version while a later draft exists: the page opens on the accepted version, the draft is read-only and cannot be offered.
  const early = await globalThis.proposalTest.commands.createProposal({ details: { title: 'Early', customer: { name: 'Totara Ltd' }, items: [{ description: 'Audit', quantity: 1, unitPrice: 100 }], currency: 'NZD' } })
  const e1 = early.latestVersionId
  await page(early.id)
  await press('Mark as offered')
  await page(early.id)
  await press('Revise offer')
  await page(early.id)
  await type(fieldByLabel('Timing'), 'Next month')
  const e2 = disk.proposals[early.id].versions[1].id
  await act(async () => { [...container.querySelectorAll('[role="tab"]')].find(t => t.textContent.startsWith('v1')).click() })
  await press('Accepted')
  assert.equal(disk.proposals[early.id].acceptedVersionId, e1)
  await act(async () => { root.unmount() })
  const reopened = createRoot(container)
  await act(async () => { reopened.render(createElement(ProposalPage, { product, store: await repo.current(), proposal: (await repo.current()).proposals[early.id], disabled: false })) })
  assert.equal(container.querySelector('[role="tab"][aria-selected="true"]').textContent, 'v1 · Accepted', 'a settled proposal opens on the accepted version')
  assert.ok(container.textContent.includes('Create invoice draft'))
  await act(async () => { [...container.querySelectorAll('[role="tab"]')].find(t => t.textContent.startsWith('v2')).click() })
  assert.equal(fieldByLabel('Customer name').readOnly, true, 'the later draft is read-only')
  assert.ok(![...container.querySelectorAll('button')].some(b => b.textContent.includes('Mark as offered')))
  assert.ok(container.textContent.includes('was never offered'))
  assert.equal(disk.proposals[early.id].versions[1].id, e2); assert.equal(disk.proposals[early.id].versions[1].status, 'draft')
  await act(async () => { reopened.unmount() })
  const listRoot = createRoot(container)
  await act(async () => { listRoot.render(createElement(ProposalsView, { product, store: await repo.current(), disabled: false })) })
  assert.ok(container.textContent.includes('Kauri & Co') && container.textContent.includes('Accepted') && container.textContent.includes('Invoice draft made'))
  await act(async () => { listRoot.unmount() })
  console.error = originalError
  console.log('Proposal screens: list, every form field saved by typing, offer, export, revise into a new version, accept and a single invoice draft, decimal commas and refused ambiguous amounts, a settled proposal opening on its accepted version, all through the shared proposal commands, passed.')
} finally {
  console.error = originalError
  await rm(dir, { recursive: true, force: true })
}
