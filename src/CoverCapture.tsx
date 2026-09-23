import { useEffect, useRef, useState } from 'react'

// Same camera lifecycle as BarcodeScanner (permission on demand, stream stopped
// the moment a photo is taken or the view closes), but takes one still frame
// instead of continuously decoding — for a book the catalogue has no cover for.
export function CoverCapture({ onCapture, onClose }: { onCapture: (blob: Blob) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

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
      })
      .catch(() => setError('Camera access was denied or is unavailable.'))

    return () => {
      stopped = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const capture = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        streamRef.current?.getTracks().forEach((t) => t.stop())
        onCapture(blob)
      },
      'image/jpeg',
      0.85,
    )
  }

  return (
    <div className="scanner">
      <video ref={videoRef} muted playsInline className="scanner-video" />
      {error && <p className="muted">{error}</p>}
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        {!error && (
          <button type="button" className="submit-btn" onClick={capture} disabled={!ready}>
            📷 Capture
          </button>
        )}
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
