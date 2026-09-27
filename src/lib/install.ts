import { useEffect, useState } from 'react'

// Launched from the home screen or app list, rather than a browser tab.
export function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

// Chrome and Edge fire this once, possibly before React mounts, so it is caught
// at module load and kept for the welcome screen's "Install" button.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
let installPrompt: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installPrompt = e as InstallPromptEvent
  listeners.forEach((fn) => fn())
})

export function useInstallPrompt() {
  const [canPrompt, setCanPrompt] = useState(!!installPrompt)
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    const update = () => setCanPrompt(!!installPrompt)
    const done = () => setInstalled(true)
    listeners.add(update)
    window.addEventListener('appinstalled', done)
    return () => {
      listeners.delete(update)
      window.removeEventListener('appinstalled', done)
    }
  }, [])

  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    installPrompt = null
    setCanPrompt(false)
    if (outcome === 'accepted') setInstalled(true)
  }

  return { canPrompt, installed, install }
}
