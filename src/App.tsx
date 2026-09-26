import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Child, Edition, ReadingSession } from './types'
import * as storage from './storage'
import { searchCatalogue, lookupISBN, type BookSearchResult } from './catalogue'
import { BarcodeScanner } from './BarcodeScanner'
import { CoverCapture } from './CoverCapture'
import { renderListImage, type ListImageRow } from './listImage'
import { booksToMarkdown } from './exportText'
import { pickPraise } from './praise'
import { sortReadings, type BookOrder } from './bookOrder'
import { applyTheme, childTheme, DEFAULT_COLOUR, PRESET_COLOURS } from './theme'

function BookCover({ src, title, size }: { src: string | undefined; title: string; size: 'sm' | 'lg' }) {
  const [failed, setFailed] = useState(false)
  const sizeClass = size === 'sm' ? 'cover-sm' : 'cover-lg'
  if (!src || failed) {
    return (
      <div className={`cover-placeholder ${sizeClass}`} role="img" aria-label={title}>
        {title}
      </div>
    )
  }
  return <img src={src} alt={title} className={sizeClass} onError={() => setFailed(true)} />
}

// A parent-photographed cover always wins over a catalogue one: it's their own
// copy, and it's the only option at all for a book the catalogue has no cover
// for. Next, the local cache of a fetched catalogue cover, so display doesn't
// depend on that CDN being reachable right now; only then the live URL itself.
function resolveCoverUrl(
  coverPhotoUrls: Map<string, string>,
  coverCacheUrls: Map<string, string>,
  edition: Edition | undefined,
): string | undefined {
  if (!edition) return undefined
  return coverPhotoUrls.get(edition.id) ?? coverCacheUrls.get(edition.id) ?? edition.coverUrl
}

function StarRating({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const current = Number(value) || 0
  return (
    <div className="star-rating" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={current === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          className={`star${n <= current ? ' filled' : ''}`}
          onClick={() => onChange(current === n ? '' : String(n))}
        >
          ★
        </button>
      ))}
    </div>
  )
}

type Tab = 'welcome' | 'children' | 'log' | 'history'

// Launched from the home screen / app list, rather than a browser tab.
function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

// Chrome and Edge fire this once, possibly before React mounts, so it is caught
// at module load and kept for the welcome screen's "Install" button.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
let installPrompt: InstallPromptEvent | null = null
const installPromptListeners = new Set<() => void>()
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installPrompt = e as InstallPromptEvent
  installPromptListeners.forEach((fn) => fn())
})

