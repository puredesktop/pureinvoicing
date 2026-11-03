import { isInvoiceStoragePermissionUnavailable } from '../bridge/invoiceStorageCapabilities'
import { useEffect, useSyncExternalStore } from 'react'
import { canUseInvoiceStorage, isStandaloneDevMode } from '../bridge/platformBridge'
import { invoiceCommands, invoiceRepository } from '../lib/invoices/workspace'
import { useMoneyShare } from './useMoneyShare'
/** How often a copy looks for what other copies saved. */
const STORE_LOOK_MS = 15_000
export function useInvoiceWorkspace(ready: boolean, methods: readonly string[] | undefined) {
  const state = useSyncExternalStore(invoiceRepository.subscribe, invoiceRepository.getSnapshot)
  const storageReady = canUseInvoiceStorage(ready, methods) || isStandaloneDevMode()
  useEffect(() => {
    invoiceRepository.setEnabled(storageReady)
    if (storageReady) void invoiceRepository.initialize().catch(error => {
      // The repository exposes permission denial with recovery guidance.
      if (!isInvoiceStoragePermissionUnavailable(error)) console.error('Invoice workspace startup failed', error)
    })
  }, [storageReady])
  // Other copies of the app save to the same file: this one follows them, on a timer and when it comes back into view.
  useEffect(() => {
    if (!storageReady) return
    const look = () => { void invoiceRepository.sync().catch(error => console.warn('Invoice store could not be re-read', error)) }
    const timer = window.setInterval(look, STORE_LOOK_MS)
    window.addEventListener('focus', look)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', look) }
  }, [storageReady])
  useMoneyShare(state.value, storageReady && state.status === 'saved')
  return {
    ...state,
    storageUnavailable: ready && !storageReady,
    commands: invoiceCommands,
  }
}
