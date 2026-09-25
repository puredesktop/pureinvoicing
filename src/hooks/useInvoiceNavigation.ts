import { useCallback, useRef, useState } from 'react'
import { saveInvoiceNavigationSettings } from '../bridge/platformBridge'
import { parseNavigation } from '../lib/invoices/parse'
import type { NavigationPreferences } from '../lib/invoices/types'
import type { AppSettings } from '../types'
export function useInvoiceNavigation(settings: AppSettings, ready: boolean) {
  const [navigation, setNavigation] = useState(() => parseNavigation(settings))
  const [error, setError] = useState<Error | null>(null)
  const current = useRef(navigation)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const updateNavigation = useCallback((patch: Partial<NavigationPreferences>) => {
    if (!ready) return Promise.reject(new Error('Waiting for the shell bridge.'))
    const next = parseNavigation({ invoiceNavigation: { ...current.current, ...patch } })
    current.current = next; setNavigation(next)
    const save = queue.current.then(async () => {
      try { await saveInvoiceNavigationSettings(next); setError(null) }
      catch (error) { console.error('Invoice navigation save failed', error); setError(error instanceof Error ? error : new Error(String(error))); throw error }
    })
    queue.current = save.catch(error => { console.error('Invoice navigation operation failed', error) })
    return save
  }, [ready])
  return { navigation, error, updateNavigation, retry: () => updateNavigation(current.current) }
}
