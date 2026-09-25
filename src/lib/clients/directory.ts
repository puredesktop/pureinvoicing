import type { Client, Party } from '../invoices/types'

export type ClientDetails = Omit<Client, 'id' | 'updatedAt'>
export interface ClientEditorState {
  clientId?: string
  details: ClientDetails
  source: 'directory' | 'recipient'
}
export function recipientDetails(recipient: Party): ClientDetails {
  return { name: recipient.name, billingAddress: recipient.address, contactName: recipient.contactName ?? '',
    email: recipient.email ?? '', phone: recipient.phone ?? '', taxIdentifier: recipient.taxIdentifier ?? '' }
}
export function missingBillingDetails(details: ClientDetails): string[] {
  return [!details.name.trim() && 'recipient name', !details.billingAddress.trim() && 'billing address'].filter((field): field is string => !!field)
}
