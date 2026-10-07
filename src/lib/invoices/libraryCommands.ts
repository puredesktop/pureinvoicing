import { convertPlatformDocument, openPlatformFileDialog, readPlatformFileBinary } from '../../bridge/platformBridge'
import { ASSET_LIMIT, pdfPages, readRetainedAsset, retainBytes } from './assets'
import { newId } from './defaults'
import { addLibraryDocument, getLibraryDocument, LIBRARY_KINDS, libraryExcerpt, libraryRows, removeLibraryDocument, updateLibraryDocument, type LibraryPatch, type LibraryQuery } from './library'
import type { InvoiceRepository } from './repository'
import type { LibraryKind } from './types'

/**
 * The library's commands: the screen's and the drawer's, the same code. A
 * document comes in from a file the person chooses (or names, for the
 * drawer): a copy is retained and its words read once, so the drawer can
 * use them later without the file.
 */
const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const textOf = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

/** The words of a file, as far as they can be read here: a PDF's text, a Word document's, a text file's own. Empty when none. */
export async function readDocumentText(path: string, mimeType: string, base64: string): Promise<string> {
  if (mimeType === 'application/pdf') return (await pdfPages(base64)).join('\n\n').trim()
  if (mimeType === WORD || /\.docx$/i.test(path)) {
    try { return textOf((await convertPlatformDocument({ path })).html) } catch { return '' }
  }
  if (mimeType.startsWith('text/') || /\.(txt|md|csv|json)$/i.test(path)) return decodeURIComponent(escape(atob(base64))).trim()
  return ''
}

export function createLibraryCommands(repository: InvoiceRepository) {
  const read = () => repository.current()
  const shown = (store: Awaited<ReturnType<typeof read>>, id: string) => {
    const d = getLibraryDocument(store, id)
    return { ...d, text: undefined, words: d.text.length, clientName: d.clientId ? store.clients[d.clientId]?.name : undefined }
  }
  async function keep(path: string, input: { title?: string; kind?: LibraryKind; clientId?: string; notes?: string }) {
    const file = await readPlatformFileBinary(path, ASSET_LIMIT)
    if (file.truncated || !file.byteLength) throw new Error('Choose a readable file smaller than 40 MB.')
    const fileName = path.split('/').pop() ?? 'document'
    const text = await readDocumentText(path, file.mimeType, file.base64)
    const asset = await retainBytes(repository, fileName, file.mimeType, file.base64)
    const id = newId(), now = new Date().toISOString()
    const store = await repository.transact(s => addLibraryDocument(s, { ...input, assetId: asset.id, fileName, mimeType: file.mimeType, text }, id, now))
    return { document: shown(store, id), readable: text.length > 0, saveStatus: 'saved' as const }
  }
  return {
    async listLibrary(query: LibraryQuery = {}) {
      const store = await read()
      return { documents: libraryRows(store, query).map(d => shown(store, d.id)), kinds: LIBRARY_KINDS, saveStatus: repository.getSnapshot().status }
    },
    /** A document's words, for the drawer: clipped to what a prompt can carry. */
    async readLibraryDocument(args: { documentId: string }) {
      const store = await read()
      const d = getLibraryDocument(store, args.documentId)
      const excerpt = libraryExcerpt(d)
      return { ...shown(store, d.id), ...excerpt, note: d.text ? (excerpt.clipped ? 'The words were cut at 12,000 characters; open the document for the rest.' : undefined) : 'This file has no text that can be read here (a scan, a picture): open it to read it.' }
    },
    /** The person chooses a file; kept with what they said about it. */
    async addLibraryDocument(args: { title?: string; kind?: LibraryKind; clientId?: string; notes?: string } = {}) {
      await read()
      const path = await openPlatformFileDialog()
      if (!path) return { cancelled: true as const }
      return { cancelled: false as const, ...(await keep(path, args)) }
    },
    /** The drawer names the file (a path the person gave it). */
    async addLibraryDocumentFromPath(args: { path: string; title?: string; kind?: LibraryKind; clientId?: string; notes?: string }) {
      if (!args.path?.trim()) throw new Error('path is the file to keep.')
      return keep(args.path.trim(), args)
    },
    async updateLibraryDocument(args: { documentId: string; changes: LibraryPatch }) {
      const store = await repository.transact(s => updateLibraryDocument(s, args.documentId, args.changes, new Date().toISOString()))
      return { document: shown(store, args.documentId), saveStatus: 'saved' as const }
    },
    async removeLibraryDocument(args: { documentId: string }) {
      await repository.transact(s => removeLibraryDocument(s, args.documentId))
      return { removed: args.documentId, saveStatus: 'saved' as const }
    },
    /** The retained copy as a file the shell can open. */
    async libraryDocumentPath(args: { documentId: string }) {
      const store = await read()
      const d = getLibraryDocument(store, args.documentId)
      await readRetainedAsset(store, d.assetId)
      const asset = store.assets[d.assetId]
      if (!asset?.path) throw new Error('The retained copy is missing.')
      return { path: asset.path, name: d.fileName }
    },
  }
}
export type LibraryCommands = ReturnType<typeof createLibraryCommands>
