import { useAdjacentApp } from '@purescience/platform-ui/bridge/react/useAdjacentApp'

/**
 * True only while PureInvoicing is held in an entry of the Executive room. Everything compact hangs off this one
 * answer; the room's Full app says the neighbour is gone, so the whole app comes back with nothing reloaded.
 */
export function useCompactInRoom(): boolean {
  return useAdjacentApp()?.heldInRoom === true
}
