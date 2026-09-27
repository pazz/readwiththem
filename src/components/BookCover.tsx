import { useState } from 'react'
import './BookCover.css'

// A cover image, or the title on a plain tile when there is none or it fails to load.
export function BookCover({ src, title, size }: { src: string | undefined; title: string; size: 'sm' | 'lg' }) {
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
