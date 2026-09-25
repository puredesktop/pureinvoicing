import { localToday } from './defaults'
import { termsDueDate } from './lifecycle'
import type { Business, Client, InvoiceContent, Presentation } from './types'
// Deliberately illustrative content; never inserted into the invoice archive or sequence.
// With a client, it is a test invoice to that client: their billing details, currency and usual terms.
export function templatePreviewContent(business: Business, presentation: Presentation, client?: Client | null): InvoiceContent {
  const { defaultPaymentInstructions, ...sender } = business
  const today = localToday()
  const recipient = client
    ? { name: client.name, address: client.billingAddress, ...(client.contactName ? { contactName: client.contactName } : {}), ...(client.email ? { email: client.email } : {}), ...(client.taxIdentifier ? { taxIdentifier: client.taxIdentifier } : {}) }
    : { name: '', address: '' }
  return { sender: { ...sender, name: sender.name, address: sender.address },
    recipient, invoiceDate: today, dueDate: client ? termsDueDate(today, client.termsDays) ?? today : today,
    ...(client?.termsDays !== undefined ? { termsDays: client.termsDays } : {}),
    currency: client?.currency || 'USD', reference: 'Template preview only',
    lineItems: [],
    notes: '', paymentInstructions: defaultPaymentInstructions, presentation }
}
