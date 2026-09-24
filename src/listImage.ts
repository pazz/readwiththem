import { loadImage, drawImageCover } from './canvasImage'

const WIDTH = 1000
const PADDING = 40
const HEADING_FONT = 34
const HEADING_HEIGHT = 100
const COVER_W = 64
const COVER_H = 96
const ROW_GAP = 18
const TEXT_ROW_HEIGHT = 56
const COVER_ROW_HEIGHT = COVER_H + ROW_GAP

export interface ListImageRow {
  title: string
  author?: string
  coverUrl?: string
  count: number
}

/**
 * There is no fixed page to fill here — a list can be any length, so the
 * canvas height just grows with the row count rather than being clamped to
 * one A4 sheet.
 */
export function canvasHeight(rowCount: number, showCovers: boolean): number {
  const rowHeight = showCovers ? COVER_ROW_HEIGHT : TEXT_ROW_HEIGHT
  return HEADING_HEIGHT + Math.max(rowCount, 1) * rowHeight + PADDING
}

export async function renderListImage(
  canvas: HTMLCanvasElement,
  heading: string,
  rows: ListImageRow[],
  options: { showCovers: boolean; showCounts: boolean },
): Promise<void> {
  const rowHeight = options.showCovers ? COVER_ROW_HEIGHT : TEXT_ROW_HEIGHT
  canvas.width = WIDTH
  canvas.height = canvasHeight(rows.length, options.showCovers)
  const ctx = canvas.getContext('2d')
  if (!ctx) return

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
    return
  }

  // Load each distinct cover once — a re-read would otherwise decode the same
  // picture again for every row.
  const images = new Map<string, HTMLImageElement | null>()
  if (options.showCovers) {
    const uniqueUrls = Array.from(new Set(rows.map((r) => r.coverUrl).filter((u): u is string => !!u)))
    const loaded = await Promise.all(uniqueUrls.map(loadImage))
    uniqueUrls.forEach((url, i) => images.set(url, loaded[i]))
  }

  let y = HEADING_HEIGHT
  for (const row of rows) {
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
    const rowCenter = y + rowHeight / 2 - (options.showCovers ? ROW_GAP / 2 : 0)

    ctx.fillStyle = '#1a1a1a'
    ctx.font = '600 26px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const titleText = row.author ? `${row.title} — ${row.author}` : row.title
    ctx.fillText(titleText, textX, rowCenter, textMaxWidth)

    if (options.showCounts && row.count > 1) {
      ctx.fillStyle = '#2c5f4f'
      ctx.font = '700 22px system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`×${row.count}`, WIDTH - PADDING, rowCenter)
    }

    ctx.strokeStyle = '#e5e2d8'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PADDING, y + rowHeight - ROW_GAP / 2)
    ctx.lineTo(WIDTH - PADDING, y + rowHeight - ROW_GAP / 2)
    ctx.stroke()

    y += rowHeight
  }
}
