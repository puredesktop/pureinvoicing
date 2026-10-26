import { useEffect } from 'react'
import { readMoneyShareRequest, writeMoneyShareFile } from '../bridge/platformBridge'
import { createMoneySharePublisher } from '../lib/invoices/moneyShare'
import type { InvoiceStore } from '../lib/invoices/types'

const publisher = createMoneySharePublisher({ readRequest: readMoneyShareRequest, write: writeMoneyShareFile })

/**
 * Keeps the Executive app's money share current: once the store has loaded
 * (the app opening) and after every saved change, the share is rewritten if
 * the Executive app has asked for it. A burst of edits publishes once.
 */
export function useMoneyShare(store: InvoiceStore, saved: boolean): void {
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => {
      publisher.publish(store).catch(error => console.error('The money share for the Executive app was not written', error))
    }, 400)
    return () => clearTimeout(timer)
  }, [store, saved])
}
