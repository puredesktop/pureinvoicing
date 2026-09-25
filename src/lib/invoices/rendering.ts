import { captureInvoicePage, prepareInvoicePages, printInvoiceDocument, readPlatformFileBinary, readPlatformTextFile } from '../../bridge/platformBridge'
import { ASSET_LIMIT, pdfPages, readRetainedAsset, retainBytes } from './assets'
import { documentIdForVersion } from './versionDocuments'
import { calculateInvoice } from './calculations'
import { fontDiagnostics, invoiceHtml, presentationDiagnostics } from './presentation'
import type { InvoiceRepository } from './repository'
import type { Diagnostic, InvoiceContent, RetainedDocument } from './types'
export interface PreviewPage { pageNumber: number; text: string; imageDataUrl?: string; imagePath?: string; diagnostics: Diagnostic[] }
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)
// Compare character inventories per page: renderer text ordering differs for running margin boxes.
// Whitespace and discretionary hyphens are layout artifacts; every other character must survive.
/** The characters of `expected` that `actual` does not account for, in order; empty when every one printed. */
export function missingPrintedText(actual: string, expected: string): string {
  const counts = new Map<string, number>()
  // Case is left out: labels are set in capitals by the stylesheet (INVOICE, BILL TO) while the source says Invoice, Bill to.
  const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('en').replace(/[\s\u00ad\u200b]/gu, '')
  for (const char of normalize(actual)) counts.set(char, (counts.get(char) ?? 0) + 1)
  let missing = ''
  for (const char of normalize(expected)) {
    if (!counts.get(char)) { missing += char; continue }
    counts.set(char, counts.get(char)! - 1)
  }
  return missing
}
export const containsPrintedText = (actual: string, expected: string) => !missingPrintedText(actual, expected)
export async function renderInvoice(repository: InvoiceRepository, content: InvoiceContent, number: number, currencyReviewRequired = false, label: string = String(number)) {
  let store = await repository.current()
  if (repository.getSnapshot().status !== 'saved') throw new Error('Save or resolve pending edits before preparing a retained preview.')
  const calculation = calculateInvoice(content, currencyReviewRequired)
  const diagnostics: Diagnostic[] = [...calculation.diagnostics, ...calculation.warnings, ...presentationDiagnostics(content.presentation), ...fontDiagnostics(content)]
  const pages: PreviewPage[] = []
  let document: RetainedDocument | undefined
  let logoDataUrl: string | undefined
  try {
    const id = await documentIdForVersion(store, content, number, label)
    document = store.documents?.[id]
    if (!document && content.presentation.logoAssetId) {
      const logo = await readRetainedAsset(store, content.presentation.logoAssetId, 'logo')
      logoDataUrl = `data:${logo.mimeType};base64,${logo.base64}`
    }
    if (presentationDiagnostics(content.presentation).length) return { pages, pageCount: 0, diagnostics, calculation, canFinalize: false, document }
    if (!document) {
      const htmlBytes = new TextEncoder().encode(invoiceHtml(content, label, logoDataUrl))
      // Retain the complete self-contained source, including exact font and logo bytes.
      let binary = ''
      for (const byte of htmlBytes) binary += String.fromCharCode(byte)
      const asset = await retainBytes(repository, `invoice-${label}.html`, 'text/html', btoa(binary))
      document = { id, htmlAssetId: asset.id, pageCount: 0 }
    }
    store = await repository.current()
    const source = await readRetainedAsset(store, document.htmlAssetId)
    const htmlPath = source.path
    const html = await readPlatformTextFile(htmlPath)
    const prepared = await prepareInvoicePages(htmlPath)
    if (!Number.isSafeInteger(prepared.pageCount) || prepared.pageCount < 1) throw new Error('The renderer returned no pages.')
    const parsed = new DOMParser().parseFromString(prepared.html, 'text/html')
    // Running elements (.identity, .footer) stay in the content flow as hidden originals; only their
    // margin-box copies print, so the originals are left out of what each page is expected to show.
    // The first page's identity box is hidden by presentation.ts's `@page:first { @top-center { content: none } }`,
    // yet paged.js still fills it (and marks it hasContent), so it is left out here the same way.
    parsed.querySelectorAll('.pagedjs_page_content .identity, .pagedjs_page_content .footer, .pagedjs_first_page .pagedjs_margin-top-center').forEach(node => node.remove())
    const pageNodes = [...parsed.querySelectorAll('.pagedjs_page')]
    if (pageNodes.length !== prepared.pageCount) diagnostics.push({ field: 'preview', message: 'Cannot read every paginated page. Final output is blocked.' })
    for (let index = 1; index <= prepared.pageCount; index++) {
      const page: PreviewPage = { pageNumber: index, text: pageNodes[index - 1]?.textContent ?? '', diagnostics: [] }
      pages.push(page)
      try {
        const captured = await captureInvoicePage(htmlPath, `${htmlPath}.page-${index}.png`, index)
        if (captured.pageCount !== prepared.pageCount || captured.page !== index) throw new Error('Pagination changed between page preparation and capture.')
        const metrics = captured.metrics
        if (!metrics || typeof metrics.overlappingBlocks !== 'number' || typeof metrics.overflowingBlocks !== 'number') throw new Error('The renderer did not supply overlap and overflow diagnostics.')
        if (metrics.overlappingBlocks > 0) page.diagnostics.push({ field: `pages.${index}`, message: 'Content overlaps. Adjust spacing or margins.' })
        if (metrics.overflowingBlocks > 0 || metrics.usedHeightRatio > 1.01) page.diagnostics.push({ field: `pages.${index}`, message: 'Content extends outside the printable area.' })
        if (!page.text.trim()) page.diagnostics.push({ field: `pages.${index}`, message: 'Page text is unreadable or empty.' })
        const image = await readPlatformFileBinary(captured.imagePath, ASSET_LIMIT)
        if (image.truncated || !image.byteLength) throw new Error('The page rendering is unreadable.')
        page.imagePath = captured.imagePath; page.imageDataUrl = `data:${image.mimeType};base64,${image.base64}`
      } catch (error) {
        console.error('Invoice page validation failed', error)
        page.diagnostics.push({ field: `pages.${index}`, message: errorMessage(error) })
      }
    }
    // Ensure pagination did not lose any source content, including very long descriptions.
    const sourceDom = new DOMParser().parseFromString(html, 'text/html')
    sourceDom.querySelector('.identity')?.remove()
    if (!containsPrintedText(pages.map(p => p.text).join(' '), sourceDom.body.textContent ?? '')) diagnostics.push({ field: 'preview', message: 'Pagination omitted document text.' })
    diagnostics.push(...pages.flatMap(p => p.diagnostics))
    if (!diagnostics.length) {
      let pdfBase64: string
      let existingPdf: string | undefined
      if (document.pdfAssetId) {
        try { existingPdf = (await readRetainedAsset(store, document.pdfAssetId, 'pdf')).base64 }
        catch (error) { console.error('Retained PDF unavailable; regenerating from retained HTML', error) }
      }
      if (existingPdf) pdfBase64 = existingPdf
      else {
        const pdfPath = await printInvoiceDocument(htmlPath, `${htmlPath}.pdf`, content.presentation.pageSize)
        const pdf = await readPlatformFileBinary(pdfPath, ASSET_LIMIT)
        if (pdf.truncated || !pdf.byteLength) throw new Error('The PDF is unreadable or exceeds 40 MB.')
        pdfBase64 = pdf.base64
      }
      const printedPages = await pdfPages(pdfBase64)
      if (printedPages.length !== pages.length) throw new Error('PDF pagination differs from the preview. Final output is blocked.')
      // The continuation header is hidden on the first page (@page:first), so its text is not expected there.
      for (const [index, page] of pages.entries()) {
        const expected = page.text
        const missing = missingPrintedText(printedPages[index], expected)
        if (missing) {
          console.warn(`Invoice page ${index + 1}: PDF text is missing ${JSON.stringify(missing.slice(0, 200))}`)
          const diagnostic = { field: `pages.${index + 1}`, message: 'PDF text differs from this preview page or contains unreadable glyphs.' }
          page.diagnostics.push(diagnostic); diagnostics.push(diagnostic)
        }
      }
      if (!diagnostics.length && !existingPdf) {
        const pdf = await retainBytes(repository, `invoice-${label}.pdf`, 'application/pdf', pdfBase64)
        document = { ...document, pdfAssetId: pdf.id }
      }
    }
    document = { ...document, pageCount: prepared.pageCount }
    const retained = document
    await repository.transact(s => ({ ...s, documents: { ...s.documents, [id]: retained } }))
  } catch (error) {
    console.error('Invoice rendering failed', error)
    diagnostics.push({ field: 'preview', message: errorMessage(error) })
  }
  return { pages, pageCount: pages.length, diagnostics, calculation, canFinalize: diagnostics.length === 0 && !!document?.pdfAssetId, document }
}
// Finalization callers must use this gate with their exact approved number and content.
export async function requirePrintableInvoice(repository: InvoiceRepository, content: InvoiceContent, number: number, currencyReviewRequired = false, label: string = String(number)) {
  const preview = await renderInvoice(repository, content, number, currencyReviewRequired, label)
  if (!preview.canFinalize) throw new Error(preview.diagnostics.map(d => `${d.field}: ${d.message}`).join('\n') || 'Preview validation is incomplete.')
  return preview
}
