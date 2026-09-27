import { loadImage, drawImageCover } from '../covers/canvasImage'

const WIDTH = 1000
const PADDING = 40
const HEADING_FONT = 34
const HEADING_HEIGHT = 100
const COVER_W = 64
const COVER_H = 96
const ROW_GAP = 18
const TEXT_ROW_HEIGHT = 56
const COVER_ROW_HEIGHT = COVER_H + ROW_GAP
const TITLE_LINE_HEIGHT = 34
const NOTES_LINE_HEIGHT = 30

export interface ListImageRow {
  title: string
  author?: string
  coverUrl?: string
  count: number
  notes: string[]
}

interface RenderOptions {
  showCovers: boolean
  showCounts: boolean
  showNotes: boolean
  accent?: string
}

// With a cover, a note (always one line — see below) comfortably fits below
// the title within the cover's own height, so showing one never grows the
// row; without a cover there's nothing to tuck it under, so the row grows.
function rowHeight(row: Pick<ListImageRow, 'notes'>, options: Pick<RenderOptions, 'showCovers' | 'showNotes'>): number {
  if (options.showCovers) return COVER_ROW_HEIGHT
  const hasNotes = options.showNotes && row.notes.length > 0
  return hasNotes ? TEXT_ROW_HEIGHT + NOTES_LINE_HEIGHT : TEXT_ROW_HEIGHT
}

// A list can be any length, so the canvas grows with its rows (and, per row,
// with whether it carries a notes line).
export function canvasHeight(rows: Array<Pick<ListImageRow, 'notes'>>, options: { showCovers: boolean; showNotes: boolean }): number {
  if (rows.length === 0) return HEADING_HEIGHT + TEXT_ROW_HEIGHT + PADDING
  return HEADING_HEIGHT + rows.reduce((sum, r) => sum + rowHeight(r, options), 0) + PADDING
}

/**
 * Returns how many distinct covers failed to load (both the direct fetch and
 * the CORS-proxy retry in canvasImage.ts) — 0 whenever every cover a row
 * actually had loaded, or covers weren't requested at all — so the caller
 * can tell the difference between "no cover was ever set for this book"
 * (expected, gets the placeholder) and "one was set but couldn't be fetched"
 * (worth a word to the parent, rather than a silently incomplete export).
 */
export async function renderListImage(
  canvas: HTMLCanvasElement,
  heading: string,
  rows: ListImageRow[],
  options: RenderOptions,
): Promise<{ failedCovers: number }> {
  canvas.width = WIDTH
  canvas.height = canvasHeight(rows, options)
  const ctx = canvas.getContext('2d')
  if (!ctx) return { failedCovers: 0 }

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#1a1a1a'
  ctx.font = `700 ${HEADING_FONT}px system-ui, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(heading, PADDING, PADDING + HEADING_FONT)

  if (rows.length === 0) {
    ctx.fillStyle = '#63625b'
    ctx.font = '400 24px system-ui, sans-serif'
    ctx.fillText('No readings logged for this selection.', PADDING, HEADING_HEIGHT + 30)
    return { failedCovers: 0 }
  }

  // Load each distinct cover once — a re-read would otherwise decode the same
  // picture again for every row.
  const images = new Map<string, HTMLImageElement | null>()
  let failedCovers = 0
  if (options.showCovers) {
    const uniqueUrls = Array.from(new Set(rows.map((r) => r.coverUrl).filter((u): u is string => !!u)))
    const loaded = await Promise.all(uniqueUrls.map(loadImage))
    uniqueUrls.forEach((url, i) => {
      images.set(url, loaded[i])
      if (!loaded[i]) failedCovers++
    })
  }

  let y = HEADING_HEIGHT
  for (const row of rows) {
    const hasNotes = options.showNotes && row.notes.length > 0
    const thisRowHeight = rowHeight(row, options)

    if (options.showCovers) {
      const img = row.coverUrl ? images.get(row.coverUrl) : null
      if (img) {
        drawImageCover(ctx, img, PADDING, y, COVER_W, COVER_H)
      } else {
        ctx.fillStyle = '#eeeae0'
        ctx.fillRect(PADDING, y, COVER_W, COVER_H)
      }
    }

    const textX = options.showCovers ? PADDING + COVER_W + 24 : PADDING
    const textMaxWidth = WIDTH - textX - PADDING - 80
    const textBlockHeight = hasNotes ? TITLE_LINE_HEIGHT + NOTES_LINE_HEIGHT : TITLE_LINE_HEIGHT
    // Centred against the cover's own height when there is one (so notes never
    // reach past its bottom edge), or the row's fixed height when there isn't.
    const textBlockTop = y + ((options.showCovers ? COVER_H : TEXT_ROW_HEIGHT) - textBlockHeight) / 2
    const titleCenter = textBlockTop + TITLE_LINE_HEIGHT / 2

    ctx.fillStyle = '#1a1a1a'
    ctx.font = '600 26px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const titleText = row.author ? `${row.title} — ${row.author}` : row.title
    ctx.fillText(titleText, textX, titleCenter, textMaxWidth)

    if (options.showCounts && row.count > 1) {
      ctx.fillStyle = options.accent ?? '#2c5f4f'
      ctx.font = '700 22px system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`×${row.count}`, WIDTH - PADDING, titleCenter)
    }

    if (hasNotes) {
      ctx.fillStyle = '#63625b'
      ctx.font = '400 20px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const notesCenter = textBlockTop + TITLE_LINE_HEIGHT + NOTES_LINE_HEIGHT / 2
      ctx.fillText(row.notes.join('; '), textX, notesCenter, textMaxWidth)
    }

    ctx.strokeStyle = '#e5e2d8'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PADDING, y + thisRowHeight - ROW_GAP / 2)
    ctx.lineTo(WIDTH - PADDING, y + thisRowHeight - ROW_GAP / 2)
    ctx.stroke()

    y += thisRowHeight
  }

  return { failedCovers }
}
