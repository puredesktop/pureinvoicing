import { useEffect, useState } from 'react'
import { fetchAppSettings } from '../bridge/platformBridge'
import type { AppBootState } from '../types'

interface UseAppBootResult {
  boot: AppBootState | null
  bootError: Error | null
  booting: boolean
}

export function useAppBoot(ready: boolean): UseAppBootResult {
  const [boot, setBoot] = useState<AppBootState | null>(null)
  const [bootError, setBootError] = useState<Error | null>(null)
  const [booting, setBooting] = useState(false)

  useEffect(() => {
    if (!ready) return

    let cancelled = false

    async function load() {
      setBooting(true)
      setBootError(null)
      try {
        const settings = await fetchAppSettings()
        if (cancelled) return
        setBoot({ settings })
      } catch (error) {
        console.error('App settings boot failed', error)
        if (cancelled) return
        setBoot(null)
        setBootError(error instanceof Error ? error : new Error(String(error)))
      } finally {
        if (!cancelled) setBooting(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [ready])

  return { boot, bootError, booting }
}
