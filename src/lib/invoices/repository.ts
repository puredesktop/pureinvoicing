import { isInvoiceStoragePermissionUnavailable } from '../../bridge/invoiceStorageCapabilities'
import { emptyStore } from './defaults'
import { assertForwardTransition, parseStore } from './parse'
import type { InvoiceStore } from './types'
export interface StoragePort {
  read(): Promise<{ value: unknown; version: string | null }>
  write(value: InvoiceStore, ifMatch: string | null): Promise<{ ok: boolean; version: string | null; conflict?: true; value?: unknown }>
}
export interface StoreConflict { path: string; base: unknown; local: unknown; remote: unknown }
export interface RepositoryState {
  value: InvoiceStore
  status: 'waiting' | 'loading' | 'unavailable' | 'saved' | 'saving' | 'error' | 'conflict'
  error: string | null
  conflicts: StoreConflict[]
  remote: InvoiceStore | null
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze) }
  return value
}
function mergeStores(base: InvoiceStore, local: InvoiceStore, remote: InvoiceStore) {
  const result = structuredClone(remote), conflicts: StoreConflict[] = []
  function select(path: string, a: unknown, b: unknown, c: unknown) {
    if (same(a, b)) return c
    if (same(a, c) || same(b, c)) return b
    conflicts.push({ path, base: a, local: b, remote: c }); return b
  }
  for (const key of ['business', 'template', 'sequence'] as const) {
    Object.assign(result, { [key]: select(key, base[key], local[key], remote[key]) })
  }
  for (const key of ['clients', 'drafts', 'invoices', 'assets', 'documents', 'publications'] as const) {
    const records: Record<string, unknown> = {}
    for (const id of new Set([...Object.keys(base[key] ?? {}), ...Object.keys(local[key] ?? {}), ...Object.keys(remote[key] ?? {})])) {
      const selected = select(`${key}.${id}`, base[key]?.[id], local[key]?.[id], remote[key]?.[id])
      if (selected !== undefined) records[id] = selected
    }
    Object.assign(result, { [key]: records })
  }
  return { value: result, conflicts }
}
export class InvoiceRepository {
  private state: RepositoryState = freeze({ value: emptyStore(), status: 'waiting', error: null, conflicts: [], remote: null })
  private base = emptyStore()
  private version: string | null = null
  private loaded = false
  private enabled = false
  private loading: Promise<void> | null = null
  private listeners = new Set<() => void>()
  private tail: Promise<unknown> = Promise.resolve()
  constructor(private readonly storage: StoragePort) {}
  getSnapshot = (): RepositoryState => this.state
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback) } }
  setEnabled(enabled: boolean) { this.enabled = enabled }
  private emit(patch: Partial<RepositoryState>) {
    this.state = freeze({ ...this.state, ...patch }); this.listeners.forEach(listener => listener())
  }
  async initialize(): Promise<void> {
    if (!this.enabled) throw new Error('Waiting for the PureDesktop shell bridge.')
    if (this.loaded) return
    if (this.loading) return this.loading
    this.emit({ status: 'loading', error: null })
    this.loading = (async () => {
      try {
        const result = await this.storage.read()
        const value = parseStore(result.value)
        this.base = structuredClone(value); this.version = result.version; this.loaded = true
        this.emit({ value, status: 'saved', error: null })
      } catch (error) {
        // Permission denial is a recoverable session state, not a failed data load.
        if (isInvoiceStoragePermissionUnavailable(error)) {
          this.emit({ status: 'unavailable', error: 'PureDesktop has not granted filesystem access to this session. Reopen PureInvoicing after its permissions update, or retry loading.' })
          throw error
        }
        console.error('Invoice store load failed', error)
        this.emit({ status: 'error', error: error instanceof Error ? error.message : String(error) }); throw error
      } finally { this.loading = null }
    })()
    return this.loading
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation)
    this.tail = result.catch(error => { console.error('Invoice store operation failed', error) })
    return result
  }
  async current(): Promise<InvoiceStore> {
    await this.tail; await this.initialize(); return this.state.value
  }
  transact(update: (current: InvoiceStore) => InvoiceStore): Promise<InvoiceStore> {
    return this.enqueue(async () => {
      await this.initialize()
      if (this.state.status === 'conflict') throw new Error('Resolve the save conflict first. Your local edits are preserved.')
      const value = parseStore(update(structuredClone(this.state.value)))
      assertForwardTransition(this.base, value)
      this.emit({ value, error: null })
      return this.persist()
    })
  }
  // Publication must never enter the editable conflict/merge path. Re-evaluate
  // the approved operation on each fresh CAS snapshot, without staging it locally.
  guardedTransact(update: (current: InvoiceStore) => InvoiceStore): Promise<InvoiceStore> {
    return this.enqueue(async () => {
      await this.initialize()
      if (!this.enabled || this.state.status !== 'saved') throw new Error('Save or resolve local work before finalization.')
      const adopt = (value: InvoiceStore, version: string | null) => {
        this.base = structuredClone(value); this.version = version
        this.emit({ value, status: 'saved', error: null, conflicts: [], remote: null })
      }
      for (let attempt = 0; attempt < 4; attempt++) {
        const remote = await this.storage.read(), current = parseStore(remote.value)
        adopt(current, remote.version)
        const next = parseStore(update(structuredClone(current)))
        assertForwardTransition(current, next)
        if (same(current, next)) return current
        try {
          const result = await this.storage.write(next, remote.version)
          if (result.ok) { adopt(next, result.version); return next }
          if (!result.conflict) throw new Error('Publication write was not confirmed.')
        } catch (error) {
          console.error('Guarded invoice write failed; checking persisted result', error)
          // A lost acknowledgement must not turn a successful commit into a
          // second issuance. A fresh read determines whether the whole write landed.
          const recovered = await this.storage.read(), value = parseStore(recovered.value)
          adopt(value, recovered.version)
          if (same(value, next)) return value
          // Re-running also recognizes a receipt if another writer has since
          // added unrelated records to the successfully committed snapshot.
          if (same(parseStore(update(structuredClone(value))), value)) return value
          throw error
        }
      }
      throw new Error('Workspace changed repeatedly. Prepare and approve a fresh confirmation.')
    })
  }
  private async persist(): Promise<InvoiceStore> {
    if (!this.enabled) throw new Error('Waiting for the PureDesktop shell bridge. Edits remain unsaved.')
    this.emit({ status: 'saving', error: null })
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const value = this.state.value
        assertForwardTransition(this.base, value)
        if (same(value, this.base)) { this.emit({ status: 'saved' }); return value }
        const result = await this.storage.write(value, this.version)
        if (result.ok) {
          this.base = structuredClone(value); this.version = result.version
          this.emit({ status: 'saved', conflicts: [], remote: null }); return value
        }
        if (!result.conflict) throw new Error('The shell did not confirm the save. Retry to recover.')
        const remote = parseStore(result.value)
        const merged = mergeStores(this.base, value, remote)
        this.version = result.version; this.base = structuredClone(remote)
        if (merged.conflicts.length) {
          this.emit({ status: 'conflict', conflicts: merged.conflicts, remote, value: merged.value,
            error: 'This work changed in another window. Compare both versions and resolve the conflicting records; local edits are retained.' })
          throw new Error(this.state.error!)
        }
        assertForwardTransition(remote, merged.value)
        this.emit({ value: parseStore(merged.value) })
      }
      throw new Error('The workspace keeps changing in another window. Your edits are retained; retry saving.')
    } catch (error) {
      console.error('Invoice store save failed', error)
      if (this.state.status !== 'conflict') this.emit({ status: 'error', error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }
  retry(): Promise<InvoiceStore> {
    return this.enqueue(async () => {
      await this.initialize()
      if (this.state.status === 'conflict') throw new Error('Choose a resolution for each conflicting record before retrying.')
      return this.persist()
    })
  }
  resolveConflicts(choices: Record<string, 'local' | 'remote'>): Promise<InvoiceStore> {
    return this.enqueue(async () => {
      await this.initialize()
      if (this.state.status !== 'conflict') throw new Error('There is no pending conflict.')
      const value = structuredClone(this.state.value)
      for (const conflict of this.state.conflicts) {
        const choice = choices[conflict.path]
        if (choice !== 'local' && choice !== 'remote') throw new Error(`Choose which version to retain for ${conflict.path}.`)
        const selected = choice === 'local' ? conflict.local : conflict.remote
        const [key, ...parts] = conflict.path.split('.')
        const id = parts.join('.')
        if (id) {
          const records = value[key as 'drafts'] as Record<string, unknown>
          if (selected === undefined) delete records[id]; else records[id] = structuredClone(selected)
        } else Object.assign(value, { [key]: structuredClone(selected) })
      }
      assertForwardTransition(this.base, value)
      const parsed = parseStore(value)
      this.emit({ value: parsed, conflicts: [], remote: null, error: null })
      return this.persist()
    })
  }
  refresh(): Promise<InvoiceStore> {
    return this.enqueue(async () => {
      await this.initialize()
      if (this.state.status !== 'saved') throw new Error('Save or resolve local changes before refreshing.')
      try {
        const result = await this.storage.read(), value = parseStore(result.value)
        this.base = structuredClone(value); this.version = result.version
        this.emit({ value, error: null, status: 'saved' }); return value
      } catch (error) {
        console.error('Invoice store refresh failed', error)
        this.emit({ status: 'error', error: error instanceof Error ? error.message : String(error) }); throw error
      }
    })
  }
}
