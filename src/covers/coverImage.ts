// Sizing and tone for every cover image the app stores: parent photos and the
// local cache of catalogue covers.
//
// The largest a cover is ever shown is the "read again" grid tile, 84×126 CSS
// px, which on a 3× phone screen is 252×378 device pixels. On paper a cover is
// 32×48 CSS px, about 8.5×12.7 mm on A4, which needs only ~100×150 px even at
// 300 dpi; the PNG export draws covers at 64×96. So 240×360 covers every use
// (a 3× phone tile is within 5% of it) at roughly 15–30 KB as JPEG, against the
// 100–200 KB a full-resolution camera crop or re-encoded PNG would cost, in
// the cache and in every backup.
export const COVER_MAX_WIDTH = 240
export const COVER_MAX_HEIGHT = 360
const JPEG_QUALITY = 0.8

// Anything stored before these limits existed and still above this is worth
// re-encoding; at 240×360 a JPEG stays well under it.
export const OVERSIZED_BYTES = 60_000

// Scales (w, h) down to fit inside the limits, keeping the aspect ratio. Never
// scales up: a small catalogue thumbnail gains nothing from being enlarged.
export function fitWithin(w: number, h: number, maxW = COVER_MAX_WIDTH, maxH = COVER_MAX_HEIGHT): { width: number; height: number } {
  const scale = Math.min(1, maxW / w, maxH / h)
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

const MAX_GAIN = 3
const TARGET_MEAN = 0.45

/**
 * Lifts a photo taken in a dim room, in place, on RGBA pixel data. Two steps:
 * a levels stretch so the darkest and brightest 1% of channel values reach black and
 * white (capped at 3× gain, so a nearly black frame turns grainy rather than
 * into noise), then a gamma lift if the result is still darker than a typical
 * cover. It only ever brightens. The same curve is applied to all three
 * channels, which keeps colours in proportion rather than washing them out,
 * and a photo that is already well exposed passes through almost unchanged.
 */
export function normaliseBrightness(data: Uint8ClampedArray): void {
  const pixels = data.length / 4
  if (pixels === 0) return
  // Levels come from the channel values themselves, not luminance: a photo
  // whose red or blue already reaches 255 has no headroom to stretch into,
  // however dark its luminance looks.
  const channels = new Uint32Array(256)
  const luma = new Uint32Array(256)
  for (let i = 0; i < data.length; i += 4) {
    channels[data[i]]++
    channels[data[i + 1]]++
    channels[data[i + 2]]++
    luma[Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])]++
  }
  const percentile = (p: number) => {
    const target = pixels * 3 * p
    let seen = 0
    for (let v = 0; v < 256; v++) {
      seen += channels[v]
      if (seen >= target) return v
    }
    return 255
  }
  const lo = percentile(0.01)
  const hi = percentile(0.99)
  const gain = hi > lo ? Math.min(MAX_GAIN, 255 / (hi - lo)) : 1

  // Mean luminance after the stretch decides the gamma.
  let sum = 0
  for (let v = 0; v < 256; v++) sum += luma[v] * Math.min(255, Math.max(0, (v - lo) * gain))
  const mean = sum / pixels / 255
  const gamma = mean > 0 && mean < TARGET_MEAN ? Math.max(0.5, Math.log(TARGET_MEAN) / Math.log(mean)) : 1

  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    const stretched = Math.min(1, Math.max(0, ((v - lo) * gain) / 255))
    // Never darker than the original, whatever the stretch did to its shadows.
    lut[v] = Math.max(v, Math.round(255 * stretched ** gamma))
  }
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]]
    data[i + 1] = lut[data[i + 1]]
    data[i + 2] = lut[data[i + 2]]
  }
}

/**
 * Draws a region of `source` into a cover-sized canvas and returns it as a
 * JPEG, optionally brightened. `crop` defaults to the whole source.
 */
export function encodeCover(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  options: { crop?: { x: number; y: number; width: number; height: number }; normalise?: boolean } = {},
): Promise<Blob | null> {
  const crop = options.crop ?? { x: 0, y: 0, width: sourceWidth, height: sourceHeight }
  const { width, height } = fitWithin(crop.width, crop.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height)
  if (options.normalise) {
    const image = ctx.getImageData(0, 0, width, height)
    normaliseBrightness(image.data)
    ctx.putImageData(image, 0, 0)
  }
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
}

// Re-encodes a stored cover that predates the size limits. No brightening:
// the parent has already seen and accepted how it looks.
export async function shrinkCover(blob: Blob): Promise<Blob | null> {
  const bitmap = await createImageBitmap(blob)
  try {
    return await encodeCover(bitmap, bitmap.width, bitmap.height)
  } finally {
    bitmap.close()
  }
}
