import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Child, Edition, ReadingSession } from '../types'
import type { CoverLookup } from '../data/useLibrary'
import { sortReadings, summariseBooks, type BookOrder } from '../export/bookOrder'
import { booksToMarkdown } from '../export/exportText'
import { renderListImage } from '../export/listImage'
import { sessionsToCSV } from '../export/csv'
import { download, slugify } from '../lib/download'
import { readPref, writePref } from '../lib/prefs'
import { BookCover } from '../components/BookCover'

type ExportFormat = 'text' | 'image' | 'print' | 'csv'

const FORMATS: ReadonlyArray<[ExportFormat, string]> = [
  ['text', 'Text'],
  ['image', 'Image'],
  ['print', 'Print / PDF'],
  ['csv', 'Spreadsheet'],
]

const ORDERS: ReadonlyArray<[BookOrder, string]> = [
  ['recent', 'Last read'],
  ['count', 'Most read'],
  ['title', 'Title'],
]

// Remembered per device, like the active child.
function loadBookOrder(): BookOrder {
  const saved = readPref('bookOrder')
  return saved === 'count' || saved === 'title' ? saved : 'recent'
}

// Exports the given readings as copied text, a PNG list, a printout or a CSV.
export function ExportSheet({
  sessions,
  children,
  editions,
  coverFor,
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
  coverFor: CoverLookup
  titleLine: string
  childName: string | undefined
  accent: string
  rangeLabel: string
  onClose: () => void
  onExported: (message: string) => void
}) {
  const [format, setFormat] = useState<ExportFormat>('text')
  const [order, setOrder] = useState<BookOrder>(loadBookOrder)
  const [showCovers, setShowCovers] = useState(true)
  const [showNotes, setShowNotes] = useState(true)
  const [showCounts, setShowCounts] = useState(false)
  const [imageStatus, setImageStatus] = useState<'idle' | 'rendering' | 'error'>('idle')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const timer = useRef<number>()
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const chooseOrder = (value: BookOrder) => {
    setOrder(value)
    writePref('bookOrder', value)
  }

  const editionById = new Map(editions.map((e) => [e.id, e]))
  const titleOf = (id: string) => editionById.get(id)?.title ?? ''
  // Every format lists the books in the same order.
  const books = summariseBooks(sessions, titleOf, order).map(({ editionId, count, notes }) => {
    const edition = editionById.get(editionId)
    return { editionId, title: edition?.title ?? 'Unknown book', author: edition?.author, coverUrl: coverFor(edition), count, notes }
  })

  const heading = `${titleLine} — ${rangeLabel}`
  // e.g. "read-with-freya-september-2026", echoing the header's "Read with
  // Freya"; doubles as the print dialog's suggested filename.
  const fileBase = `read-with-${slugify(childName ?? 'them')}-${slugify(rangeLabel)}`

  const copyText = async () => {
    const markdown = booksToMarkdown(titleLine, rangeLabel, books, { showCounts, showNotes })
    window.clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(markdown)
      setCopyStatus('copied')
      // A brief, visible "Copied ✓" before the sheet closes: the clipboard
      // write is otherwise invisible.
      timer.current = window.setTimeout(onClose, 700)
    } catch (err) {
      console.error('clipboard copy failed', err)
      setCopyStatus('error')
      // Left open on failure, so there's something to read and retry.
      timer.current = window.setTimeout(() => setCopyStatus('idle'), 1800)
    }
  }

  const downloadImage = async () => {
    // Opened synchronously, before any await, so the browser still treats it
    // as a response to the click rather than a blocked pop-up. A tab showing
    // the finished image is the closest a web page can get to opening a file
    // it just saved.
    const preview = window.open('', '_blank')
    setImageStatus('rendering')
    try {
      const canvas = document.createElement('canvas')
      const { failedCovers } = await renderListImage(canvas, heading, books, { showCovers, showCounts, showNotes, accent })
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('canvas.toBlob returned null')
      const filename = `${fileBase}.png`
      download(filename, blob, 'image/png')
      if (preview) {
        const previewUrl = URL.createObjectURL(blob)
        preview.location.href = previewUrl
        // Freed once the tab has had time to load it, not straight away.
        window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000)
      }
      setImageStatus('idle')
      // A cover that had a URL but couldn't be fetched is worth saying, or the
      // export just looks quietly incomplete.
      onExported(
        failedCovers > 0
          ? `Saved ${filename} — ${failedCovers} cover${failedCovers === 1 ? '' : 's'} couldn't be fetched`
          : `Saved ${filename} to your downloads`,
      )
      onClose()
    } catch (err) {
      console.error('list image download failed', err)
      preview?.close()
      setImageStatus('error')
    }
  }

  const downloadCSV = () => {
    const filename = `${fileBase}.csv`
    download(filename, sessionsToCSV(sortReadings(sessions, titleOf, order), children, editions), 'text/csv')
    onExported(`Saved ${filename} to your downloads`)
    onClose()
  }

  const print = () => {
    // Chrome suggests document.title as the "Save as PDF" filename, so it is
    // swapped in for the print call. The sheet closes once the browser has
    // taken its print snapshot, since closing unmounts the print root.
    const previousTitle = document.title
    document.title = fileBase
    window.print()
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      document.title = previousTitle
      onClose()
    }, 300)
  }

  const run = { text: copyText, image: downloadImage, print, csv: downloadCSV }[format]

  const label = {
    text: copyStatus === 'copied' ? 'Copied ✓' : copyStatus === 'error' ? 'Copy failed — try again' : 'Copy text',
    image: imageStatus === 'rendering' ? 'Preparing…' : 'Download image',
    print: 'Print / save as PDF',
    csv: 'Download spreadsheet',
  }[format]

  return (
    <>
      <p className="muted export-summary">
        {titleLine} · {rangeLabel} · {books.length} book{books.length === 1 ? '' : 's'}
      </p>

      <span className="field-label">Format</span>
      <div className="format-grid" role="radiogroup" aria-label="Export format">
        {FORMATS.map(([value, text]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={format === value}
            className={format === value ? 'active' : ''}
            onClick={() => setFormat(value)}
          >
            {text}
          </button>
        ))}
      </div>

      <span className="field-label">Sort books by</span>
      <div className="segmented">
        {ORDERS.map(([value, text]) => (
          <button
            key={value}
            type="button"
            aria-pressed={order === value}
            className={order === value ? 'active' : ''}
            onClick={() => chooseOrder(value)}
          >
            {text}
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

      <button className="submit-btn export-submit" onClick={run} disabled={format === 'image' && imageStatus === 'rendering'}>
        {label}
      </button>
      {imageStatus === 'error' && format === 'image' && (
        <p className="muted">The image could not be generated — some covers may be unavailable.</p>
      )}

      {/* Printed from a direct child of <body> rather than from inside the modal:
          print CSS hides everything else outright (display: none, so no phantom
          blank pages), which a top-layer dialog would not survive. */}
      {createPortal(
        <div className="print-root">
          <div className="print-page">
            <h2>{heading}</h2>
            <ul className={`export-list${showCovers ? '' : ' plain'}`}>
              {books.map(({ editionId, title, author, coverUrl, count, notes }) => (
                <li key={editionId} className="export-list-row">
                  {showCovers && (
                    <span className="cover-with-count">
                      <BookCover src={coverUrl} title={title} size="sm" />
                      {showCounts && count > 1 && <span className="count-badge">×{count}</span>}
                    </span>
                  )}
                  <div className="export-list-text">
                    <strong>{title}</strong>
                    {author && <span className="muted"> — {author}</span>}
                    {showNotes && notes.length > 0 && <div className="export-list-notes">{notes.join('; ')}</div>}
                  </div>
                  {!showCovers && showCounts && count > 1 && <span className="count-inline">×{count}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
