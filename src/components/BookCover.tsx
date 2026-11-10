import { useState } from 'react'
import './BookCover.css'

// A cover image or, when there is none or it fails to load, a drawn cover: a
// paper board in the child's colour with the title set on it, and a spine.
// A small one has room for the first letter only.
export function BookCover({ src, title, size }: { src: string | undefined; title: string; size: 'sm' | 'lg' }) {
  const [failed, setFailed] = useState(false)
  const sizeClass = size === 'sm' ? 'cover-sm' : 'cover-lg'
  if (!src || failed) {
    return (
      <div className={`cover-placeholder ${sizeClass}`} role="img" aria-label={title}>
        <span aria-hidden="true">{size === 'sm' ? Array.from(title.trim())[0]?.toUpperCase() : title}</span>
      </div>
    )
  }
  return <img src={src} alt={title} className={sizeClass} onError={() => setFailed(true)} />
}
