import { useInstallPrompt } from '../lib/install'
import { AboutFooter } from '../components/AboutFooter'

// First run in a browser tab: explains the app and how to install it.
export function WelcomeView({ onContinue }: { onContinue: () => void }) {
  const { canPrompt, installed, install } = useInstallPrompt()

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
