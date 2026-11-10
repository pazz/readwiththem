import { ArrowLeftRight, BookOpen, History, Settings } from 'lucide-react'
import { ICON } from './components/icon'
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

  // The next child in the list, wrapping round to the first.
  const switchChild = () => {
    const next = children[(children.findIndex((c) => c.id === activeChild?.id) + 1) % children.length]
    setChosenChildId(next.id)
    writePref('activeChildId', next.id)
  }

  return (
    <div className="app">
      <header className="app-header">
        {/* Lowercase "with": a greeting, not the app's proper name. */}
        <h1>{activeChild ? `Read with ${activeChild.name}` : 'Read with Them'}</h1>
        <div className="header-actions">
          {children.length > 1 && (
            <button type="button" className="icon-btn" aria-label="Switch child" onClick={switchChild}>
              <ArrowLeftRight {...ICON} size={20} />
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <Settings {...ICON} size={20} />
          </button>
        </div>
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
            <BookOpen {...ICON} size={20} className="nav-icon" />
            Log
          </button>
          <button aria-current={screen === 'history'} onClick={() => nav.go('history')}>
            <History {...ICON} size={20} className="nav-icon" />
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
