import { encodeCover } from './coverImage'

// Shared by every canvas-based export (listImage.ts), and by storage.ts's
// local cover cache — both need real, readable pixel bytes from a URL that
// may not cooperate with CORS.

// A CORS-friendly mirror: some cover CDNs (Open Library's among them) don't
// send the Access-Control-Allow-Origin header a canvas export needs, even
// though the very same URL loads fine as a plain <img> elsewhere in the app.
// weserv.nl re-serves the image with that header added.
const CORS_PROXY = 'https://images.weserv.nl/?url='

const LOAD_TIMEOUT_MS = 10_000

// A genuinely unreachable host (as opposed to one that actively refuses the
// request) never fires onerror at all — <img> has no built-in timeout, so
// without one this hangs forever. That matters a lot here specifically: the
// cover cache's backfill (storage.ts) can fire off many of these at once, on
// every single load, for every book without a cached cover yet — on a flaky
// connection those would otherwise just pile up indefinitely, load after load.
function tryLoad(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    let settled = false
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(result)
    }
    const timer = window.setTimeout(() => finish(null), LOAD_TIMEOUT_MS)
    // Without this the canvas would be tainted and toBlob() would silently
    // return null for the whole export, so a failed load is skipped here
    // rather than poisoning everything else in it.
    img.crossOrigin = 'anonymous'
    img.onload = () => finish(img)
    img.onerror = () => finish(null)
    img.src = url
  })
}

/**
 * Tries the URL directly first — correct and proxy-free for any CDN that
 * does support CORS, and for a same-origin blob: URL (a parent-photographed
 * cover), which never needs a proxy and wouldn't reach one anyway. Only on
 * failure, for an actual http(s) URL, does it retry once through the proxy
 * above before giving up.
 */
export async function loadImage(url: string): Promise<HTMLImageElement | null> {
  const direct = await tryLoad(url)
  if (direct) return direct
  if (!/^https?:\/\//.test(url)) return null
  return tryLoad(CORS_PROXY + encodeURIComponent(url))
}

// Re-encodes a loaded image back into a Blob, via the same crossOrigin/proxy
// path as loadImage — the point is a Blob that's actually readable (not the
// zero-byte placeholder a no-cors fetch would give for an uncooperative CDN),
// suitable for storing locally, at cover size (see coverImage.ts). Catalogue
// covers are professionally lit, so no brightening. Returns null wherever
// loadImage would.
export async function fetchImageBlob(url: string): Promise<Blob | null> {
  const img = await loadImage(url)
  if (!img) return null
  return encodeCover(img, img.naturalWidth, img.naturalHeight)
}

// Draws `img` into the (x, y, w, h) box, scaled and centre-cropped to fill it
// completely — equivalent to CSS `object-fit: cover`.
export function drawImageCover(
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
