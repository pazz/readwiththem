import { useEffect, useState } from 'react'
import { ensurePersistentStorage } from './storage'

// Requests persistent storage once there is something worth keeping (Firefox
// asks the user, so not on a first visit). Undefined until known.
export function usePersistentStorage(hasData: boolean): boolean | undefined {
  const [persistent, setPersistent] = useState<boolean>()
  useEffect(() => {
    if (!hasData) return
    let cancelled = false
    ensurePersistentStorage()
      .catch(() => false)
      .then((result) => !cancelled && setPersistent(result))
    return () => {
      cancelled = true
    }
  }, [hasData])
  return persistent
}
