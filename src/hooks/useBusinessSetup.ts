import { useState } from 'react'
import { invoiceCommands } from '../lib/invoices/workspace'
import { nextAvailableNumber } from '../lib/invoices/updates'
import { presentationDiagnostics } from '../lib/invoices/presentation'
import { DEFAULT_NUMBER_PATTERN, formatInvoiceNumber, suggestNumberFormat, validateNumberPattern } from '../lib/invoices/numbering'
import { localToday } from '../lib/invoices/defaults'
import type { Business, InvoiceStore, Presentation } from '../lib/invoices/types'
interface TemplatePreviewState { inputKey: string; result: Awaited<ReturnType<typeof invoiceCommands.getTemplatePreview>> }
export function useBusinessSetup(store: InvoiceStore) {
  const [businessEdits, setBusinessEdits] = useState<Business | null>(null)
  const [templateEdits, setTemplateEdits] = useState<Presentation | null>(null)
  const [numberText, setNumberText] = useState<string | null>(null)
  const [patternText, setPatternText] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const [confirmation, setConfirmation] = useState<{ from: number; to: number } | null>(null)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const [preview, setPreview] = useState<TemplatePreviewState | null>(null)
  const business = businessEdits ?? store.business, template = templateEdits ?? store.template
  const nextNumber = nextAvailableNumber(store.sequence), number = numberText ?? String(nextNumber)
  const previewKey = JSON.stringify({ business, template, nextNumber })
  const pattern = patternText ?? store.sequence.format?.pattern ?? DEFAULT_NUMBER_PATTERN
  const patternError = validateNumberPattern(pattern)
  const validNumber = /^\d+$/.test(number) && Number.isSafeInteger(Number(number)) && Number(number) >= nextNumber && Number(number) < Number.MAX_SAFE_INTEGER
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('')
    try { await action() }
    catch (error) { console.error('Business setup action failed', error); setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return {
    business, template, number, nextNumber, validNumber, verified, confirmation, busy, message, error, preview: preview?.inputKey === previewKey ? preview.result : null,
    dirtyBusiness: businessEdits !== null, dirtyTemplate: templateEdits !== null,
    pattern, patternError, dirtyPattern: patternText !== null && patternText !== (store.sequence.format?.pattern ?? DEFAULT_NUMBER_PATTERN),
    nextLabel: formatInvoiceNumber(validNumber ? Number(number) : nextNumber, patternError ? DEFAULT_NUMBER_PATTERN : pattern, localToday()),
    editPattern: (value: string) => { setPatternText(value); setMessage('') },
    /** Read a pattern and counter out of a number the person already uses. */
    suggestFrom: (text: string) => { const found = suggestNumberFormat(text); if (found) { setPatternText(found.pattern); setNumberText(String(found.number + 1)); setVerified(false); setConfirmation(null) } return found },
    savePattern: () => run(async () => { await invoiceCommands.setNumberFormat({ pattern }); setPatternText(null); setMessage('Number format saved. Issued invoices keep the labels they were given.') }),
    diagnostics: presentationDiagnostics(template),
    editBusiness: (patch: Partial<Business>) => { setBusinessEdits({ ...business, ...patch }); setPreview(null); setMessage('') },
    editTemplate: (patch: Partial<Presentation>) => { setTemplateEdits({ ...template, ...patch }); setPreview(null); setMessage('') },
    editNumber: (value: string) => { setNumberText(value); setVerified(false); setConfirmation(null) },
    setVerified,
    saveBusiness: () => run(async () => { await invoiceCommands.updateBusinessIdentity({ details: business }); setBusinessEdits(null); setMessage('Business defaults saved. Existing work is unchanged.') }),
    saveTemplate: () => run(async () => { await invoiceCommands.setDefaultTemplate(template); setTemplateEdits(null); setMessage('Template defaults saved. Existing work is unchanged.') }),
    requestNumber: () => setConfirmation({ from: nextNumber, to: Number(number) }),
    cancelNumber: () => setConfirmation(null),
    confirmNumber: () => run(async () => {
      if (!confirmation || confirmation.from !== nextNumber) throw new Error('The next number changed. Cancel and review the new sequence position.')
      await invoiceCommands.setNextInvoiceNumber({ nextNumber: confirmation.to, unregisteredHistoryChecked: verified })
      setNumberText(null); setVerified(false); setConfirmation(null); setMessage('Number sequence saved.')
    }),
    importLogo: () => run(async () => {
      const result = await invoiceCommands.importInvoiceAsset('logo')
      if (!result.cancelled) { setTemplateEdits({ ...template, logoAssetId: result.asset.id }); setPreview(null); setMessage('Logo ready. Save the template to use it for future drafts.') }
    }),
    preparePreview: () => run(async () => { setPreview(null); setPreview({ inputKey: previewKey, result: await invoiceCommands.getTemplatePreview({ business, settings: template }) }) }),
  }
}
export type BusinessSetup = ReturnType<typeof useBusinessSetup>
