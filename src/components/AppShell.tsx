import { AppFrame } from '@purescience/platform-bridge/components/AppFrame'
import type { AppSettings } from '../types'
import type { useInvoiceWorkspace } from '../hooks/useInvoiceWorkspace'
import { useBusinessSetup } from '../hooks/useBusinessSetup'
import { useInvoiceProduct } from '../hooks/useInvoiceProduct'
import { useClientDirectory } from '../hooks/useClientDirectory'
import { DeskShell } from './desk/DeskShell'
import { HeaderTools } from './desk/HeaderTools'

export interface AppShellProps {
  settings: AppSettings
  invoiceWorkspace: ReturnType<typeof useInvoiceWorkspace>
  /** The Vite page opened outside the shell: no shared header, so the desk draws its own bar. */
  standalone: boolean
  /** Held in an entry of the Executive room: one job, on white. The rest stays mounted and out of sight. */
  compact?: boolean
}

/**
 * The ready state. The shared AppFrame header carries the wordmark and the
 * shell's model, YOLO and drawer controls; this app's places and save state
 * sit in the desk's own bar beneath it, and the desk fills the rest.
 */
export function AppShell({ settings, invoiceWorkspace, standalone, compact = false }: AppShellProps): React.ReactElement {
  const setup = useBusinessSetup(invoiceWorkspace.value)
  const directory = useClientDirectory(invoiceWorkspace)
  const product = useInvoiceProduct(settings, invoiceWorkspace.value, !invoiceWorkspace.storageUnavailable && !['waiting', 'loading', 'unavailable'].includes(invoiceWorkspace.status), compact)
  const tools = <HeaderTools product={product} workspace={invoiceWorkspace} />
  return (
    <AppFrame {...(compact ? { 'data-compact-room': '' } : undefined)}>
      <DeskShell workspace={invoiceWorkspace} setup={setup} product={product} directory={directory} localBar={tools} standalone={standalone} compact={compact} />
    </AppFrame>
  )
}
