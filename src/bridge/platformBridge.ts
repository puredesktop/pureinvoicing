import { bridge } from '@purescience/platform-ui/bridge/client'
import {
  getPlatformAppSettings,
  updatePlatformAppSettings,
} from '@purescience/platform-ui/bridge/appSettings'
import {
  getPlatformPreferences,
  patchPlatformPreferences,
} from '@purescience/platform-ui/bridge/preferences'
import {
  createPlatformFolder,
  deletePlatformFile,
  listPlatformFiles,
  readPlatformFileBinary,
  readPlatformFileBinaryDataUrl,
  readPlatformFilePreview,
  readPlatformFilePreviewUrl,
  readPlatformTextFile,
  renamePlatformFile,
  writePlatformFileBinary,
  writePlatformTextFile,
} from '@purescience/platform-ui/bridge/fs'
import {
  openPlatformFileDialog,
  openPlatformFolderDialog,
  openPlatformImageDialog,
  savePlatformFolderDialog,
} from '@purescience/platform-ui/bridge/dialog'
import {
  readPlatformStorageJson,
  writePlatformStorageJson,
} from '@purescience/platform-ui/bridge/storage'
import { toggleAgentDrawer } from '@purescience/platform-ui/bridge/workspace'
import { APP_SLUG } from '../constants'
import { canUseInvoiceStorage } from './invoiceStorageCapabilities'
import type { AppSettings } from '../types'
import type {
  PlatformFileCreateFolderResult,
  PlatformFileDeleteResult,
  PlatformFileEntry,
  PlatformFileListResult,
  PlatformFilePreviewUrlResult,
  PlatformFileReadBinaryResult,
  PlatformFileReadPreviewResult,
  PlatformFileRenameResult,
  PlatformFileWriteResult,
} from '@purescience/platform-ui/bridge/fs'
import type {
  PlatformStorageJsonReadResult,
  PlatformStorageJsonRequest,
  PlatformStorageJsonWriteRequest,
  PlatformStorageJsonWriteResult,
} from '@purescience/platform-ui/bridge/storage'

export {
  canUseInvoiceStorage,
  getPlatformAppSettings,
  updatePlatformAppSettings,
  getPlatformPreferences,
  patchPlatformPreferences,
  createPlatformFolder,
  deletePlatformFile,
  listPlatformFiles,
  readPlatformFileBinary,
  readPlatformFileBinaryDataUrl,
  readPlatformFilePreview,
  readPlatformFilePreviewUrl,
  readPlatformTextFile,
  renamePlatformFile,
  writePlatformFileBinary,
  writePlatformTextFile,
  openPlatformFileDialog,
  openPlatformFolderDialog,
  openPlatformImageDialog,
  savePlatformFolderDialog,
  readPlatformStorageJson,
  writePlatformStorageJson,
  toggleAgentDrawer,
  bridge,
}
export type {
  PlatformFileCreateFolderResult,
  PlatformFileDeleteResult,
  PlatformFileEntry,
  PlatformFileListResult,
  PlatformFilePreviewUrlResult,
  PlatformFileReadBinaryResult,
  PlatformFileReadPreviewResult,
  PlatformFileRenameResult,
  PlatformFileWriteResult,
  PlatformStorageJsonReadResult,
  PlatformStorageJsonRequest,
  PlatformStorageJsonWriteRequest,
  PlatformStorageJsonWriteResult,
}

const STANDALONE_SETTINGS_KEY = 'puredesktop:invoicing:settings'

export function isStandaloneDevMode(): boolean {
  return import.meta.env.DEV && window.parent === window
}

function readStandaloneSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(STANDALONE_SETTINGS_KEY)
    return raw ? (JSON.parse(raw) as AppSettings) : {}
  } catch {
    return {}
  }
}

export async function fetchAppSettings(): Promise<AppSettings> {
  if (isStandaloneDevMode()) {
    return readStandaloneSettings()
  }

  return getPlatformAppSettings(APP_SLUG) as Promise<AppSettings>
}

