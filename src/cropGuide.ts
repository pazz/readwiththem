export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// Typical book cover proportions (width:height), used for the on-screen guide
// and the captured photo's output size.
export const GUIDE_ASPECT = 2 / 3

const MARGIN_RATIO = 0.86

/**
 * The guide rectangle in *display* coordinates (CSS pixels, matching how the
 * video element is actually rendered) — centered, book-cover proportioned,
 * filling most of the frame with a small margin on the limiting dimension.
 */
export function guideRectInDisplay(displayWidth: number, displayHeight: number): Rect {
  const displayAspect = displayWidth / displayHeight
  let width: number
  let height: number
  if (displayAspect > GUIDE_ASPECT) {
    height = displayHeight * MARGIN_RATIO
    width = height * GUIDE_ASPECT
  } else {
    width = displayWidth * MARGIN_RATIO
    height = width / GUIDE_ASPECT
  }
  return { x: (displayWidth - width) / 2, y: (displayHeight - height) / 2, width, height }
}

/**
 * `object-fit: cover` scales the video to fill the display box uniformly,
 * cropping whichever dimension overflows, centered. This maps a rectangle in
 * *display* coordinates back to the video's *native pixel* coordinates, so a
 * capture can crop to what the guide rectangle actually shows on screen —
 * not to the full native frame, which is cropped differently by the browser
 * before it's ever drawn.
 */
export function displayRectToVideoRect(
  rect: Rect,
  videoWidth: number,
  videoHeight: number,
  displayWidth: number,
  displayHeight: number,
): Rect {
  const scale = Math.max(displayWidth / videoWidth, displayHeight / videoHeight)
  const offsetX = (videoWidth * scale - displayWidth) / 2
  const offsetY = (videoHeight * scale - displayHeight) / 2
  return {
    x: (rect.x + offsetX) / scale,
    y: (rect.y + offsetY) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  }
}
