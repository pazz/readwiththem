import { useEffect, useState } from 'react'
import { useLibrary } from './data/useLibrary'
import { usePersistentStorage } from './data/usePersistentStorage'
import { applyColourScheme, applyTheme } from './theme'
import { isInstalled } from './lib/install'
import { useScreen } from './lib/navigation'
import { readPref, usePref, writePref } from './lib/prefs'
import { WelcomeView } from './views/WelcomeView'
import { ChildrenView } from './views/ChildrenView'
import { LogView } from './views/log/LogView'
import { HistoryView } from './views/history/HistoryView'
import { SettingsPanel } from './views/SettingsPanel'
import './App.css'

export default function App() {
  const { children, editions, sessions, coverFor, hasCoverPhoto, loadState } = useLibrary()
  const [chosenChildId, setChosenChildId] = useState(() => readPref('activeChildId'))
  const nav = useScreen(() => (readPref('activeChildId') ? 'log' : isInstalled() ? 'children' : 'welcome'))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme] = usePref('theme')
  useEffect(() => applyColourScheme(theme), [theme])
  const persistentStorage = usePersistentStorage(children.length > 0)

  // Whenever there are children, one of them is active: the chosen one, or
  // else the first (none chosen yet, or the chosen one was removed).
  const activeChild = children.find((c) => c.id === chosenChildId) ?? children[0]
  useEffect(() => {
    if (activeChild) writePref('activeChildId', activeChild.id)
  }, [activeChild])
  useEffect(() => applyTheme(activeChild?.colour), [activeChild?.colour])

  // Someone with children has been here before: no welcome.
  const screen = nav.screen === 'welcome' && children.length > 0 ? 'children' : nav.screen

  const chooseChild = (id: string) => {
    setChosenChildId(id)
    writePref('activeChildId', id)
    nav.done('log')
  }

  return (
    <div className="app">
      <header className="app-header">
        {/* Lowercase "with": a greeting, not the app's proper name. */}
        <h1>{activeChild ? `Read with ${activeChild.name}` : 'Read with Them'}</h1>
        <button type="button" className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </header>

      {loadState === 'failed' ? (
        <div className="card empty-state">
          <p>Couldn't load. If another tab or window of this app is open, close it and try again.</p>
          <button type="button" className="submit-btn" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      ) : (
        loadState === 'slow' && (
          <div className="card empty-state">
            Taking longer than usual to load. If another tab or window of this app is open — including in the background — try closing it
            and reloading this one.
          </div>
        )
      )}

      {screen === 'welcome' ? (
        <WelcomeView onContinue={() => nav.go('children', { replace: true })} />
      ) : (
        <nav>
          <button aria-current={screen === 'log'} onClick={() => nav.go('log')}>
            <span className="nav-icon" aria-hidden="true">
              📖
            </span>
            Log
          </button>
          <button aria-current={screen === 'history'} onClick={() => nav.go('history')}>
            <span className="nav-icon" aria-hidden="true">
              🕘
            </span>
            History
          </button>
        </nav>
      )}

      {screen === 'children' && (
        <ChildrenView
          children={children}
          sessions={sessions}
          activeChildId={activeChild?.id}
          onSelect={chooseChild}
          onCreated={chooseChild}
          onDeleted={(id) => {
            if (id === activeChild?.id) setChosenChildId('')
          }}
        />
      )}
      {screen === 'log' && (
        <LogView
          activeChild={activeChild}
          children={children}
          editions={editions}
          sessions={sessions}
          coverFor={coverFor}
          onChooseChild={() => nav.go('children')}
        />
      )}
      {screen === 'history' && (
        <HistoryView
          activeChild={activeChild}
          children={children}
          editions={editions}
          sessions={sessions}
          coverFor={coverFor}
          hasCoverPhoto={hasCoverPhoto}
        />
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenChildren={() => nav.go('children')}
        persistentStorage={persistentStorage}
      />
    </div>
  )
}
