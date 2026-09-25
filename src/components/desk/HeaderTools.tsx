import type { InvoiceProduct } from '../../hooks/useInvoiceProduct'
import type { useInvoiceWorkspace } from '../../hooks/useInvoiceWorkspace'
import { Icon } from './bits'
import { Btn, Dot, Meta, Tab, Tabs } from './deskStyles'

/** The desk bar: this app's places (or the way back) on the left, the save state on the right. */
export function HeaderTools({ product: p, workspace: w }: { product: InvoiceProduct; workspace: ReturnType<typeof useInvoiceWorkspace> }): React.ReactElement {
  const loaded = ['saved', 'saving', 'error', 'conflict'].includes(w.status)
  const inEditor = p.destination === 'invoices' && !!p.selectedId
  const saveWords = w.storageUnavailable ? 'Storage unavailable' : w.status === 'saving' ? 'Saving…' : w.status === 'loading' ? 'Loading…' : w.status === 'error' ? 'Save failed' : w.status === 'conflict' ? 'Conflict' : p.dirty ? 'Unsaved edits' : 'Saved'
  const saveTone = w.status === 'error' || w.status === 'conflict' || w.storageUnavailable ? 'var(--d-bad-ink, var(--platform-colors-danger))' : p.dirty || w.status === 'saving' ? 'var(--d-warn-ink, var(--platform-colors-warning))' : 'var(--d-ok-ink, var(--platform-colors-success))'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
      {inEditor ? (
        <Btn $quiet $sm onClick={() => p.openInvoice(null)} title="Back to the archive"><Icon.back />Invoices</Btn>
      ) : (
        <Tabs role="tablist" aria-label="Places">
          {([['invoices', 'Invoices'], ['agreements', 'Agreements'], ['clients', 'Clients'], ['contractors', 'Contractors']] as const).map(([key, label]) => (
            <Tab key={key} role="tab" aria-selected={p.destination === key} $on={p.destination === key} disabled={!loaded || p.busy} onClick={() => p.navigate(key)}>{label}</Tab>
          ))}
        </Tabs>
      )}
      <span style={{ flex: 1 }} />
      <Meta style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }} role="status"><Dot $color={saveTone} />{saveWords}</Meta>
    </div>
  )
}
