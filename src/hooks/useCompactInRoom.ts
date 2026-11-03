import { useSyncExternalStore } from 'react'
import { useAdjacentApp } from '@purescience/platform-ui/bridge/react/useAdjacentApp'

function watchHeldInRoom(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-held-in-room'] })
  return () => observer.disconnect()
}

/**
 * True only while PureInvoicing is held in a page (the Executive room, the Personal agent's). Everything compact hangs
 * off this one answer. Held counts from the first paint, before the neighbour's name arrives, so the whole app never
 * flashes up in the box; the room's Full app says the neighbour is gone, so the whole app comes back with nothing reloaded.
 */
export function useCompactInRoom(): boolean {
  const neighbour = useAdjacentApp()
  const held = useSyncExternalStore(watchHeldInRoom, () => document.documentElement.hasAttribute('data-held-in-room'))
  return neighbour ? neighbour.heldInRoom === true : held
}
