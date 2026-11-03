import { AppFrame } from '@purescience/platform-bridge/components/AppFrame'
import { EmptyState } from '@purescience/platform-ui/components/common/feedback/EmptyState'
import { usePlatformBridge } from '@purescience/platform-ui/bridge/react/usePlatformBridge'
import { AppShell } from './components/AppShell'
import { isStandaloneDevMode } from './bridge/platformBridge'
import { APP_TITLE } from './constants'
import { useAppBoot } from './hooks/useAppBoot'
import { useAppAgentTools } from './hooks/useAppAgentTools'
import { useCompactInRoom } from './hooks/useCompactInRoom'
import { useCopyKnown } from './hooks/useCopyKnown'
import { useInvoiceWorkspace } from './hooks/useInvoiceWorkspace'

/** Two gates and a frame: the bridge, then boot, then the desk. */
export function App(): React.ReactElement {
  const { error: bridgeError, ready, meta } = usePlatformBridge()
  const compact = useCompactInRoom()
  const compactFrame = compact ? { 'data-compact-room': '' } : undefined
  // Whether this copy is held in a page comes first: the store, the share and the desk all start after it.
  const copyKnown = useCopyKnown(ready)
  const invoiceWorkspace = useInvoiceWorkspace(ready && copyKnown, meta?.methods)
  useAppAgentTools(ready)
  const standaloneDev = isStandaloneDevMode()
  const bootReady = ready || standaloneDev
  const { boot, bootError, booting } = useAppBoot(bootReady)

  if (bridgeError && !standaloneDev) {
    return (
      <AppFrame {...compactFrame}>
        <EmptyState tone="error" title="Bridge unavailable" message={bridgeError.message} />
      </AppFrame>
    )
  }

  if (!bootReady || !boot || !copyKnown) {
    return (
      <AppFrame {...compactFrame}>
        <EmptyState
          tone={bootError ? 'error' : 'neutral'}
          title={bootError ? 'Boot failed' : APP_TITLE}
          message={bootError ? bootError.message : booting ? 'Loading…' : 'Waiting for the PureDesktop shell…'}
        />
      </AppFrame>
    )
  }

  return <AppShell settings={boot.settings} invoiceWorkspace={invoiceWorkspace} standalone={standaloneDev} compact={compact} />
}
