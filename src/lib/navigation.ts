import { useEffect, useEffectEvent, useId, useState } from 'react'

// The browser history drives navigation, so the back button and the Android
// back gesture move between screens and close an open sheet, rather than
// leaving the installed app. Screens live in the URL hash (#/log); an open
// sheet adds a history entry of its own with the same URL.

export type Screen = 'welcome' | 'children' | 'log' | 'history'
const SCREENS: readonly Screen[] = ['welcome', 'children', 'log', 'history']

interface EntryState {
  // The screen this one was opened from, so "done" can go back to it.
  from?: Screen
  // Set on the entry an open sheet pushed.
  panel?: string
}

const entry = (): EntryState => (history.state as EntryState | null) ?? {}

function screenFromHash(): Screen | undefined {
  const name = location.hash.replace(/^#\/?/, '')
  return SCREENS.find((s) => s === name)
}

export function useScreen(initial: () => Screen) {
  const [screen, setScreen] = useState<Screen>(() => screenFromHash() ?? initial())

  useEffect(() => {
    // A sheet's entry does not survive a reload with the sheet itself.
    if (!screenFromHash() || entry().panel) history.replaceState({ from: entry().from }, '', `#/${screen}`)
    const onPop = () => {
      const next = screenFromHash()
      if (next) setScreen(next)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // Runs once: later changes come from go() and popstate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = (next: Screen, options: { replace?: boolean } = {}) => {
    // Navigating from inside a sheet takes the sheet's place in history, so
    // back doesn't return to a sheet that is no longer open.
    const fromPanel = !!entry().panel
    const state: EntryState = { from: options.replace && !fromPanel ? entry().from : screen }
    if (options.replace || fromPanel) history.replaceState(state, '', `#/${next}`)
    else history.pushState(state, '', `#/${next}`)
    setScreen(next)
  }

  // Returns to the screen this one was opened from, or else to `fallback`.
  const done = (fallback: Screen) => {
    if (entry().from && entry().from !== screen) history.back()
    else go(fallback, { replace: true })
  }

  return { screen, go, done }
}

// Gives an open sheet its own history entry: back closes it, and closing it
// any other way removes the entry again.
export function usePanelHistory(open: boolean, onClose: () => void) {
  const id = useId()
  const close = useEffectEvent(onClose)
  useEffect(() => {
    if (!open) return
    history.pushState({ ...entry(), panel: id }, '', location.href)
    const onPop = () => {
      if (entry().panel !== id) close()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (entry().panel === id) history.back()
    }
  }, [open, id])
}
