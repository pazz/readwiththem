import { useEffect, useRef, useState } from 'react'
import { guideRectInDisplay, displayRectToVideoRect, type Rect } from '../covers/cropGuide'
import { encodeCover } from '../covers/coverImage'

// Same camera lifecycle as BarcodeScanner (permission on demand, stream stopped
// the moment a photo is taken or the view closes), but takes one still frame
// instead of continuously decoding — for a book the catalogue has no cover for.
// A fixed guide rectangle (not live edge detection, which needs a large CV
// dependency like OpenCV.js) shows where to line the cover up; capture crops to
// just that region rather than the whole frame.
export function CoverCapture({ onCapture, onClose }: { onCapture: (blob: Blob) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [guide, setGuide] = useState<Rect | null>(null)

  const updateGuide = () => {
    const video = videoRef.current
    if (!video || !video.clientWidth || !video.clientHeight) return
    setGuide(guideRectInDisplay(video.clientWidth, video.clientHeight))
  }

  useEffect(() => {
    let stopped = false

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (stream) => {
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setReady(true)
        updateGuide()
      })
      .catch(() => setError('Camera access was denied or is unavailable.'))

    window.addEventListener('resize', updateGuide)
    return () => {
      stopped = true
      window.removeEventListener('resize', updateGuide)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const capture = async () => {
    const video = videoRef.current
    if (!video || !video.clientWidth || !video.clientHeight) return
    const displayRect = guideRectInDisplay(video.clientWidth, video.clientHeight)
    const videoRect = displayRectToVideoRect(displayRect, video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight)
    // Cover-sized whatever the camera resolution (see coverImage.ts), and
    // brightened, since these are mostly taken at bedtime in a dim room.
    const blob = await encodeCover(video, video.videoWidth, video.videoHeight, { crop: videoRect, normalise: true })
    if (!blob) return
    streamRef.current?.getTracks().forEach((t) => t.stop())
    onCapture(blob)
  }

  return (
    <div className="scanner">
      <div className="cover-capture-frame">
        <video
          ref={videoRef}
          muted
          playsInline
          className="scanner-video cover-capture-video"
          onLoadedMetadata={updateGuide}
        />
        {guide && !error && (
          <div className="cover-guide" style={{ left: guide.x, top: guide.y, width: guide.width, height: guide.height }} />
        )}
      </div>
      {error ? <p className="muted">{error}</p> : <p className="muted">Line the cover up inside the frame.</p>}
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        {!error && (
          <button type="button" className="submit-btn" onClick={capture} disabled={!ready}>
            📷 Capture
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
