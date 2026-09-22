// The poster is rendered to a canvas rather than laid out in CSS for print.
// Print CSS cannot reliably guarantee "exactly one page": vh units don't resolve
// to paper height, auto-fill column counts resolve against the screen width, and
// Android's system print pipeline adds its own variance. Drawing to a fixed A4
// canvas makes the one-page constraint true by construction.

// A4 at ~150dpi: sharp enough to print, small enough to share.
export const POSTER_WIDTH = 1240
export const POSTER_HEIGHT = 1754

const IDEAL_TILE_ASPECT = 2 / 3 // a typical book cover

/**
 * Pick the grid that tiles the whole page with no gaps or overlap, preferring
 * tiles shaped like book covers and as few repeated covers as possible.
 */
export function chooseGrid(count: number): { cols: number; rows: number } {
  if (count < 1) return { cols: 1, rows: 1 }
  let best = { cols: 1, rows: count }
  let bestScore = Infinity
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols)
    const tileAspect = POSTER_WIDTH / cols / (POSTER_HEIGHT / rows)
    const shapePenalty = Math.abs(Math.log(tileAspect / IDEAL_TILE_ASPECT))
    const repeatPenalty = (cols * rows - count) / count
    const score = shapePenalty + repeatPenalty
    if (score < bestScore) {
      bestScore = score
      best = { cols, rows }
    }
  }
  return best
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    // Without this the canvas would be tainted and toBlob() would throw, so a
    // cover the CDN won't serve cross-origin is skipped rather than poisoning
    // the whole export.
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function drawCoverFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}

function drawDateBadge(ctx: CanvasRenderingContext2D, label: string) {
  const fontSize = Math.round(POSTER_WIDTH * 0.028)
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const padX = fontSize * 0.95
  const padY = fontSize * 0.55
  const boxW = ctx.measureText(label).width + padX * 2
  const boxH = fontSize + padY * 2
  const boxX = (POSTER_WIDTH - boxW) / 2
  const boxY = POSTER_HEIGHT - boxH - fontSize * 1.4

  ctx.fillStyle = 'rgba(18, 18, 14, 0.74)'
  ctx.beginPath()
  if (ctx.roundRect) {
    ctx.roundRect(boxX, boxY, boxW, boxH, boxH / 2)
  } else {
    ctx.rect(boxX, boxY, boxW, boxH)
  }
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.fillText(label, POSTER_WIDTH / 2, boxY + boxH / 2)
}

/**
 * Draw one tile per entry, cycling through them to fill every cell so the page
 * is covered edge to edge. Entries without a usable cover get a tinted panel so
 * the result still reads as a pattern rather than a hole.
 */
export async function renderPoster(
  canvas: HTMLCanvasElement,
  coverUrls: Array<string | undefined>,
  label: string,
): Promise<void> {
  canvas.width = POSTER_WIDTH
  canvas.height = POSTER_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#2c5f4f'
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)
  if (coverUrls.length === 0) return

  const images = await Promise.all(coverUrls.map((url) => (url ? loadImage(url) : Promise.resolve(null))))

  const { cols, rows } = chooseGrid(coverUrls.length)
  const tileW = POSTER_WIDTH / cols
  const tileH = POSTER_HEIGHT / rows

  for (let cell = 0; cell < cols * rows; cell++) {
    const col = cell % cols
    const row = Math.floor(cell / cols)
    // Ceil the edges so neighbouring tiles overlap by a sub-pixel rather than
    // leaving hairline gaps from floating-point rounding.
    const x = Math.floor(col * tileW)
    const y = Math.floor(row * tileH)
    const w = Math.ceil(tileW) + 1
    const h = Math.ceil(tileH) + 1

    const img = images[cell % images.length]
    if (img) {
      drawCoverFit(ctx, img, x, y, w, h)
    } else {
      ctx.fillStyle = cell % 2 === 0 ? '#2c5f4f' : '#35705e'
      ctx.fillRect(x, y, w, h)
    }
  }

  drawDateBadge(ctx, label)
}
