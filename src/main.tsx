import { createRoot } from 'react-dom/client'
import { App } from './App'
import './compact-in-room.css'

// held inside another app's page: it lies flat in that page rather than as a page of its own
if (window.parent !== window.top) {
  document.documentElement.setAttribute('data-held-in-room', '')
  // grown to the whole app over the room: the whole app comes back
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.type !== 'pure:adjacent-app') return
    document.documentElement.toggleAttribute('data-held-in-room', !!event.data.app)
  })
}

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element #root not found')
}

createRoot(root).render(<App />)
