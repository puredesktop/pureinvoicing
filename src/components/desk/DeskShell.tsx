import { useAppSettings } from '@purescience/platform-bridge/components/settings/AppSettings'
import { useEffect, useRef, useState } from 'react'
import type { BusinessSetup } from '../../hooks/useBusinessSetup'
import type { ClientDirectory } from '../../hooks/useClientDirectory'
import type { InvoiceProduct } from '../../hooks/useInvoiceProduct'
import type { useInvoiceWorkspace } from '../../hooks/useInvoiceWorkspace'
import { WorkspaceSaveStatus } from '../WorkspaceSaveStatus'
import { ArchiveView } from './ArchiveView'
import { AgreementsView } from './agreements/AgreementsView'
import { ProposalsView } from './proposals/ProposalsView'
import { ContractorsView } from './agreements/ContractorsView'
import { BusinessView } from './BusinessView'
import { CompactRoom } from './CompactRoom'
import { ClientsView } from './ClientsView'
import { LibraryView } from './LibraryView'
import { EditorView } from './EditorView'
import { IssuedView } from './IssuedView'
import { Icon, compactAttrs } from './bits'
import { Btn, Callout, Desk, Meta, Toast, TopBar, Wordmark } from './deskStyles'

export interface DeskShellProps {
  workspace: ReturnType<typeof useInvoiceWorkspace>
  setup: BusinessSetup
  product: InvoiceProduct
  directory: ClientDirectory
  /** The app's places and save state, drawn in the desk's own bar under the shared header. */
  localBar?: React.ReactNode
  /** Outside the shell there is no shared header, so the bar carries the wordmark too. */
  standalone?: boolean
  /** Held in an entry of the Executive room: only the compact view shows, and the rest stays mounted and out of sight. */
  compact?: boolean
}

/** The app: one top bar, one body, the place the navigation says. */
export function DeskShell({ workspace: w, setup: s, product: p, directory: d, localBar, standalone, compact = false }: DeskShellProps): React.ReactElement {
  const appSettings = useAppSettings()
  useEffect(() => { if (!compact && p.destination === 'business') { appSettings.open(); p.navigate('invoices') } }, [compact, p.destination, appSettings.open, p.navigate])
  const disabled = w.status !== 'saved' || w.storageUnavailable || s.busy || p.busy || d.busy
  const loaded = ['saved', 'saving', 'error', 'conflict'].includes(w.status)
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMessage = useRef('')
  useEffect(() => {
    const message = p.message || s.message || d.message
    if (!message || message === lastMessage.current) return
    lastMessage.current = message
    setToast(message)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 5200)
  }, [p.message, s.message, d.message])
  // The frame's own page never scrolls: if anything (a focus, an anchor) shifts it, put it back so the app never slides under the shell's bar.
  useEffect(() => {
    const root = document.scrollingElement
    if (!root) return
    const reset = () => { if (root.scrollTop || root.scrollLeft) root.scrollTo(0, 0) }
    reset()
    window.addEventListener('scroll', reset, { passive: true })
    return () => window.removeEventListener('scroll', reset)
  }, [])
  const { desk, show } = compactAttrs(compact)
  const proposalOpen = p.destination === 'proposals' && !!p.selectedProposalId && !!w.value.proposals?.[p.selectedProposalId]
  const draftOpen = !['proposals', 'agreements', 'contractors', 'clients', 'library'].includes(p.destination) && !!p.selectedId && !p.issued && !!p.selected
  // A draft or an offer shows its own page, so edits save just as they do in the full app. Everything else is the compact view.
  const pageShown = loaded && (proposalOpen || draftOpen)
  return (
    <Desk {...desk} style={{ position: 'relative' }}>
      {localBar ? <TopBar style={standalone ? undefined : { height: 44 }}>{standalone ? <><Wordmark>pure<b>invoicing</b></Wordmark><span style={{ flex: 1 }} /></> : null}{localBar}</TopBar> : null}
      {(w.status === 'error' || w.status === 'conflict' || w.storageUnavailable) ? <div {...show} style={{ padding: '10px 18px 0' }}><WorkspaceSaveStatus workspace={w} dirty={p.dirty} /></div> : null}
      {p.error ? <div {...show} style={{ padding: '10px 18px 0' }}><Callout $tone="bad"><Icon.warn /><span><b>That did not go through.</b> {p.error} Your work is kept.</span></Callout></div> : null}
      {!loaded ? (
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}><Meta>{w.storageUnavailable ? 'Invoice storage is unavailable in this session. Reopen PureInvoicing once PureDesktop has granted filesystem access.' : 'Loading your invoices…'}</Meta></div>
      ) : p.destination === 'proposals' ? (
        <ProposalsView product={p} store={w.value} disabled={disabled} compact={compact} />
      ) : p.destination === 'agreements' ? (
        <AgreementsView product={p} store={w.value} disabled={disabled} />
      ) : p.destination === 'contractors' ? (
        <ContractorsView product={p} store={w.value} disabled={disabled} />
      ) : p.destination === 'clients' ? (
        <ClientsView product={p} directory={d} store={w.value} disabled={disabled} />
      ) : p.destination === 'library' ? (
        <LibraryView product={p} store={w.value} disabled={disabled} />

      ) : p.selectedId ? (
        p.issued ? <IssuedView product={p} store={w.value} disabled={disabled} compact={compact} />
          : p.selected ? <EditorView key={p.selected.id} product={p} directory={d} store={w.value} disabled={disabled} compact={compact} />
          : <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}><Meta>This invoice is no longer here.</Meta><Btn $sm onClick={() => p.openInvoice(null)}>Back to the archive</Btn></div>
      ) : (
        <ArchiveView product={p} setup={s} store={w.value} disabled={disabled} />
      )}
      {loaded && <BusinessView setup={s} product={p} store={w.value} disabled={disabled} />}
      {compact && !pageShown ? <CompactRoom product={p} store={w.value} loaded={loaded} storageUnavailable={w.storageUnavailable} disabled={disabled} /> : null}
      {toast ? <Toast role="status">{toast}</Toast> : null}
    </Desk>
  )
}
