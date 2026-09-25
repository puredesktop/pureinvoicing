import { digest } from './assets'
import type { InvoiceContent, InvoiceStore } from './types'
/** The retained-document key. The label joins it only when it differs from the bare counter, so documents kept before number formats still resolve. */
export async function documentIdForVersion(_store: InvoiceStore, content: InvoiceContent, number: number, label: string = String(number)) {
  return digest(new TextEncoder().encode(JSON.stringify(label === String(number) ? { content, number } : { content, number, label })))
}
