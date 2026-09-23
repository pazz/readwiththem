// The Shape Detection API isn't in TypeScript's bundled DOM lib yet, despite
// shipping in Chrome/Android. Minimal ambient types for just what we use.
interface DetectedBarcode {
  rawValue: string
}

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] })
  static getSupportedFormats(): Promise<string[]>
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector
}
