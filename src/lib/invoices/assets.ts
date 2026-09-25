// The legacy build: Electron's Chromium lacks APIs the modern pdf.js build needs (Uint8Array.prototype.toHex).
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { createInvoiceAssetFolder, isStandaloneDevMode, openPlatformFileDialog, openPlatformImageDialog, readPlatformFileBinary, writePlatformFileBinary } from '../../bridge/platformBridge'
import { newId } from './defaults'
import type { InvoiceRepository } from './repository'
import type { InvoiceStore, RetainedAsset } from './types'
GlobalWorkerOptions.workerSrc = workerUrl
export const ASSET_LIMIT = 40 * 1024 * 1024
export const bytesOf = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0))
export async function digest(bytes: Uint8Array): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(result), b => b.toString(16).padStart(2, '0')).join('')
}
export async function pdfPages(base64: string) {
  const task = getDocument({ data: bytesOf(base64), useSystemFonts: false })
  try {
    const pdf = await task.promise
    if (!pdf.numPages) throw new Error('The PDF has no readable pages.')
    const pages: string[] = []
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index)
      await page.getOperatorList() // Decode page resources, including image-only historical originals.
      const text = await page.getTextContent()
      pages.push(text.items.map(item => 'str' in item ? item.str : '').join(' '))
    }
    return pages
  } finally { await task.destroy() }
}
export async function validateAssetBytes(base64: string, mimeType: string) {
  if (mimeType === 'application/pdf') { await pdfPages(base64); return }
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) throw new Error('Choose a PNG, JPEG, WebP, GIF logo, or a PDF reference.')
  const image = new Image()
  image.src = `data:${mimeType};base64,${base64}`
  await image.decode()
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('The logo is unreadable.')
}
export async function readRetainedAsset(store: InvoiceStore, id: string, expected?: 'logo' | 'pdf') {
  if (isStandaloneDevMode()) throw new Error('Retained files need the PureDesktop shell; open PureInvoicing inside PureDesktop.')
  const asset = Object.hasOwn(store.assets, id) ? store.assets[id] : undefined
  if (!asset?.path || !asset.sha256) throw new Error('Retained asset is missing. Replace or remove it.')
  if (expected === 'logo' && !asset.mimeType.startsWith('image/')) throw new Error('Select a readable logo image.')
  if (expected === 'pdf' && asset.mimeType !== 'application/pdf') throw new Error('Select a readable PDF.')
  const file = await readPlatformFileBinary(asset.path, ASSET_LIMIT)
  if (file.truncated || !file.byteLength || await digest(bytesOf(file.base64)) !== asset.sha256) throw new Error(`Retained file ${asset.name} is missing, changed, or unreadable. Replace or remove it.`)
  if (expected) await validateAssetBytes(file.base64, asset.mimeType)
  return { ...file, mimeType: asset.mimeType }
}
export async function retainBytes(repository: InvoiceRepository, name: string, mimeType: string, base64: string): Promise<RetainedAsset> {
  const id = newId(), folder = await createInvoiceAssetFolder(id)
  const path = `${folder}/${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  await writePlatformFileBinary(path, base64)
  const sha256 = await digest(bytesOf(base64))
  const copy = await readPlatformFileBinary(path, ASSET_LIMIT)
  if (copy.truncated || await digest(bytesOf(copy.base64)) !== sha256) throw new Error('The retained copy could not be verified.')
  const asset = { id, path, name, mimeType, sha256, byteLength: copy.byteLength, readable: true }
  await repository.transact(s => ({ ...s, assets: { ...s.assets, [id]: asset } }))
  return asset
}
export async function importInvoiceAsset(repository: InvoiceRepository, kind: 'logo' | 'pdf') {
  await repository.current()
  const path = await (kind === 'logo' ? openPlatformImageDialog() : openPlatformFileDialog())
  if (!path) return { cancelled: true as const }
  const file = await readPlatformFileBinary(path, ASSET_LIMIT)
  if (file.truncated || !file.byteLength) throw new Error('Choose a readable file smaller than 40 MB.')
  if (kind === 'pdf' && file.mimeType !== 'application/pdf') throw new Error('Choose a PDF historical reference.')
  if (kind === 'logo' && !file.mimeType.startsWith('image/')) throw new Error('Choose an image logo.')
  await validateAssetBytes(file.base64, file.mimeType)
  const asset = await retainBytes(repository, path.split('/').pop()!, file.mimeType, file.base64)
  return { cancelled: false as const, asset }
}
