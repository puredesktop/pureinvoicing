import { useEffect } from 'react'
import { readMoneyShareRequest, writeMoneyShareFile } from '../bridge/platformBridge'
import { isHeldCopy } from '../lib/heldCopy'
import { createMoneySharePublisher } from '../lib/invoices/moneyShare'
import type { InvoiceStore } from '../lib/invoices/types'

const publisher = createMoneySharePublisher({ readRequest: readMoneyShareRequest, write: writeMoneyShareFile })

/**
 * Keeps the Executive app's money share current: once the store has loaded
 * (the app opening) and after every saved change, the share is rewritten if
 * the Executive app has asked for it. A burst of edits publishes once. A copy
 * held in a page never publishes: the app's normal tab does, or a held copy's
 * older view could land over a newer read-out.
 */
export function useMoneyShare(store: InvoiceStore, saved: boolean): void {
  useEffect(() => {
    if (!saved || isHeldCopy()) return
    const timer = setTimeout(() => {
      publisher.publish(store).catch(error => console.error('The money share for the Executive app was not written', error))
    }, 400)
    return () => clearTimeout(timer)
  }, [store, saved])
}