// Which child is active is a per-device UI convenience, not household data, so it
// lives in localStorage rather than IndexedDB.
function loadActiveChildId(): string {
  try {
    return localStorage.getItem('activeChildId') ?? ''
  } catch {
    return ''
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>(() => (loadActiveChildId() ? 'log' : isInstalled() ? 'children' : 'welcome'))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [children, setChildren] = useState<Child[]>([])
  const [editions, setEditions] = useState<Edition[]>([])
  const [sessions, setSessions] = useState<ReadingSession[]>([])
  const [activeChildId, setActiveChildId] = useState(loadActiveChildId)
  const [coverPhotoUrls, setCoverPhotoUrls] = useState<Map<string, string>>(new Map())
  const [coverCacheUrls, setCoverCacheUrls] = useState<Map<string, string>>(new Map())
  // If the very first load hangs — the same blocked-connection failure mode
  // db.ts's versionchange handler guards against — the screen would otherwise
  // just look permanently blank with nothing to explain why.
  const [slowLoad, setSlowLoad] = useState(false)
  const [loadError, setLoadError] = useState('')

  const reload = async () => {
    const [c, e, s, photos, cachedCovers] = await Promise.all([
      storage.listChildren(),
      storage.listEditions(),
      storage.listSessions(),
      storage.listCoverPhotos(),
      storage.listCachedCovers(),
    ])
    setChildren(c)
    if (c.length > 0) {
      // Someone who already has children (but lost the remembered choice) has
      // been here before: skip the welcome and let them pick.
      setTab((t) => (t === 'welcome' ? 'children' : t))
      // With no valid active child — none ever chosen, or the remembered one
      // was just removed — everything themed on it (header, accent colour)
      // would silently fall back to the default. Rather than leave that
      // silent, fall back to a real child instead: the one used to be reached
      // for could still be applied and just never was, or is gone now.
      setActiveChildId((current) => {
        if (current && c.some((child) => child.id === current)) return current
        const fallback = c[0].id
        try {
          localStorage.setItem('activeChildId', fallback)
        } catch {
          // ignore — worst case the choice just isn't remembered next session
        }
        return fallback
      })
    }
    setEditions(e)
    setSessions(s)
    // Object URLs are per-blob handles into browser memory — replace the whole
    // set on reload rather than accumulating, or they'd leak for the session's
    // lifetime every time a new photo is added.
    setCoverPhotoUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url))
      return new Map(photos.map((p) => [p.editionId, URL.createObjectURL(p.blob)]))
    })
    setCoverCacheUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url))
      return new Map(cachedCovers.map((p) => [p.editionId, URL.createObjectURL(p.blob)]))
    })
    // Backfill for editions added before this cache existed (or restored from
    // a backup, which never carries it): not awaited, and each one no-ops if
    // already cached, so this is cheap to just run on every load.
    const cachedIds = new Set(cachedCovers.map((p) => p.editionId))
    for (const edition of e) {
      if (edition.coverUrl && !photos.some((p) => p.editionId === edition.id) && !cachedIds.has(edition.id)) {
        storage.cacheCoverIfMissing(edition.id, edition.coverUrl)
      }
    }
  }

  // Split from reload() (rather than just calling it) so a genuine hang here
  // — the connection blocked by a stale tab, most likely, but this is the
  // one call nothing else can work without — ends in a clear, retryable
  // error instead of an indefinite spinner with no way out.
  const startInitialLoad = () => {
    setLoadError('')
    const timer = window.setTimeout(() => setSlowLoad(true), 6000)
    withTimeout(reload(), 25_000, "Couldn't load. If another tab or window of this app is open, close it and try again.")
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        window.clearTimeout(timer)
        setSlowLoad(false)
      })
  }

  useEffect(() => {
    startInitialLoad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The child picker is reached from Settings on either tab; picking a child
  // returns to whichever tab you came from, not always to Log.
  const [returnTab, setReturnTab] = useState<'log' | 'history'>('log')
  const openChildren = () => {
    if (tab === 'log' || tab === 'history') setReturnTab(tab)
    setTab('children')
  }

  const chooseChild = (id: string) => {
    setActiveChildId(id)
    try {
      localStorage.setItem('activeChildId', id)
    } catch {
      // ignore — worst case the choice just isn't remembered next session
    }
    setTab(returnTab)
  }

  const activeChild = children.find((c) => c.id === activeChildId)
  useEffect(() => applyTheme(activeChild?.colour), [activeChild?.colour])

  return (
    <div className="app">
      <header className="app-header">
        {/* Shared chrome above both tabs, naming the one child the whole app is scoped
            to (switch in Settings > Children). Lowercase "with": this is a greeting, not
            the app's proper name (still "Read With Them" elsewhere). */}
        <h1>{activeChild ? `Read with ${activeChild.name}` : 'Read with Them'}</h1>
        <button type="button" className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </header>
      {loadError ? (
        <div className="card empty-state">
          <p>{loadError}</p>
          <button type="button" className="submit-btn" onClick={startInitialLoad}>
            Try again
          </button>
        </div>
      ) : (
        slowLoad && (
          <div className="card empty-state">
            Taking longer than usual to load. If another tab or window of this app is open — including in the
            background — try closing it and reloading this one.
          </div>
        )
      )}
      {tab === 'welcome' && <WelcomeView onContinue={() => setTab('children')} />}
      {tab !== 'welcome' && (
      <nav>
        <button aria-current={tab === 'log'} onClick={() => setTab('log')}>
          <span className="nav-icon" aria-hidden="true">📖</span>
          Log
        </button>
        <button aria-current={tab === 'history'} onClick={() => setTab('history')}>
          <span className="nav-icon" aria-hidden="true">🕘</span>
          History
        </button>
      </nav>
      )}

      {tab === 'children' && (
        <ChildrenView
          children={children}
          sessions={sessions}
          activeChildId={activeChildId}
          onSelect={chooseChild}
          onCreated={async (id) => {
            await reload()
            chooseChild(id)
          }}
          onColour={async (id, colour) => {
            await storage.updateChild(id, { colour })
            await reload()
          }}
          onDelete={async (id) => {
            await storage.deleteChild(id)
            if (id === activeChildId) {
              setActiveChildId('')
              try {
                localStorage.removeItem('activeChildId')
              } catch {
                // ignore — worst case the child picker shows instead of Log
              }
            }
            await reload()
          }}
        />
      )}
      {tab === 'log' && (
        <LogReadingView
          activeChild={activeChild}
          editions={editions}
          sessions={sessions}
          coverPhotoUrls={coverPhotoUrls}
          coverCacheUrls={coverCacheUrls}
          onChange={reload}
          onSwitchToChildren={openChildren}
        />
      )}
      {tab === 'history' && (
        <HistoryView
          sessions={sessions}
          children={children}
          editions={editions}
          activeChildId={activeChildId}
          coverPhotoUrls={coverPhotoUrls}
          coverCacheUrls={coverCacheUrls}
          onDelete={async (id) => {
            await storage.deleteSession(id)
            await reload()
          }}
        />
      )}

      <Panel open={settingsOpen} onClose={() => setSettingsOpen(false)} variant="drawer" title="Settings">
        <button
          type="button"
          className="settings-row"
          onClick={() => {
            setSettingsOpen(false)
            openChildren()
          }}
        >
          <span>
            <strong>Children</strong>
            <span className="muted">Add a child, or switch who you're logging for</span>
          </span>
          <span className="settings-row-icon" aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          className="settings-row"
          onClick={async () =>
            download(`readwiththem-backup-${toISODate(new Date())}.json`, await storage.exportBackupJSON(), 'application/json')
          }
        >
          <span>
            <strong>Download full backup</strong>
            <span className="muted">Everything in this browser, as JSON. Keep it safe: the data lives nowhere else.</span>
          </span>
        </button>
        <RestoreBackupButton variant="settings" />
        <button
          type="button"
          className="settings-row danger-row"
          onClick={async () => {
            if (!confirm('Delete everything in this browser — every child, book and reading? This cannot be undone. Download a backup first if you want to keep it.')) return
            await storage.resetAllData()
            try {
              localStorage.removeItem('activeChildId')
            } catch {
              // ignore — the page is about to reload with nothing left to remember anyway
            }
            window.location.reload()
          }}
        >
          <span>
            <strong>Reset all data</strong>
            <span className="muted">Deletes every child, book and reading from this browser.</span>
          </span>
        </button>
        <div className="settings-about muted">
          <strong>Privacy</strong>
          <p>Everything you log stays in this browser. Nothing is ever sent anywhere.</p>
          <AboutFooter />
        </div>
      </Panel>
    </div>
  )
}

// A native modal <dialog>: focus trapping, Escape and the top layer come free.
// "sheet" rises from the bottom on a phone and centres on wider screens; "drawer"
// slides in from the right.
function Panel({
  open,
  onClose,
  variant,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  variant: 'sheet' | 'drawer'
  title: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`panel ${variant}`}
      aria-label={title}
      // React bubbles the native (non-bubbling) close/click events up through the
      // component tree, not just the DOM tree — so a Panel opened from inside another
      // Panel's content (e.g. the Ko-fi panel from within Settings) would otherwise
      // close its ancestor too. Only react when this exact dialog fired the event.
      onClose={(e) => e.target === e.currentTarget && onClose()}
      // The dialog element itself is only hit on the backdrop; its content sits
      // in .panel-body, which covers the whole box.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {open && (
        <div className="panel-body">
          <div className="panel-header">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

// A stuck IndexedDB connection (see db.ts's versionchange handler — this is
// what that guards against) has no error and no native timeout: it just
// never resolves. Rather than let that show up as a silent, permanent spin
// on whatever action triggered it, this turns "never" into a clear failure.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), ms)),
  ])
}

