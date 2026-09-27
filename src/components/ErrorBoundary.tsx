import { Component, type ErrorInfo, type ReactNode } from 'react'
import { downloadBackup } from '../data/downloadBackup'

// Catches a rendering error anywhere below it, so a bug shows a way out, and a
// way to save the data, rather than a blank screen.
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('render failed', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="app">
        <div className="card empty-state" role="alert">
          <p>Something went wrong. Your readings are still saved in this browser.</p>
          <button type="button" className="submit-btn" onClick={() => window.location.replace(window.location.pathname)}>
            Reload the app
          </button>
          <p>
            <button type="button" className="link-btn" onClick={downloadBackup}>
              Download a backup first
            </button>
          </p>
        </div>
      </div>
    )
  }
}
