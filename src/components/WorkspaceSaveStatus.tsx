import { useEffect, useState } from 'react'
import type { useInvoiceWorkspace } from '../hooks/useInvoiceWorkspace'
import { Btn, Callout, Hint, Select } from './desk/deskStyles'
import { Icon } from './desk/bits'

/** Save trouble, in one callout: retry, or pick a side for each record that changed in another window. */
export function WorkspaceSaveStatus({ workspace, dirty = false }: { workspace: ReturnType<typeof useInvoiceWorkspace>; dirty?: boolean }): React.ReactElement | null {
  const [choices, setChoices] = useState<Record<string, 'local' | 'remote'>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  useEffect(() => { setChoices({}); setActionError(null) }, [workspace.conflicts])
  async function run(action: () => Promise<unknown>) {
    setActionError(null)
    try { await action() }
    catch (error) { console.error('Workspace save recovery failed', error); setActionError(error instanceof Error ? error.message : String(error)) }
  }
  if (workspace.storageUnavailable) return <Callout $tone="bad" role="alert"><Icon.warn /><span><b>Invoice storage is unavailable in this session.</b> Reopen PureInvoicing after PureDesktop applies its filesystem permission. Nothing can be loaded or saved until then.</span></Callout>
  if (workspace.status !== 'error' && workspace.status !== 'conflict') return null
  return (
    <Callout $tone="bad" as="section" aria-label="Save recovery" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <span style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><Icon.warn /><span><b>{workspace.status === 'conflict' ? 'This work changed in another window.' : 'Saving failed.'}</b> {workspace.error}{dirty ? ' Your edits are kept.' : ''}</span></span>
      {workspace.status === 'conflict' ? (
        <>
          {workspace.conflicts.map(conflict => (
            <div key={conflict.path} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 25 }}>
              <span style={{ flex: 1, fontFamily: 'var(--d-mono)', fontSize: 12 }}>{conflict.path}</span>
              <Select style={{ width: 200, height: 28 }} value={choices[conflict.path] ?? ''} onChange={event => { const value = event.target.value; if (value === 'local' || value === 'remote') setChoices(current => ({ ...current, [conflict.path]: value })) }}>
                <option value="" disabled>Choose a version</option><option value="local">Keep my edits</option><option value="remote">Use the saved version</option>
              </Select>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Btn $sm disabled={workspace.conflicts.some(conflict => !choices[conflict.path])} onClick={() => void run(() => workspace.commands.resolveSaveConflicts(choices))}>Save chosen versions</Btn></div>
        </>
      ) : <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Btn $sm onClick={() => void run(workspace.commands.retrySave)}>Retry</Btn></div>}
      {actionError ? <Hint $err role="alert">{actionError}</Hint> : null}
    </Callout>
  )
}
