// The unobtrusive "who made this" line, on the welcome screen and in Settings.
export function AboutFooter() {
  return (
    <p className="muted about-footer">
      © 2026 Patrick Totzke ·{' '}
      <a href="https://ko-fi.com/patricktotzke" target="_blank" rel="noopener noreferrer" className="kofi-link">
        <img src="https://storage.ko-fi.com/cdn/brandasset/v2/kofi_symbol.png" alt="" aria-hidden="true" /> Buy me a
        coffee
      </a>
    </p>
  )
}
