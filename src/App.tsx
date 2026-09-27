import { useEffect, useState } from 'react'
import * as storage from './data/storage'
import { useLibrary } from './data/useLibrary'
import { applyTheme } from './theme'
import { isInstalled } from './lib/install'
import { readPref, writePref } from './lib/prefs'
import { WelcomeView } from './views/WelcomeView'
import { ChildrenView } from './views/ChildrenView'
import { LogView } from './views/LogView'
import { HistoryView } from './views/HistoryView'
import { SettingsPanel } from './views/SettingsPanel'

type Tab = 'welcome' | 'children' | 'log' | 'history'

export default function App() {
  const { children, editions, sessions, coverFor, reload, slowLoad, loadError, retry } = useLibrary()
  const [activeChildId, setActiveChildId] = useState(() => readPref('activeChildId') ?? '')
  const [tab, setTab] = useState<Tab>(() => (readPref('activeChildId') ? 'log' : isInstalled() ? 'children' : 'welcome'))
  // The child picker is reached from Settings on either tab; picking a child
  // returns to whichever tab you came from.
  const [returnTab, setReturnTab] = useState<'log' | 'history'>('log')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const rememberChild = (id: string) => {
    setActiveChildId(id)
    writePref('activeChildId', id)
  }

  // Whenever there are children, one of them is active: the remembered one, or
  // else the first (none chosen yet, or the remembered one was removed).
  const activeChild = children.find((c) => c.id === activeChildId) ?? children[0]
  useEffect(() => {
    if (children.length === 0) return
    // Someone with children has been here before: skip the welcome.
    setTab((t) => (t === 'welcome' ? 'children' : t))
    if (activeChild.id !== activeChildId) rememberChild(activeChild.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children])

  useEffect(() => applyTheme(activeChild?.colour), [activeChild?.colour])

  const openChildren = () => {
    if (tab === 'log' || tab === 'history') setReturnTab(tab)
    setTab('children')
  }

  const chooseChild = (id: string) => {
    rememberChild(id)
    setTab(returnTab)
  }

  return (
    <div className="app">
      <header className="app-header">
        {/* Lowercase "with": a greeting, not the app's proper name. */}
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
          <button type="button" className="submit-btn" onClick={retry}>
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

      {tab === 'welcome' ? (
        <WelcomeView onContinue={() => setTab('children')} />
      ) : (
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
          activeChildId={activeChild?.id}
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
            if (id === activeChild?.id) {
              setActiveChildId('')
              writePref('activeChildId', null)
            }
            await reload()
          }}
        />
      )}
      {tab === 'log' && (
        <LogView
          activeChild={activeChild}
          editions={editions}
          sessions={sessions}
          coverFor={coverFor}
          onChange={reload}
          onChooseChild={openChildren}
        />
      )}
      {tab === 'history' && (
        <HistoryView
          activeChild={activeChild}
          children={children}
          editions={editions}
          sessions={sessions}
          coverFor={coverFor}
          onDelete={async (id) => {
            await storage.deleteSession(id)
            await reload()
          }}
        />
      )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} onOpenChildren={openChildren} />
    </div>
  )
}