// The counterpart to "Download full backup" — restores one, from the settings
// drawer or from the very first screen (moving to a new device, or recovering
// after this one's storage was cleared). A restore replaces everything
// currently in this browser, so it asks for confirmation before touching
// anything, then reloads the page: simpler and more reliable than trying to
// resync every piece of React state by hand after the swap underneath it.
function RestoreBackupButton({ variant }: { variant: 'settings' | 'welcome' }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'restoring' | 'error'>('idle')
  const [error, setError] = useState('')

  const handleFile = async (file: File) => {
    if (!confirm('Restore this backup? Everything currently in this browser will be replaced. This cannot be undone.')) return
    setStatus('restoring')
    setError('')
    try {
      await withTimeout(
        storage.importBackupJSON(await file.text()),
        15_000,
        "Timed out. If another tab or window of this app is open, close it and try again — that's the most common cause.",
      )
      try {
        localStorage.removeItem('activeChildId')
      } catch {
        // ignore — worst case the child picker shows instead of Log
      }
      window.location.reload()
    } catch (err) {
      console.error('backup restore failed', err)
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const trigger = (
    <input
      ref={inputRef}
      type="file"
      accept="application/json,.json"
      className="visually-hidden"
      onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) handleFile(file)
      }}
    />
  )

  if (variant === 'settings') {
    return (
      <>
        {trigger}
        <button type="button" className="settings-row" disabled={status === 'restoring'} onClick={() => inputRef.current?.click()}>
          <span>
            <strong>Restore from backup</strong>
            <span className="muted">
              {status === 'restoring' ? 'Restoring…' : status === 'error' ? `Could not restore: ${error}` : 'Replaces everything above with a backup file.'}
            </span>
          </span>
        </button>
      </>
    )
  }

  return (
    <>
      {trigger}
      <button type="button" className="link-btn" disabled={status === 'restoring'} onClick={() => inputRef.current?.click()}>
        {status === 'restoring' ? 'Restoring…' : 'Already have a backup? Restore it'}
      </button>
      {status === 'error' && <p className="muted">Could not restore: {error}</p>}
    </>
  )
}

// Shared by the welcome screen and the settings drawer — the two places this
// unobtrusive "who made this" footer belongs.
function AboutFooter() {
  return (
    <p className="muted about-footer">
      © 2026 Patrick Totzke ·{' '}
      {/* A plain external link, not the in-app iframe panel this used to open: as
          an installed app, that panel stayed inside it — this hands off to the
          system browser instead, the same as tapping any other external link. */}
      <a href="https://ko-fi.com/patricktotzke" target="_blank" rel="noopener noreferrer" className="kofi-link">
        <img src="https://storage.ko-fi.com/cdn/brandasset/v2/kofi_symbol.png" alt="" aria-hidden="true" /> Buy me a
        coffee
      </a>
    </p>
  )
}

