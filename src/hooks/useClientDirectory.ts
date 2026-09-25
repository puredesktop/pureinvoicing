import { useEffect, useState } from 'react'
import type { Client, Party } from '../lib/invoices/types'
import type { RepositoryState } from '../lib/invoices/repository'
import type { ClientDetails, ClientEditorState } from '../lib/clients/directory'
import { recipientDetails } from '../lib/clients/directory'
import { invoiceCommands, invoiceRepository } from '../lib/invoices/workspace'

export function useClientDirectory(workspace: RepositoryState) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(0), [reload, setReload] = useState(0)
  const [rows, setRows] = useState<Client[]>([]), [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true), [searchError, setSearchError] = useState('')
  const [editor, setEditor] = useState<ClientEditorState | null>(null)
  const [busy, setBusy] = useState(false), [pendingRecovery, setPendingRecovery] = useState(false)
  const [error, setError] = useState(''), [message, setMessage] = useState('')
  const [selectionId, setSelectionId] = useState('')
  useEffect(() => {
    if (workspace.status !== 'saved') return
    let active = true
    setLoading(true); setSearchError('')
    void invoiceCommands.searchClients({ query, cursor: String(page * 25), limit: 25 }).then(result => {
      if (active) { setRows(result.items); setTotal(result.total); setLoading(false) }
    }).catch(error => {
      console.error('Client search failed', error)
      if (active) { setSearchError(error instanceof Error ? error.message : String(error)); setLoading(false) }
    })
    return () => { active = false }
  }, [query, page, reload, workspace.value.clients, workspace.status])
  useEffect(() => {
    if (pendingRecovery && workspace.status === 'saved') {
      setPendingRecovery(false); setEditor(null); setError('')
      setMessage('Save recovery completed. Review the directory record below.')
    }
  }, [pendingRecovery, workspace.status])
  function open(details: ClientDetails, clientId?: string, source: ClientEditorState['source'] = 'directory') {
    setEditor({ details: { ...details }, clientId, source }); setError(''); setMessage('')
  }
  async function save() {
    if (!editor || busy || pendingRecovery) return
    if (!editor.details.name.trim()) { setError('Enter a client name. Other details may be completed later.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await invoiceCommands.saveClient({ clientId: editor.clientId, details: editor.details })
      setEditor(null); setMessage('Client saved. Existing drafts and issued versions are unchanged.')
    } catch (error) {
      console.error('Client save failed', error)
      setError(error instanceof Error ? error.message : String(error))
      // The repository stages failed writes. Recover that exact write instead of creating a second client.
      const status = invoiceRepository.getSnapshot().status
      setPendingRecovery(status === 'error' || status === 'conflict')
    } finally { setBusy(false) }
  }
  return {
    query, rows, total, page, loading, searchError, editor, busy, pendingRecovery, error, message, selectionId,
    selection: workspace.value.clients[selectionId],
    setSelectionId,
    search: (value: string) => { setQuery(value); setPage(0); setLoading(true) },
    previousPage: () => setPage(current => Math.max(0, current - 1)),
    nextPage: () => setPage(current => current + 1),
    retrySearch: () => setReload(current => current + 1),
    create: () => open({ name: '', billingAddress: '' }),
    edit: (client: Client) => open(client, client.id),
    saveRecipient: (recipient: Party, clientId?: string) => open(recipientDetails(recipient), clientId, 'recipient'),
    change: (patch: Partial<ClientDetails>) => { setEditor(current => current ? { ...current, details: { ...current.details, ...patch } } : null); setError('') },
    cancel: () => { setEditor(null); setError('') },
    save,
  }
}
export type ClientDirectory = ReturnType<typeof useClientDirectory>
