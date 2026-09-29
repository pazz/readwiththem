import { LanguageBadge } from '../../components/LanguageBadge'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Child, Edition, ReadingSession } from '../../types'
import type { CoverLookup } from '../../data/useLibrary'
import { sortReadings, summariseBooks, type BookOrder } from '../../export/bookOrder'
import { booksToMarkdown } from '../../export/exportText'
import { renderListImage } from '../../export/listImage'
import { sessionsToCSV } from '../../export/csv'
import { download, fileFor, printAs, slugify } from '../../lib/download'
import { usePref, type ExportFormat, type ExportOptions } from '../../lib/prefs'
import { BookCover } from '../../components/BookCover'
import { Segmented } from '../../components/Segmented'
import './ExportSheet.css'

const FORMATS: ReadonlyArray<[ExportFormat, string]> = [
  ['text', 'Text'],
  ['image', 'Image'],
  ['print', 'Print / PDF'],
  ['csv', 'Spreadsheet'],
]

const ORDERS: ReadonlyArray<readonly [BookOrder, string]> = [
  ['recent', 'Last read'],
  ['count', 'Most read'],
  ['title', 'Title'],
]

// The system share sheet, where the device has one (phones, mostly).
const canShareText = typeof navigator.share === 'function'
const canShareFile = (name: string, type: string) => canShareText && !!navigator.canShare?.({ files: [new File([], name, { type })] })
const canShareImage = canShareFile('list.png', 'image/png')
const canShareCSV = canShareFile('list.csv', 'text/csv')

const isCancelled = (err: unknown) => err instanceof DOMException && err.name === 'AbortError'

// Exports the given readings as copied text, a PNG list, a printout or a CSV.
// The chosen format, order and options are remembered on this device.
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
  const [order, setOrder] = usePref('bookOrder')
  const [options, setOptions] = usePref('exportOptions')
  const { format, showCovers, showNotes, showCounts } = options
  const setOption = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => setOptions({ ...options, [key]: value })
  const [imageStatus, setImageStatus] = useState<'idle' | 'rendering' | 'error'>('idle')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const timer = useRef<number>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const editionById = new Map(editions.map((e) => [e.id, e]))
  const titleOf = (id: string) => editionById.get(id)?.title ?? ''
  // Every format lists the books in the same order.
  const books = summariseBooks(sessions, titleOf, order).map(({ editionId, count, notes }) => {
    const edition = editionById.get(editionId)
    return {
      editionId,
      title: edition?.title ?? 'Unknown book',
      author: edition?.author,
      language: edition?.language,
      coverUrl: coverFor(edition),
      count,
      notes,
    }
  })

  // Naming each book's language only earns its place when the list mixes
  // languages; until the person says otherwise, it follows the selection.
  const [languageChoice, setLanguageChoice] = useState<boolean>()
  const languagesInList = new Set(books.map((b) => b.language).filter(Boolean))
  const showLanguage = languageChoice ?? languagesInList.size > 1
  const listed = books.map((b) => (showLanguage ? b : { ...b, language: undefined }))

  const heading = `${titleLine} — ${rangeLabel}`
  // e.g. "read-with-freya-september-2026", echoing the header's "Read with
  // Freya"; doubles as the print dialog's suggested filename.
  const fileBase = `read-with-${slugify(childName ?? 'them')}-${slugify(rangeLabel)}`

  const markdown = () => booksToMarkdown(titleLine, rangeLabel, listed, { showCounts, showNotes })

  const renderImage = async () => {
    const canvas = document.createElement('canvas')
    const { failedCovers } = await renderListImage(canvas, heading, listed, { showCovers, showCounts, showNotes, accent })
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('canvas.toBlob returned null')
    return { blob, failedCovers }
  }

  const copyText = async () => {
    const text = markdown()
    window.clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(text)
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
      const { blob, failedCovers } = await renderImage()
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

  const csv = () => sessionsToCSV(sortReadings(sessions, titleOf, order), children, editions)

  const downloadCSV = () => {
    const filename = `${fileBase}.csv`
    download(filename, csv(), 'text/csv')
    onExported(`Saved ${filename} to your downloads`)
    onClose()
  }

  const print = () => {
    printAs(fileBase)
    // Closing unmounts the print root, so not before the browser has taken
    // its print snapshot.
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(onClose, 300)
  }

  const share = async () => {
    try {
      if (format === 'image') {
        setImageStatus('rendering')
        const { blob } = await renderImage()
        setImageStatus('idle')
        await navigator.share({ title: heading, files: [fileFor(`${fileBase}.png`, blob, 'image/png')] })
      } else if (format === 'csv') {
        await navigator.share({ title: heading, files: [fileFor(`${fileBase}.csv`, csv(), 'text/csv')] })
      } else {
        await navigator.share({ title: heading, text: markdown() })
      }
      onClose()
    } catch (err) {
      setImageStatus('idle')
      if (!isCancelled(err)) console.error('share failed', err)
    }
  }
  const shareable = { text: canShareText, image: canShareImage, csv: canShareCSV, print: false }[format]

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
            onClick={() => setOption('format', value)}
          >
            {text}
          </button>
        ))}
      </div>

      <span className="field-label" id="export-order-label">
        Sort books by
      </span>
      <Segmented labelledBy="export-order-label" value={order} onChange={setOrder} options={ORDERS} />

      {(format === 'image' || format === 'print') && (
        <label className="checkbox-row">
          <input type="checkbox" checked={showCovers} onChange={(e) => setOption('showCovers', e.target.checked)} />
          Include cover images
        </label>
      )}
      {format !== 'csv' && (
        <label className="checkbox-row">
          <input type="checkbox" checked={showNotes} onChange={(e) => setOption('showNotes', e.target.checked)} />
          Include reading notes
        </label>
      )}
      {format !== 'csv' && (
        <label className="checkbox-row">
          <input type="checkbox" checked={showCounts} onChange={(e) => setOption('showCounts', e.target.checked)} />
          Include how often each book was read
        </label>
      )}

      {format !== 'csv' && (
        <label className="checkbox-row">
          <input type="checkbox" checked={showLanguage} onChange={(e) => setLanguageChoice(e.target.checked)} />
          Include each book's language
        </label>
      )}

      <button className="submit-btn export-submit" onClick={run} disabled={format === 'image' && imageStatus === 'rendering'}>
        {label}
      </button>
      {shareable && (
        <button type="button" className="btn-secondary export-share" onClick={share} disabled={imageStatus === 'rendering'}>
          Share…
        </button>
      )}
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
              {listed.map(({ editionId, title, author, language, coverUrl, count, notes }) => (
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
                    <LanguageBadge code={language} />
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
