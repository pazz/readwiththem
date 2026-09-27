// Saves content as a file through a temporary link, the only way a web page can.
export function download(filename: string, content: string | Blob, mime: string) {
  // A UTF-8 BOM for the plain-text formats that naive tools open (Excel on a
  // CSV, some editors on Markdown): without it they guess the system codepage
  // and mangle every non-ASCII character. The Blob's `type` is lost once the
  // file is on disk; only the bytes and the extension remain.
  const needsBom = typeof content === 'string' && (mime.startsWith('text/csv') || mime.startsWith('text/markdown'))
  const body = needsBom ? '﻿' + content : content
  const blob = body instanceof Blob ? body : new Blob([body], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// "Freya" / "September 2026" -> "freya" / "september-2026", for filenames.
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
