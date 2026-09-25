import { useEffect } from 'react'
import type { ClientDirectory } from '../../hooks/useClientDirectory'
import type { Client } from '../../lib/invoices/types'
import { Avatar, Btn, Hint, MenuHead, MenuItem, Meta, Popover, SearchBox } from './deskStyles'
import { Icon, hueOf, initials } from './bits'

/** A popover over the directory: pick a client to copy into the draft. */
export function ClientPicker({ directory: d, anchor, onPick, onClose, onNew }: { directory: ClientDirectory; anchor: DOMRect; onPick: (client: Client) => void; onClose: () => void; onNew?: () => void }): React.ReactElement {
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!(event.target as Element | null)?.closest?.('[data-popover]')) onClose() }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('mousedown', close); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', key) }
  }, [onClose])
  const width = 320
  return (
    <Popover data-popover role="dialog" aria-label="Choose a client" style={{ left: Math.min(anchor.left, window.innerWidth - width - 8), top: anchor.bottom + 6, width, maxHeight: 380 }}>
      <SearchBox style={{ minWidth: 0, margin: 4 }}><Icon.search /><input autoFocus placeholder="Search clients" value={d.query} onChange={event => d.search(event.target.value)} /></SearchBox>
      <MenuHead>{d.total ? `${d.total} client${d.total === 1 ? '' : 's'}` : d.loading ? 'Loading…' : 'No clients yet'}</MenuHead>
      <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {d.rows.map(client => (
          <MenuItem key={client.id} style={{ height: 'auto', padding: '6px 10px' }} onClick={() => onPick(client)}>
            <Avatar $hue={hueOf(client.name)} $size={22}>{initials(client.name)}</Avatar>
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</span><Hint style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.billingAddress.split('\n')[0] || 'No billing address yet'}</Hint></span>
          </MenuItem>
        ))}
        {!d.rows.length && !d.loading ? <Meta style={{ padding: '6px 10px' }}>{d.query ? 'Nothing matches.' : 'Type a recipient on the invoice and save it as a client.'}</Meta> : null}
      </div>
      {onNew ? <div style={{ padding: 4, borderTop: '1px solid var(--d-line)', marginTop: 4 }}><Btn $quiet $sm onClick={onNew} style={{ width: '100%', justifyContent: 'flex-start' }}><Icon.plus />New client</Btn></div> : null}
    </Popover>
  )
}
