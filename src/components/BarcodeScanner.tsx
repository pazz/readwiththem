import { useEffect, useRef, useState } from 'react'
import { isValidISBN13 } from '../catalogue/isbn'

// BarcodeDetector is a native browser API (Chrome/Android) — used directly where
// available. @zxing/browser is only imported as a fallback for browsers without it
// (Safari), so browsers with native support never pay for the extra bundle weight.
export function BarcodeScanner({ onDetect, onClose }: { onDetect: (isbn: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let stopZxing: (() => void) | null = null
    let rafId: number | null = null

    const finish = (isbn: string) => {
      if (stopped) return
      stopped = true
      stopZxing?.()
      if (rafId !== null) cancelAnimationFrame(rafId)
      stream?.getTracks().forEach((t) => t.stop())
      onDetect(isbn)
    }

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      } catch {
        setError('Camera access was denied or is unavailable — use search or add the book manually instead.')
        return
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()

      if (window.BarcodeDetector) {
        const supported = await BarcodeDetector.getSupportedFormats()
        const detector = new BarcodeDetector({ formats: supported.includes('ean_13') ? ['ean_13'] : undefined })
        const tick = async () => {
          if (stopped) return
          try {
            const codes = await detector.detect(video)
            const isbn = codes.map((c) => c.rawValue).find(isValidISBN13)
            if (isbn) {
              finish(isbn)
              return
            }
          } catch {
            // transient per-frame decode failures are expected; keep scanning
          }
          rafId = requestAnimationFrame(tick)
        }
        rafId = requestAnimationFrame(tick)
      } else {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ])
        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13])
        const reader = new BrowserMultiFormatReader(hints)
        const controls = await reader.decodeFromStream(stream, video, (result) => {
          const text = result?.getText()
          if (text && isValidISBN13(text)) finish(text)
        })
        stopZxing = () => controls.stop()
      }
    }

    start()

    return () => {
      stopped = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      stopZxing?.()
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="scanner">
      <button type="button" className="back-btn" onClick={onClose}>
        <span aria-hidden="true">←</span> Back
      </button>
      <video ref={videoRef} muted playsInline className="scanner-video" />
      {error && <p className="muted">{error}</p>}
    </div>
  )
}
