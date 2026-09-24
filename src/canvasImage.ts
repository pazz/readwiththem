// Shared by every canvas-based export (currently just listImage.ts).

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    // Without this the canvas would be tainted and toBlob() would throw, so an
    // image the CDN won't serve cross-origin is skipped rather than poisoning
    // the whole export.
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
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