// Invoice records are always shell-backed, including when the UI is in development.
const INVOICE_STORE_REQUEST: PlatformStorageJsonRequest = { appSlug: APP_SLUG, fileName: `${APP_SLUG}-workspace.json` }
export function readInvoiceWorkspaceStorage() {
  return readPlatformStorageJson(INVOICE_STORE_REQUEST)
}
export function writeInvoiceWorkspaceStorage(value: unknown, ifMatch: string | null) {
  return writePlatformStorageJson({ ...INVOICE_STORE_REQUEST, value, ifMatch })
}
export async function saveInvoiceNavigationSettings(invoiceNavigation: import('../lib/invoices/types').NavigationPreferences) {
  if (isStandaloneDevMode()) {
    window.localStorage.setItem(STANDALONE_SETTINGS_KEY, JSON.stringify({ ...readStandaloneSettings(), invoiceNavigation }))
    return { ok: true }
  }
  return updatePlatformAppSettings({ appSlug: APP_SLUG, patch: { invoiceNavigation } })
}

/** A bulk-import JSON file the person chose. */
export async function readImportFile(path: string): Promise<unknown> {
  requireShell('Reading a file')
  const text = await readPlatformTextFile(path)
  return JSON.parse(text)
}
/** An original PDF referenced by an import row, relative to the JSON file. */
export async function readImportPdf(path: string) {
  requireShell('Reading a file')
  const file = await readPlatformFileBinary(path, 40 * 1024 * 1024)
  if (file.truncated || !file.byteLength) throw new Error(`${path} is missing or larger than 40 MB.`)
  if (file.mimeType !== 'application/pdf') throw new Error(`${path} is not a PDF.`)
  return file
}
export function chooseImportFile() {
  requireShell('Choosing a file')
  return openPlatformFileDialog()
}

// Rendering, retained files and exports need the shell; standalone says so at once instead of waiting forever.
function requireShell(what: string): void {
  if (isStandaloneDevMode()) throw new Error(`${what} needs the PureDesktop shell; open PureInvoicing inside PureDesktop.`)
}

// Keep render request shapes and app-owned filesystem locations at this boundary.
import { preparePagedPreview, capturePagedSnapshot, renderPrintHtml } from '@purescience/platform-ui/bridge/render'
export async function createInvoiceAssetFolder(id: string) {
  requireShell('Keeping a retained copy')
  const storage = await readInvoiceWorkspaceStorage()
  const parent = storage.path.slice(0, storage.path.lastIndexOf('/'))
  return (await createPlatformFolder(parent, `invoice-asset-${id}`)).path
}
export function prepareInvoicePages(htmlPath: string) {
  requireShell('Page rendering')
  return preparePagedPreview({ htmlPath, basePath: htmlPath.slice(0, htmlPath.lastIndexOf('/')) })
}
export function captureInvoicePage(htmlPath: string, outputPath: string, page: number) {
  return capturePagedSnapshot({ htmlPath, outputPath, page, basePath: htmlPath.slice(0, htmlPath.lastIndexOf('/')) })
}
export function printInvoiceDocument(htmlPath: string, outputPath: string, pageSize: string) {
  return renderPrintHtml({ htmlPath, outputPath, pageSize, paginate: 'pagedjs', basePath: htmlPath.slice(0, htmlPath.lastIndexOf('/')) })
}
// A unique child folder avoids overwriting a file, even if another app exports concurrently.
export async function exportInvoiceBytes(fileName: string, base64: string, beforeWrite?: () => Promise<void>) {
  requireShell('Saving a PDF')
  const parent = await savePlatformFolderDialog()
  if (!parent) return { cancelled: true as const }
  await beforeWrite?.()
  const folder = await createPlatformFolder(parent, `${fileName.replace(/\.pdf$/i, '')}-${crypto.randomUUID()}`)
  const path = `${folder.path}/${fileName}`
  await writePlatformFileBinary(path, base64)
  return { cancelled: false as const, path }
}

