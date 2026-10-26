import { isInvoiceStoragePermissionUnavailable } from '../bridge/invoiceStorageCapabilities'
import { useEffect, useSyncExternalStore } from 'react'
import { canUseInvoiceStorage, isStandaloneDevMode } from '../bridge/platformBridge'
import { invoiceCommands, invoiceRepository } from '../lib/invoices/workspace'
import { useMoneyShare } from './useMoneyShare'
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
  useMoneyShare(state.value, storageReady && state.status === 'saved')
  return {
    ...state,
    storageUnavailable: ready && !storageReady,
    commands: invoiceCommands,
  }
}
