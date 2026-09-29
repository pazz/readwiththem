import { languageName } from '../catalogue/language'
import './LanguageBadge.css'

// A book's language as a small code ("DE"), with the full name on hover.
// Nothing at all when the language isn't known.
export function LanguageBadge({ code }: { code: string | undefined }) {
  if (!code) return null
  return (
    <abbr className="lang-badge" title={languageName(code)}>
      {code.toUpperCase()}
    </abbr>
  )
}
