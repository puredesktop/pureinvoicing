import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { copyIsKnown, findOutIfHeld, forgetHeldCopyForTest, isHeldCopy } from '../lib/heldCopy'
import { emptyStore } from '../lib/invoices/defaults'
import { saveInvoiceNavigationSettings, writeMoneyShareFile } from '../bridge/platformBridge'
import { useMoneyShare } from './useMoneyShare'
import { useInvoiceNavigation } from './useInvoiceNavigation'
import type { InvoiceStore } from '../lib/invoices/types'

vi.mock('../bridge/platformBridge', () => ({
  readMoneyShareRequest: vi.fn(async () => '{"v":1}'),
  writeMoneyShareFile: vi.fn(async () => undefined),
  saveInvoiceNavigationSettings: vi.fn(async () => ({ ok: true })),
}))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Where this frame sits. A normal tab and the Personal agent's page look the same from here; only the shell can tell them apart. */
function sitIn(place: 'alone' | 'shell' | 'another-app') {
  const shell = { name: 'shell' } as unknown as Window
  const parent = place === 'alone' ? window : place === 'shell' ? shell : ({ name: 'room' } as unknown as Window)
  const top = place === 'alone' ? window : shell
  Object.defineProperty(window, 'parent', { value: parent, configurable: true })
  Object.defineProperty(window, 'top', { value: top, configurable: true })
  forgetHeldCopyForTest()
}

let root: Root
beforeEach(() => {
  vi.clearAllMocks()
  root = createRoot(document.createElement('div'))
  document.documentElement.removeAttribute('data-held-in-room')
})
afterEach(async () => {
  await act(async () => root.unmount())
  sitIn('alone')
  vi.useRealTimers()
})

it('outside the shell it is simply the app', () => {
  sitIn('alone')
  expect(copyIsKnown()).toBe(true)
  expect(isHeldCopy()).toBe(false)
})

it('reads as held until the shell has answered, so nothing starts on a guess', async () => {
  sitIn('shell')
  expect(copyIsKnown()).toBe(false)
  expect(isHeldCopy()).toBe(true)
  await findOutIfHeld(async () => null)
  expect(copyIsKnown()).toBe(true)
  expect(isHeldCopy()).toBe(false)
})

it('a normal tab, alone or beside another app in split view, is not held', async () => {
  sitIn('shell')
  await findOutIfHeld(async () => ({ name: 'PureMail', tabId: 't' }) as { heldInRoom?: boolean })
  expect(isHeldCopy()).toBe(false)
})

it('on the Personal agent\'s page the frame looks like a tab: only the shell\'s answer says it is held', async () => {
  sitIn('shell')
  await findOutIfHeld(async () => ({ heldInRoom: true }))
  expect(isHeldCopy()).toBe(true)
  expect(document.documentElement.hasAttribute('data-held-in-room')).toBe(true)
})

it('inside the Executive room it stays a second copy even when opened straight into its full view', async () => {
  sitIn('another-app')
  await findOutIfHeld(async () => null)
  expect(isHeldCopy()).toBe(true)
  expect(document.documentElement.hasAttribute('data-held-in-room')).toBe(false)
})

it('a shell that cannot answer means a normal tab', async () => {
  sitIn('shell')
  await findOutIfHeld(async () => { throw new Error('Unknown method') })
  expect(isHeldCopy()).toBe(false)
})

const MoneyProbe = ({ store }: { store: InvoiceStore }) => { useMoneyShare(store, true); return null }
async function renderMoney(store: InvoiceStore) {
  vi.useFakeTimers()
  await act(async () => root.render(<MoneyProbe store={store} />))
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
}

it('a normal tab publishes the money share', async () => {
  sitIn('alone')
  await renderMoney(emptyStore())
  expect(writeMoneyShareFile).toHaveBeenCalledTimes(1)
})

it('a held copy never publishes the money share', async () => {
  sitIn('shell')
  await findOutIfHeld(async () => ({ heldInRoom: true }))
  await renderMoney({ ...emptyStore(), drafts: {} })
  expect(writeMoneyShareFile).not.toHaveBeenCalled()
})

let navigate: ReturnType<typeof useInvoiceNavigation> | undefined
const NavigationProbe = () => { navigate = useInvoiceNavigation({}, true); return null }

it('a normal tab remembers where the person was', async () => {
  sitIn('alone')
  await act(async () => root.render(<NavigationProbe />))
  await act(async () => { await navigate!.updateNavigation({ destination: 'clients' }) })
  expect(saveInvoiceNavigationSettings).toHaveBeenCalledTimes(1)
})

it('a held copy moves in its own memory and leaves the saved place alone', async () => {
  sitIn('shell')
  await findOutIfHeld(async () => ({ heldInRoom: true }))
  await act(async () => root.render(<NavigationProbe />))
  await act(async () => { await navigate!.updateNavigation({ destination: 'clients' }) })
  expect(navigate!.navigation.destination).toBe('clients')
  expect(saveInvoiceNavigationSettings).not.toHaveBeenCalled()
})
