import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { compactSections } from '../../lib/invoices/compactRows'
import { DeskShell } from './DeskShell'
import { compactStore, deskProps, fakeProduct, IDS } from './compactFixture'

vi.mock('@purescience/platform-bridge/components/settings/AppSettings', () => ({ useAppSettings: () => ({ open: () => undefined }) }))
vi.mock('./BusinessView', () => ({ BusinessView: () => null }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root, container: HTMLDivElement
beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

const desk = (place?: Parameters<typeof fakeProduct>[1], store = compactStore()) => { const product = fakeProduct(store, place); return { product, props: deskProps(product, store) } }
const compactMarks = () => container.querySelectorAll('[data-compact-desk], [data-compact-show], [data-compact-hide], [data-compact-page], [data-compact-keep], .invoicing-compact').length
const button = (name: RegExp) => Array.from(container.querySelectorAll('button')).find(b => name.test(b.textContent ?? ''))
const compactView = () => container.querySelector('.invoicing-compact')

it('sorts the longest overdue first and keeps each total as the app computes it', () => {
  const { outstanding, working, settled } = compactSections(compactStore())
  expect(outstanding.map(row => row.what)).toEqual(['PS-001', 'PS-003'])
  expect(outstanding[0].total).toBe('1234.50')
  expect(working.map(row => row.type).sort()).toEqual(['invoice', 'offer'])
  expect(settled.map(row => row.what)).toEqual(['PS-002'])
})

it('off: adds nothing to the page, and previews still render', async () => {
  const { product, props } = desk({ selectedId: IDS.overdue })
  await act(async () => root.render(<DeskShell {...props} />))
  expect(compactMarks()).toBe(0)
  expect(button(/Mark paid/)).toBeTruthy()
  expect(product.preparePreview).toHaveBeenCalled()
})

it('on: a short list with exact money and the outstanding figure; the full desk stays mounted', async () => {
  const { props } = desk()
  await act(async () => root.render(<DeskShell {...props} compact />))
  const view = compactView()!
  expect(view.textContent).toContain('Outstanding')
  expect(view.textContent).toContain('$2,234.50')
  expect(view.textContent).toContain('$1,234.50')
  expect(view.textContent).toContain('Acme Ltd')
  expect(view.querySelector('button.invoicing-compact-row')).toBeTruthy()
  expect(Array.from(view.querySelectorAll('button')).some(b => /Mark paid|Issue|PDF/.test(b.textContent ?? ''))).toBe(false)
  // The archive is still there behind it, not shown.
  expect(container.querySelector('[aria-label="Places"]')).toBeTruthy()
})

it('on: Full app gives the same desk back, with nothing remounted', async () => {
  const { props } = desk()
  await act(async () => root.render(<DeskShell {...props} compact />))
  const rail = container.querySelector('[aria-label="Places"]')
  await act(async () => root.render(<DeskShell {...props} />))
  expect(container.querySelector('[aria-label="Places"]')).toBe(rail)
  expect(compactMarks()).toBe(0)
})

it('on: an issued invoice reads with its figures, and paying, correcting and the PDF are out of reach', async () => {
  const { product, props } = desk({ selectedId: IDS.overdue })
  await act(async () => root.render(<DeskShell {...props} compact />))
  const view = compactView()!
  expect(view.textContent).toContain('PS-001')
  expect(view.textContent).toContain('1,234.50')
  expect(view.textContent).toContain('Website work')
  expect(Array.from(view.querySelectorAll('button')).map(b => b.textContent)).toEqual(['Back'])
  expect(product.preparePreview).not.toHaveBeenCalled()
})

it('on: a draft opens its real page with Issue hidden, not removed', async () => {
  const { props } = desk({ selectedId: IDS.draft })
  await act(async () => root.render(<DeskShell {...props} compact />))
  expect(compactView()).toBeNull()
  expect(button(/^Back$/)).toBeTruthy()
  expect(button(/^Issue/)?.hasAttribute('data-compact-hide')).toBe(true)
  expect(button(/Delete draft/)?.closest('[data-compact-hide]')).toBeTruthy()
})

it('on, nothing there yet: one quiet line and one way forward', async () => {
  const { props } = desk({}, compactStore({ empty: true }))
  await act(async () => root.render(<DeskShell {...props} compact />))
  const view = compactView()!
  expect(view.querySelector('p')?.textContent).toBe('No invoices or offers yet.')
  expect(view.querySelectorAll('button').length).toBe(1)
})
