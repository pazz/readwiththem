import assert from 'node:assert'
import { guideRectInDisplay, displayRectToVideoRect, GUIDE_ASPECT } from '../src/cropGuide.ts'

function approx(a, b, msg, eps = 1e-6) {
  assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} !== ${b}`)
}

// The guide must be centered and hold the book-cover aspect ratio, whichever
// dimension of the display box is the limiting one.
for (const [dw, dh] of [[400, 800], [800, 400], [390, 600]]) {
  const g = guideRectInDisplay(dw, dh)
  approx(g.width / g.height, GUIDE_ASPECT, `aspect ratio for ${dw}x${dh}`)
  approx(g.x, (dw - g.width) / 2, `centered horizontally for ${dw}x${dh}`)
  approx(g.y, (dh - g.height) / 2, `centered vertically for ${dh}x${dh}`)
  assert.ok(g.width <= dw && g.height <= dh, `guide must fit inside the display box for ${dw}x${dh}`)
}

// No cropping: display box already matches the video's native size 1:1.
// The guide rectangle should map back to itself exactly.
{
  const g = guideRectInDisplay(400, 600)
  const v = displayRectToVideoRect(g, 400, 600, 400, 600)
  approx(v.x, g.x, 'no-crop x')
  approx(v.y, g.y, 'no-crop y')
  approx(v.width, g.width, 'no-crop width')
  approx(v.height, g.height, 'no-crop height')
}

// A wider native video than the display box: object-fit: cover crops the
// video's left/right edges. A guide centered on screen should map to a region
// shifted right in native coordinates (past the cropped-off left strip) when
// the video is wider than tall relative to the display box, scaled down by
// the cover scale factor.
{
  const displayW = 400
  const displayH = 400
  const videoW = 800 // native video is twice as wide as the display box
  const videoH = 400
  const scale = Math.max(displayW / videoW, displayH / videoH) // = 1 (height-limited)
  const offsetX = (videoW * scale - displayW) / 2 // = 200: cropped off each side
  const guide = { x: 100, y: 50, width: 200, height: 300 }
  const v = displayRectToVideoRect(guide, videoW, videoH, displayW, displayH)
  approx(v.x, (guide.x + offsetX) / scale, 'cropped x maps through the offset')
  approx(v.y, guide.y / scale, 'y is unaffected when height is the limiting dimension')
  approx(v.width, guide.width / scale, 'width scales by the cover factor')
  // Sanity: the mapped rect must land within the native video bounds.
  assert.ok(v.x >= 0 && v.x + v.width <= videoW, 'mapped rect stays inside the native frame (x)')
  assert.ok(v.y >= 0 && v.y + v.height <= videoH, 'mapped rect stays inside the native frame (y)')
}

console.log('crop guide checks passed')