/** A person or organisation from PurePeople, copied into invoicing on selection. */
export interface PeopleSuggestion {
  kind: 'person' | 'org'
  recordId: string
  name: string
  email?: string
  phone?: string
  organization?: string
  title?: string
  city?: string
  country?: string
  domains?: string[]
  sourceLabel: string
}
export type PersonSuggestion = PeopleSuggestion & { kind: 'person' }
export type OrganizationSuggestion = PeopleSuggestion & { kind: 'org' }
type RawPeopleSuggestion = Partial<PeopleSuggestion> & Pick<PeopleSuggestion, 'name' | 'sourceLabel'>

/** Contacts whose name or email contains `query`; empty outside the shell or when PurePeople is not installed. */
export async function suggestPeople(query: string, limit = 6): Promise<PersonSuggestion[]> {
  if (query.trim().length < 2) return []
  try {
    const found = await bridge.call<RawPeopleSuggestion[]>('people.suggest', [{ query: query.trim(), limit, kind: 'person' }])
    return Array.isArray(found) ? found.flatMap(person => {
      if ((person.kind && person.kind !== 'person') || !person.email?.includes('@')) return []
      return [{ ...person, kind: 'person' as const, recordId: person.recordId || `${person.name}:${person.email}` } as PersonSuggestion]
    }) : []
  } catch { return [] }
}

/** Organisations whose name, alias or domain matches `query`. */
export async function suggestOrganizations(query: string, limit = 6): Promise<OrganizationSuggestion[]> {
  if (query.trim().length < 2) return []
  try {
    const found = await bridge.call<PeopleSuggestion[]>('people.suggest', [{ query: query.trim(), limit, kind: 'org' }])
    return Array.isArray(found) ? found.filter((org): org is OrganizationSuggestion => org.kind === 'org') : []
  } catch { return [] }
}

/** Choose a file to link (a contract, SOW, purchase order); its path is kept, the file is never copied. */
export function chooseDocumentFile() {
  requireShell('Linking a document')
  return openPlatformFileDialog()
}

/** Open a linked document in whichever app handles it. */
export async function openLinkedDocument(path: string, name?: string) {
  requireShell('Opening a document')
  await bridge.call('catalog.open', [{ path, ...(name ? { name } : {}) }])
}

/** Write an agreement's print HTML beside the workspace (a fresh folder each time) and return its path. */
export async function writeAgreementPrintFile(name: string, html: string): Promise<string> {
  requireShell('Printing an agreement')
  const folder = await createInvoiceAssetFolder(`print-${crypto.randomUUID()}`)
  const path = `${folder}/${name.replace(/[^a-zA-Z0-9._-]/g, '_')}.html`
  await writePlatformTextFile(path, html)
  return path
}
export async function readPrintedPdf(path: string) {
  const file = await readPlatformFileBinary(path, 40 * 1024 * 1024)
  if (file.truncated || !file.byteLength) throw new Error('The printed PDF is unreadable or too large.')
  return file.base64
}

/**
 * Hand a request to the drawer's assistant as a message in this app's
 * conversation, then show the drawer. The assistant does the work with its
 * own tools; the app never calls a model. False when the shell cannot take a
 * message, so the caller can fall back to only opening the drawer.
 */
export async function askDrawer(content: string, appSlug = 'invoicing'): Promise<boolean> {
  if (isStandaloneDevMode()) return false
  try {
    const snapshot = await bridge.call<{ id?: string; sessionId?: string }>('assistants.sessions.open', [appSlug])
    const sessionId = snapshot?.id ?? snapshot?.sessionId ?? null
    if (!sessionId) return false
    await bridge.call('workspace.updateCurrentTab', [{ sessionId }]).catch(() => undefined)
    await bridge.call('assistants.messages.send', [{ id: sessionId, input: { content } }])
    await bridge.call('workspace.toggleAgentDrawer', [{ open: true }]).catch(() => undefined)
    return true
  } catch (error) {
    console.error('Could not hand the request to the assistant', error)
    return false
  }
}
