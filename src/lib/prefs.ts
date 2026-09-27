// Per-device UI preferences, not household data, so they live in localStorage
// rather than IndexedDB. Storage can be unavailable (private mode, blocked
// site data); the worst case is that a choice is not remembered next time.
type PrefKey = 'activeChildId' | 'bookOrder'

export function readPref(key: PrefKey): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

// null forgets the preference.
export function writePref(key: PrefKey, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // not remembered; harmless
  }
}