function WelcomeView({ onContinue }: { onContinue: () => void }) {
  const [canPrompt, setCanPrompt] = useState(!!installPrompt)
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    const update = () => setCanPrompt(!!installPrompt)
    const done = () => setInstalled(true)
    installPromptListeners.add(update)
    window.addEventListener('appinstalled', done)
    return () => {
      installPromptListeners.delete(update)
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

  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; the touch screen gives it away.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/.test(ua)

  return (
    <div className="card welcome">
      <p className="welcome-lead">
        A simple, private diary of the books you read with your children. Log a book in a couple of taps, look back
        over what you have read, and export your reading log.
      </p>

      <h3>First, add it to your home screen</h3>
      {installed ? (
        <p>Installed. Open <strong>Read With Them</strong> from your home screen or app list to get started.</p>
      ) : canPrompt ? (
        <>
          <p>It then opens like any other app, and works without an internet connection. It's free and takes a second.</p>
          <button type="button" className="submit-btn welcome-install" onClick={install}>
            Install the app
          </button>
        </>
      ) : isIOS ? (
        <>
          <ol className="welcome-steps">
            <li>
              Tap the <strong>Share</strong> button{' '}
              <svg className="inline-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share icon">
                <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
              </svg>{' '}
              in the browser's toolbar. On an iPhone, it may be behind the <strong>⋯</strong> button.
            </li>
            <li>Scroll down and choose <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong>, then open <strong>Read With Them</strong> from your home screen.</li>
          </ol>
          {/* iOS keeps a home-screen app's data separate from Safari's, so
              anything entered here would not follow the user into the app. */}
          <p className="muted">Do this before adding anything: on iPhone and iPad, what you enter in the browser stays in the browser.</p>
        </>
      ) : isAndroid ? (
        <ol className="welcome-steps">
          <li>Open the browser menu, usually <strong>⋮</strong> at the top or bottom right.</li>
          <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
          <li>Open <strong>Read With Them</strong> from your home screen.</li>
        </ol>
      ) : (
        <p>
          On a computer, look for the install icon at the right-hand end of the address bar, or bookmark this page. It
          is at its best on a phone, though, where you can scan a book's barcode.
        </p>
      )}

      <button type="button" className="link-btn welcome-skip" onClick={onContinue}>
        Continue in the browser instead
      </button>
      <p className="muted welcome-privacy">
        No account needed. Everything stays on this device; nothing about your children or books is sent anywhere.
      </p>
      <AboutFooter />
    </div>
  )
}

// The native colour input, committed on the "change" event (picker closed)
// rather than React's onChange, which fires on every drag step and would write
// each intermediate colour to storage and the change log.
function ColourInput({ value, label, className, onCommit }: { value: string; label: string; className: string; onCommit: (colour: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const commit = useRef(onCommit)
  commit.current = onCommit
  useEffect(() => {
    const input = ref.current
    if (!input) return
    const handle = () => commit.current(input.value)
    input.addEventListener('change', handle)
    return () => input.removeEventListener('change', handle)
  }, [])
  // Keyed on value so an outside change (e.g. a restore) resets the uncontrolled input.
  return <input key={value} ref={ref} type="color" className={className} defaultValue={value} aria-label={label} title={label} />
}

// The swatch button opens a panel offering exactly two kinds of choice: the
// curated presets, and one native picker for anything else — not a full
// picker inlined into every row, which a list this width has no room for.
function ColourPicker({ value, childName, onChange }: { value: string; childName: string; onChange: (colour: string) => void }) {
  const [open, setOpen] = useState(false)
  const choose = (colour: string) => {
    onChange(colour)
    setOpen(false)
  }
  return (
    <>
      <button
        type="button"
        className="child-colour"
        style={{ background: value }}
        aria-label={`Colour for ${childName}`}
        title={`Colour for ${childName}`}
        onClick={() => setOpen(true)}
      />
      <Panel open={open} onClose={() => setOpen(false)} variant="sheet" title={`Colour for ${childName}`}>
        {/* One row: the current colour leads (it's the live native picker, for
            anything not in the presets), the fixed presets follow. */}
        <div className="colour-presets">
          <ColourInput value={value} label="Current colour — tap to choose a custom one" className="colour-swatch colour-swatch-custom" onCommit={choose} />
          {PRESET_COLOURS.map((p) => (
            <button
              key={p.hex}
              type="button"
              className={`colour-swatch${value.toLowerCase() === p.hex.toLowerCase() ? ' active' : ''}`}
              style={{ background: p.hex }}
              aria-label={p.name}
              title={p.name}
              onClick={() => choose(p.hex)}
            />
          ))}
        </div>
      </Panel>
    </>
  )
}

function ChildrenView({
  children,
  sessions,
  activeChildId,
  onSelect,
  onCreated,
  onColour,
  onDelete,
}: {
  children: Child[]
  sessions: ReadingSession[]
  activeChildId: string
  onSelect: (id: string) => void
  onCreated: (id: string) => void
  onColour: (id: string, colour: string) => void
  onDelete: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const child = await withTimeout(
        storage.addChild(name.trim(), birthYear ? Number(birthYear) : undefined),
        15_000,
        "Timed out. If another tab or window of this app is open, close it and try again — that's the most common cause.",
      )
      setName('')
      setBirthYear('')
      onCreated(child.id)
    } catch (err) {
      console.error('addChild failed', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  // With children already added, choosing one is the main job here, so the
  // list comes first and the add form second.
  const addForm = (
    <div className="card">
      <h3>{children.length === 0 ? 'Who are you reading with?' : 'Add a child'}</h3>
      <form onSubmit={submit}>
        <input placeholder="Child's name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Birth year (optional)" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} type="number" />
        <button className="submit-btn" type="submit" disabled={submitting}>{submitting ? 'Adding…' : 'Add child'}</button>
        {error && <p className="muted">Could not save: {error}</p>}
      </form>
      {children.length === 0 && (
        <div className="restore-hint">
          <RestoreBackupButton variant="welcome" />
        </div>
      )}
    </div>
  )

  if (children.length === 0) {
    return (
      <div>
        {addForm}
        <div className="card empty-state">
          <span className="empty-icon" aria-hidden="true">🧒</span>
          Add a child above to get started.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="card">
        <h3>Who are you reading with?</h3>
        <ul className="child-list">
          {children.map((c) => {
            const readingCount = sessions.filter((s) => s.childId === c.id).length
            return (
              <li key={c.id}>
                <button type="button" className={c.id === activeChildId ? 'child-active' : ''} onClick={() => onSelect(c.id)}>
                  {c.id === activeChildId ? '✓ ' : ''}
                  {c.name}
                  {c.birthYear ? ` (b. ${c.birthYear})` : ''}
                </button>
                <ColourPicker
                  value={c.colour ?? DEFAULT_COLOUR}
                  childName={c.name}
                  onChange={(colour) => onColour(c.id, colour)}
                />
                <button
                  type="button"
                  className="link-btn danger child-remove"
                  onClick={() => {
                    const warning = readingCount > 0 ? ` This also removes ${readingCount} reading${readingCount === 1 ? '' : 's'} logged for them.` : ''
                    if (confirm(`Remove ${c.name}?${warning} This cannot be undone.`)) onDelete(c.id)
                  }}
                >
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {addForm}
    </div>
  )
}

function LogReadingView({
  activeChild,
  editions,
  sessions,
  coverPhotoUrls,
  coverCacheUrls,
  onChange,
  onSwitchToChildren,
}: {
  activeChild: Child | undefined
  editions: Edition[]
  sessions: ReadingSession[]
  coverPhotoUrls: Map<string, string>
  coverCacheUrls: Map<string, string>
  onChange: () => void
  onSwitchToChildren: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BookSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<BookSearchResult | null>(null)
  const [mode, setMode] = useState<'none' | 'scan' | 'again' | 'search' | 'manual'>('none')
  const [manualTitle, setManualTitle] = useState('')
  const [manualAuthor, setManualAuthor] = useState('')
  const [manualIsbn, setManualIsbn] = useState('')
  const [date, setDate] = useState(() => toISODate(new Date()))
  const [note, setNote] = useState('')
  const [rating, setRating] = useState('')
  const [status, setStatus] = useState('')
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number>()
  // So two readings logged back to back never get the same joke twice running.
  const lastPraiseTemplate = useRef<string>()
  const [coverPhotoBlob, setCoverPhotoBlob] = useState<Blob | null>(null)
  const [coverPhotoPreviewUrl, setCoverPhotoPreviewUrl] = useState<string | null>(null)
  const [capturingCover, setCapturingCover] = useState(false)

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  // The just-captured photo needs its own object URL for an immediate preview,
  // separate from coverPhotoUrls (which only covers already-saved editions).
  useEffect(() => {
    if (!coverPhotoBlob) {
      setCoverPhotoPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(coverPhotoBlob)
    setCoverPhotoPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [coverPhotoBlob])

  const confirm = (message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3300)
  }

  const latestDateByEdition = new Map<string, string>()
  for (const s of sessions) {
    // "Read again" offers this child's own books, not the whole household's —
    // otherwise one child's cascade fills another's list of what to tap next.
    if (s.childId !== activeChild?.id) continue
    const prev = latestDateByEdition.get(s.editionId)
    if (!prev || s.date > prev) latestDateByEdition.set(s.editionId, s.date)
  }
  const recentEditions = Array.from(latestDateByEdition.entries())
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([editionId]) => editions.find((e) => e.id === editionId))
    .filter((e): e is Edition => !!e)

  // One tap logs the book — no second step. It uses the same date/rating/note
  // fields shown below for every entry mode, rather than a separate set, and
  // clears the note and rating afterwards so they can't carry over onto the
  // next book tapped.
  const readAgain = async (edition: Edition) => {
    if (!activeChild) return
    try {
      await storage.logReading({
        childId: activeChild.id,
        editionId: edition.id,
        date,
        note: note.trim() || undefined,
        rating: rating ? Number(rating) : undefined,
      })
      setNote('')
      setRating('')
      const praise = pickPraise(edition.title, lastPraiseTemplate.current)
      lastPraiseTemplate.current = praise.template
      confirm(praise.message)
      onChange()
    } catch (err) {
      console.error('readAgain failed', err)
      setStatus(`Could not save: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleScanned = async (isbn: string) => {
    setStatus('Looking up scanned ISBN…')
    try {
      const found = await lookupISBN(isbn)
      if (found) {
        setSelected(found)
        setMode('none')
        setStatus('')
        return
      }
      setStatus(`Scanned ISBN ${isbn} but couldn't find it online — fill in the title below.`)
    } catch {
      setStatus(`Scanned ISBN ${isbn}, but the lookup failed — check your connection, or fill in the title below.`)
    }
    setManualIsbn(isbn)
    setMode('manual')
  }

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    try {
      const householdMatches = editions.filter((ed) => ed.title.toLowerCase().includes(query.toLowerCase()))
      const online = await searchCatalogue(query)
      setResults([...householdMatches.map((ed) => ({ title: ed.title, author: ed.author, isbn: ed.isbn, coverUrl: ed.coverUrl })), ...online])
    } catch {
      setStatus('Search failed — check your connection, or add the book manually below.')
    } finally {
      setSearching(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeChild) return
    const book =
      selected ??
      (manualTitle.trim()
        ? { title: manualTitle.trim(), author: manualAuthor.trim() || 'Unknown', isbn: manualIsbn.trim() || undefined }
        : null)
    if (!book) return setStatus('Search and pick a book, or enter a title manually.')

    try {
      const edition = await storage.addEdition({
        title: book.title,
        author: book.author,
        coverUrl: 'coverUrl' in book ? book.coverUrl : undefined,
        isbn: 'isbn' in book ? book.isbn : undefined,
        source: selected ? 'openlibrary' : 'manual',
      })
      if (coverPhotoBlob) await storage.saveCoverPhoto(edition.id, coverPhotoBlob)
      await storage.logReading({
        childId: activeChild.id,
        editionId: edition.id,
        date,
        note: note.trim() || undefined,
        rating: rating ? Number(rating) : undefined,
      })

      setSelected(null)
      setMode('none')
      setManualTitle('')
      setManualAuthor('')
      setManualIsbn('')
      setCoverPhotoBlob(null)
      setNote('')
      setRating('')
      setResults([])
      setQuery('')
      setStatus('')
      const praise = pickPraise(book.title, lastPraiseTemplate.current)
      lastPraiseTemplate.current = praise.template
      confirm(praise.message)
      onChange()
    } catch (err) {
      console.error('logReading failed', err)
      setStatus(`Could not save: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (!activeChild) {
    return (
      <div className="card empty-state">
        <span className="empty-icon" aria-hidden="true">📖</span>
        <p className="muted">No child selected yet.</p>
        <button className="submit-btn" onClick={onSwitchToChildren}>Choose or add a child</button>
      </div>
    )
  }

  // Shared between the "picked a book" and "manual entry" branches below, so a
  // coverless book gets the same capture affordance regardless of how it was added.
  const coverPhotoControl = capturingCover ? (
    <CoverCapture
      onCapture={(blob) => {
        setCoverPhotoBlob(blob)
        setCapturingCover(false)
      }}
      onClose={() => setCapturingCover(false)}
    />
  ) : (
    <button type="button" className="link-btn" onClick={() => setCapturingCover(true)}>
      📷 {coverPhotoBlob ? 'Retake cover photo' : 'Add a cover photo'}
    </button>
  )

  return (
    <div>
      <form className="card" onSubmit={submit}>
        <p className="muted">
          New reading for <strong>{activeChild.name}</strong>
        </p>

        <div>
          <span className="field-label">Book</span>
          {selected ? (
            capturingCover ? (
              coverPhotoControl
            ) : (
              <>
                <div className="search-result">
                  <BookCover src={coverPhotoPreviewUrl ?? selected.coverUrl} title={selected.title} size="sm" />
                  <span>{selected.title} — {selected.author}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(null)
                      setMode('none')
                      setCoverPhotoBlob(null)
                    }}
                  >
                    Change
                  </button>
                </div>
                {coverPhotoControl}
              </>
            )
          ) : mode === 'none' ? (
            <div className="book-entry-modes">
              <button type="button" className="mode-primary" onClick={() => setMode('again')}>
                <span aria-hidden="true">🔁</span> Read again
              </button>
              <button type="button" className="mode-primary" onClick={() => setMode('scan')}>
                <span aria-hidden="true">📖</span> Scan barcode
              </button>
              <button type="button" className="mode-primary" onClick={() => setMode('search')}>
                <span aria-hidden="true">🔍</span> Search
              </button>
              <button type="button" className="mode-primary" onClick={() => setMode('manual')}>
                <span aria-hidden="true">✏️</span> Add manually
              </button>
            </div>
          ) : mode === 'scan' ? (
            <BarcodeScanner onDetect={handleScanned} onClose={() => setMode('none')} />
          ) : mode === 'again' ? (
            <div>
              <button type="button" className="back-btn" onClick={() => setMode('none')}>
                <span aria-hidden="true">←</span> Back
              </button>
              {recentEditions.length > 0 ? (
                <>
                  <p className="muted">Tap a book to log it, using the date and rating below.</p>
                  <div className="cover-cascade">
                    {recentEditions.map((e) => (
                      <button key={e.id} type="button" className="cascade-item" onClick={() => readAgain(e)}>
                        <BookCover src={resolveCoverUrl(coverPhotoUrls, coverCacheUrls, e)} title={e.title} size="lg" />
                        <span>{e.title}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="muted">No books to read again yet — try Search or Scan instead.</p>
              )}
            </div>
          ) : mode === 'search' ? (
            <div>
              <button type="button" className="back-btn" onClick={() => setMode('none')}>
                <span aria-hidden="true">←</span> Back
              </button>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input placeholder="Search title or author" value={query} onChange={(e) => setQuery(e.target.value)} />
                <button type="button" onClick={runSearch} disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
              </div>
              {results.map((r, i) => (
                <div key={i} className="search-result" onClick={() => setSelected(r)}>
                  <BookCover src={r.coverUrl} title={r.title} size="sm" />
                  <span>{r.title} — {r.author}</span>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <button type="button" className="back-btn" onClick={() => setMode('none')}>
                <span aria-hidden="true">←</span> Back
              </button>
              <div className="manual-entry">
                <label>
                  <span className="field-label">Title</span>
                  <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} />
                </label>
                <label>
                  <span className="field-label">Author</span>
                  <input value={manualAuthor} onChange={(e) => setManualAuthor(e.target.value)} />
                </label>
                <label>
                  <span className="field-label">ISBN (optional)</span>
                  <input value={manualIsbn} onChange={(e) => setManualIsbn(e.target.value)} />
                </label>
                {!capturingCover && coverPhotoPreviewUrl && (
                  <div className="search-result">
                    <BookCover src={coverPhotoPreviewUrl} title={manualTitle || 'Cover photo'} size="sm" />
                    <span>Cover photo added</span>
                  </div>
                )}
                {coverPhotoControl}
              </div>
            </div>
          )}
        </div>

        <div className="field-row">
          <label>
            <span className="field-label">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div>
            <span className="field-label">Rating</span>
            <StarRating value={rating} onChange={setRating} />
          </div>
        </div>

        <textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

        <button className="submit-btn" type="submit">Log reading</button>
        {status && <p className="muted">{status}</p>}
      </form>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span> {toast}
        </div>
      )}
    </div>
  )
}

type RangePreset = 'week' | 'month' | 'all' | 'custom'

// A viewing preference, like the active child, so it lives in localStorage.
function loadBookOrder(): BookOrder {
  try {
    const saved = localStorage.getItem('bookOrder')
    return saved === 'count' || saved === 'title' ? saved : 'recent'
  } catch {
    return 'recent'
  }
}

function presetRange(preset: Exclude<RangePreset, 'custom'>): [string, string] {
  const now = new Date()
  if (preset === 'week') return [toISODate(startOfWeek(now)), toISODate(endOfWeek(now))]
  if (preset === 'month') return [toISODate(startOfMonth(now)), toISODate(endOfMonth(now))]
  return ['', '']
}

function HistoryView({
  sessions,
  children,
  editions,
  activeChildId,
  coverPhotoUrls,
  coverCacheUrls,
  onDelete,
}: {
  sessions: ReadingSession[]
  children: Child[]
  editions: Edition[]
  activeChildId: string
  coverPhotoUrls: Map<string, string>
  coverCacheUrls: Map<string, string>
  onDelete: (id: string) => void
}) {
  // Scoped to the active child, like the rest of the app (switch in Settings >
  // Children). The date range is the only filter here; the export sheet exports
  // the same readings, in the book order chosen there.
  const [preset, setPreset] = useState<RangePreset>('month')
  const [customFrom, setCustomFrom] = useState(() => presetRange('month')[0])
  const [customTo, setCustomTo] = useState(() => presetRange('month')[1])
  const [exportOpen, setExportOpen] = useState(false)
  // Lives here, not in ExportOptions, so it survives the export sheet closing
  // itself — a silent download (image, CSV) needs something to say where it went.
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number>()
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])
  const showToast = (message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3000)
  }

  const childById = new Map(children.map((c) => [c.id, c]))
  const editionById = new Map(editions.map((e) => [e.id, e]))
  const [from, to] = preset === 'custom' ? [customFrom, customTo] : presetRange(preset)

  if (sessions.length === 0) {
    return (
      <div className="card empty-state">
        <span className="empty-icon" aria-hidden="true">🕘</span>
        No readings logged yet.
      </div>
    )
  }

  // Newest first, as listSessions already orders them.
  const filtered = sessions.filter((s) => {
    // No active child (e.g. just removed) falls back to the whole household.
    if (activeChildId && s.childId !== activeChildId) return false
    if (from && s.date < from) return false
    if (to && s.date > to) return false
    return true
  })
  const bookCount = new Set(filtered.map((s) => s.editionId)).size
  const filterChild = childById.get(activeChildId)
  const rangeLabel = formatDateRangeLabel(from, to)

  return (
    <div>
      <div className="card history-filters">
        <span className="field-label">Period</span>
        <div className="segmented">
          {([
            ['week', 'This week'],
            ['month', 'This month'],
            ['all', 'All time'],
            ['custom', 'Custom'],
          ] as const).map(([value, labelText]) => (
            <button
              key={value}
              type="button"
              aria-pressed={preset === value}
              className={preset === value ? 'active' : ''}
              onClick={() => {
                // Custom starts from whatever was showing, so it refines rather than resets.
                if (value === 'custom' && preset !== 'custom') {
                  setCustomFrom(from)
                  setCustomTo(to)
                }
                setPreset(value)
              }}
            >
              {labelText}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="filter-dates">
            <label>
              <span className="field-label">From</span>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label>
              <span className="field-label">To</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </div>
        )}

        <div className="history-summary">
          <span className="muted">
            {filtered.length} reading{filtered.length === 1 ? '' : 's'} · {bookCount} book{bookCount === 1 ? '' : 's'}
          </span>
          <button type="button" className="submit-btn export-btn" onClick={() => setExportOpen(true)} disabled={filtered.length === 0}>
            <span aria-hidden="true">↗</span> Export
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card empty-state">Nothing logged for this selection.</div>
      ) : (
        <div className="card">
          {filtered.map((s) => {
            const edition = editionById.get(s.editionId)
            const title = edition?.title ?? 'Unknown book'
            return (
              <div key={s.id} className="session-row">
                <BookCover src={resolveCoverUrl(coverPhotoUrls, coverCacheUrls, edition)} title={title} size="sm" />
                <div className="session-row-body">
                  <div className="session-row-header">
                    <div>
                      <strong>{title}</strong>
                      {edition?.author && <span className="muted"> by {edition.author}</span>}
                    </div>
                    <button
                      type="button"
                      className="link-btn danger"
                      onClick={() => {
                        if (confirm(`Remove this reading of "${title}"?`)) onDelete(s.id)
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="muted">
                    {s.date}
                    {!filterChild && ` · ${childById.get(s.childId)?.name ?? 'Unknown child'}`}
                    {s.rating ? ` · ${'★'.repeat(s.rating)}` : ''}
                  </div>
                  {s.note && <div>{s.note}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Panel open={exportOpen} onClose={() => setExportOpen(false)} variant="sheet" title="Export">
        <ExportOptions
          sessions={filtered}
          children={children}
          editions={editions}
          coverPhotoUrls={coverPhotoUrls}
          coverCacheUrls={coverCacheUrls}
          titleLine={filterChild ? `${filterChild.name}'s books` : 'Our books'}
          childName={filterChild?.name}
          accent={childTheme(filterChild?.colour ?? DEFAULT_COLOUR).light.primary}
          rangeLabel={rangeLabel}
          onClose={() => setExportOpen(false)}
          onExported={showToast}
        />
      </Panel>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span> {toast}
        </div>
      )}
    </div>
  )
}

// Turns "Freya" / "September 2026" / "All time" into filename-safe words —
// used to build exported filenames like "read-with-freya-september-2026".
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function download(filename: string, content: string | Blob, mime: string) {
  // A UTF-8 BOM is prepended for plain-text formats that tend to be opened by
  // naive external tools (Excel on a CSV, some editors on markdown) — without
  // it, those tools guess the system codepage instead of UTF-8 and mangle any
  // non-ASCII character (an em dash, a "×", an accented name) into mojibake.
  // The Blob's own `type` only matters inside this tab; once saved to disk,
  // whatever opens the file sees nothing but bytes and a file extension.
  const needsBom = typeof content === 'string' && (mime.startsWith('text/csv') || mime.startsWith('text/markdown'))
  const body = needsBom ? '\uFEFF' + content : content
  const blob = body instanceof Blob ? body : new Blob([body], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Deliberately not d.toISOString().slice(0, 10): that converts to UTC first, which
// silently shifts the date by a day whenever the local timezone offset crosses
// midnight relative to UTC — exactly the kind of bug that only shows up sometimes.
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function startOfWeek(d: Date): Date {
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return monday
}

function endOfWeek(d: Date): Date {
  const sunday = startOfWeek(d)
  sunday.setDate(sunday.getDate() + 6)
  return sunday
}

// An empty bound means unbounded, so the same range powers "this month" and "all time".
function formatDateRangeLabel(from: string, to: string): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  if (!from && !to) return 'All time'
  if (!from) return `Up to ${fmt(parseISODate(to))}`
  if (!to) return `From ${fmt(parseISODate(from))}`

  const fromDate = parseISODate(from)
  const toDate = parseISODate(to)
  const isFullMonth =
    fromDate.getDate() === 1 &&
    fromDate.getMonth() === toDate.getMonth() &&
    fromDate.getFullYear() === toDate.getFullYear() &&
    toISODate(toDate) === toISODate(endOfMonth(fromDate))
  if (isFullMonth) return fromDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  return `${fmt(fromDate)} – ${fmt(toDate)}`
}

type ExportFormat = 'text' | 'image' | 'print' | 'csv'

const EXPORT_FORMATS: Array<{ value: ExportFormat; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'print', label: 'Print / PDF' },
  { value: 'csv', label: 'Spreadsheet' },
]

function ExportOptions({
  sessions,
  children,
  editions,
  coverPhotoUrls,
  coverCacheUrls,
  titleLine,
  childName,
  accent,
  rangeLabel,
  onClose,
  onExported,
}: {
  sessions: ReadingSession[]
  children: Child[]
  editions: Edition[]
  coverPhotoUrls: Map<string, string>
  coverCacheUrls: Map<string, string>
  titleLine: string
  childName: string | undefined
  accent: string
  rangeLabel: string
  onClose: () => void
  onExported: (message: string) => void
}) {
  const [format, setFormat] = useState<ExportFormat>('text')
  const [order, setOrder] = useState<BookOrder>(loadBookOrder)
  const chooseOrder = (value: BookOrder) => {
    setOrder(value)
    try {
      localStorage.setItem('bookOrder', value)
    } catch {
      // ignore — the choice just isn't remembered next time
    }
  }
  const [showCovers, setShowCovers] = useState(true)
  const [showNotes, setShowNotes] = useState(true)
  const [showCounts, setShowCounts] = useState(false)
  const [listImageStatus, setListImageStatus] = useState<'idle' | 'rendering' | 'error'>('idle')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const copyTimer = useRef<number>()
  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  const editionById = new Map(editions.map((e) => [e.id, e]))

  // sortReadings groups each book's readings and puts the books in the chosen
  // order, so each book is taken at its first appearance. The CSV uses the same
  // list, so every format agrees.
  const sorted = sortReadings(sessions, (id) => editionById.get(id)?.title ?? '', order)
  // One entry per book, not per reading — a re-read shows a "×N" badge instead
  // of repeating the cover. Notes accumulate oldest first, so they read as a
  // diary whatever order the books themselves are in.
  const books: Array<{ editionId: string; count: number; notes: string[] }> = []
  const bookIndex = new Map<string, number>()
  for (const s of sorted) {
    if (bookIndex.has(s.editionId)) continue
    bookIndex.set(s.editionId, books.length)
    books.push({ editionId: s.editionId, count: 0, notes: [] })
  }
  const chronological = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  for (const s of chronological) {
    const book = books[bookIndex.get(s.editionId)!]
    book.count += 1
    if (s.note) book.notes.push(s.note)
  }

  const heading = `${titleLine} — ${rangeLabel}`
  // e.g. "read-with-freya-september-2026" — echoes the header's own "Read
  // With Freya" naming, and doubles as the print dialog's suggested filename.
  const fileBase = `read-with-${slugify(childName ?? 'them')}-${slugify(rangeLabel)}`

  const copyListText = async () => {
    const rows = books.map(({ editionId, count, notes }) => {
      const edition = editionById.get(editionId)
      return { title: edition?.title ?? 'Unknown book', author: edition?.author, notes, count }
    })
    const markdown = booksToMarkdown(titleLine, rangeLabel, rows, { showCounts, showNotes })
    window.clearTimeout(copyTimer.current)
    try {
      await navigator.clipboard.writeText(markdown)
      setCopyStatus('copied')
      // A brief, visible "Copied ✓" before the sheet closes itself — the
      // clipboard write is otherwise invisible, so this is the only
      // confirmation there is.
      copyTimer.current = window.setTimeout(onClose, 700)
    } catch (err) {
      console.error('clipboard copy failed', err)
      setCopyStatus('error')
      // Left open on failure, so there's something to read and retry.
      copyTimer.current = window.setTimeout(() => setCopyStatus('idle'), 1800)
    }
  }

  const downloadListImage = async () => {
    // Opened synchronously, before any await, so the browser still treats it as
    // a direct response to the click rather than a blocked pop-up — a tab that
    // shows the finished image is the closest a web page can get to "opening"
    // a file it just saved, since there's no API to do that for real.
    const preview = window.open('', '_blank')
    // Rendered here, in this session, rather than through a persistent visible
    // canvas — so a locally photographed cover (a blob: URL) is fine to use:
    // it only needs to load once, right now, to be baked into the PNG.
    const rows: ListImageRow[] = books.map(({ editionId, count, notes }) => {
      const edition = editionById.get(editionId)
      return { title: edition?.title ?? 'Unknown book', author: edition?.author, coverUrl: resolveCoverUrl(coverPhotoUrls, coverCacheUrls, edition), count, notes }
    })
    setListImageStatus('rendering')
    try {
      const canvas = document.createElement('canvas')
      const { failedCovers } = await renderListImage(canvas, heading, rows, { showCovers, showCounts, showNotes, accent })
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('canvas.toBlob returned null')
      const filename = `${fileBase}.png`
      download(filename, blob, 'image/png')
      if (preview) {
        const previewUrl = URL.createObjectURL(blob)
        preview.location.href = previewUrl
        // Freed well after the tab's had time to load the image, rather than
        // right away, which would show a broken image instead.
        window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000)
      }
      setListImageStatus('idle')
      // A cover that had a URL but genuinely couldn't be fetched (blocked,
      // offline, an uncooperative CDN even via the proxy retry) is worth
      // saying — otherwise the export just looks quietly incomplete.
      onExported(
        failedCovers > 0
          ? `Saved ${filename} — ${failedCovers} cover${failedCovers === 1 ? '' : 's'} couldn't be fetched`
          : `Saved ${filename} to your downloads`,
      )
      onClose()
    } catch (err) {
      console.error('list image download failed', err)
      preview?.close()
      setListImageStatus('error')
    }
  }

  const downloadCSV = () => {
    const filename = `${fileBase}.csv`
    download(filename, storage.sessionsToCSV(sorted, children, editions), 'text/csv')
    onExported(`Saved ${filename} to your downloads`)
    onClose()
  }

  const runExport = () => {
    if (format === 'text') return copyListText()
    if (format === 'image') return downloadListImage()
    if (format === 'csv') return downloadCSV()
    // The browser's own print dialog is the confirmation here, so the sheet
    // closes as soon as it's handed off — but not before the browser has had
    // a moment to capture the print snapshot, since closing unmounts the
    // hidden print root this prints from.
    //
    // Chrome (and some other browsers) suggest document.title as the filename
    // when "Save as PDF" is chosen, so it's swapped in just for the print call
    // and put back once the dialog's had it.
    const previousTitle = document.title
    document.title = fileBase
    window.print()
    window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => {
      document.title = previousTitle
      onClose()
    }, 300)
  }

  const exportLabel =
    format === 'text'
      ? copyStatus === 'copied'
        ? 'Copied ✓'
        : copyStatus === 'error'
          ? 'Copy failed — try again'
          : 'Copy text'
      : format === 'image'
        ? listImageStatus === 'rendering'
          ? 'Preparing…'
          : 'Download image'
        : format === 'csv'
          ? 'Download spreadsheet'
          : 'Print / save as PDF'

  // The list preview backs both the on-screen image export and the hidden
  // print root — one render, two uses, rather than keeping them in sync by hand.
  const listPreview = (
    <div className="print-page list-mode">
      <h2>{heading}</h2>
      <ul className={`export-list${showCovers ? '' : ' plain'}`}>
        {books.map(({ editionId, count, notes }) => {
          const edition = editionById.get(editionId)
          const title = edition?.title ?? 'Unknown book'
          return (
            <li key={editionId} className="export-list-row">
              {showCovers && (
                <span className="cover-with-count">
                  <BookCover src={resolveCoverUrl(coverPhotoUrls, coverCacheUrls, edition)} title={title} size="sm" />
                  {showCounts && count > 1 && <span className="count-badge">×{count}</span>}
                </span>
              )}
              <div className="export-list-text">
                <strong>{title}</strong>
                {edition?.author && <span className="muted"> — {edition.author}</span>}
                {showNotes && notes.length > 0 && <div className="export-list-notes">{notes.join('; ')}</div>}
              </div>
              {!showCovers && showCounts && count > 1 && <span className="count-inline">×{count}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )

  return (
    <>
      <p className="muted export-summary">
        {titleLine} · {rangeLabel} · {books.length} book{books.length === 1 ? '' : 's'}
      </p>

      <span className="field-label">Format</span>
      <div className="format-grid" role="radiogroup" aria-label="Export format">
        {EXPORT_FORMATS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={format === value}
            className={format === value ? 'active' : ''}
            onClick={() => setFormat(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <span className="field-label">Sort books by</span>
      <div className="segmented">
        {([
          ['recent', 'Last read'],
          ['count', 'Most read'],
          ['title', 'Title'],
        ] as const).map(([value, labelText]) => (
          <button
            key={value}
            type="button"
            aria-pressed={order === value}
            className={order === value ? 'active' : ''}
            onClick={() => chooseOrder(value)}
          >
            {labelText}
          </button>
        ))}
      </div>

      {(format === 'image' || format === 'print') && (
        <label className="checkbox-row">
          <input type="checkbox" checked={showCovers} onChange={(e) => setShowCovers(e.target.checked)} />
          Include cover images
        </label>
      )}
      {format !== 'csv' && (
        <label className="checkbox-row">
          <input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} />
          Include reading notes
        </label>
      )}
      {format !== 'csv' && (
        <label className="checkbox-row">
          <input type="checkbox" checked={showCounts} onChange={(e) => setShowCounts(e.target.checked)} />
          Include how often each book was read
        </label>
      )}

      <button className="submit-btn export-submit" onClick={runExport} disabled={format === 'image' && listImageStatus === 'rendering'}>
        {exportLabel}
      </button>
      {listImageStatus === 'error' && format === 'image' && (
        <p className="muted">The image could not be generated — some covers may be unavailable.</p>
      )}

      {/* Printed from a direct child of <body> rather than from inside the modal:
          print CSS hides everything else outright (display: none, so no phantom
          blank pages), which a top-layer dialog would not survive. */}
      {createPortal(<div className="print-root">{listPreview}</div>, document.body)}
    </>
  )
}
