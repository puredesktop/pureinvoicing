import type { InvoiceStore, NavigationPreferences, Presentation } from './types'
export const defaultPresentation: Presentation = {
  logoAssetId: null, logoWidthMm: 35, logoPlacement: 'left', letterheadText: '',
  letterheadAlignment: 'left', letterheadTextSizePt: 12, footerText: '', footerAlignment: 'left',
  footerTextSizePt: 9, typeStyle: 'sans', bodyTextSizePt: 11, lineSpacing: 1.4,
  sectionSpacingMm: 6, accentColor: '#284B63', pageSize: 'A4',
  marginsMm: { top: 18, right: 18, bottom: 18, left: 18 }, showPageNumbers: true,
}
export function emptyStore(): InvoiceStore {
  return { schemaVersion: 1, business: { name: '', address: '', defaultPaymentInstructions: '' },
    template: structuredClone(defaultPresentation), clients: {}, drafts: {}, invoices: {}, assets: {},
    sequence: { verified: false, nextNumber: 1, reservedNumbers: [], history: [] } }
}
export const defaultNavigation: NavigationPreferences = {
  destination: 'invoices', archive: {}, selectedInvoiceId: null, scrollTop: 0,
}
export function localToday(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function newId(): string { return crypto.randomUUID() }
export const supportedCurrencies = Intl.supportedValuesOf('currency')
