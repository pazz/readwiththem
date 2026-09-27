// Content as a named file, for download or the share sheet. A UTF-8 BOM goes
// in front of the plain-text formats that naive tools open (Excel on a CSV,
// some editors on Markdown): without it they guess the system codepage and
// mangle every non-ASCII character.
export function fileFor(filename: string, content: string | Blob, mime: string): File {
  const needsBom = typeof content === 'string' && (mime.startsWith('text/csv') || mime.startsWith('text/markdown'))
  return new File([needsBom ? '\uFEFF' + content : content], filename, { type: mime })
}

// Saves content as a file through a temporary link, the only way a web page can.
export function download(filename: string, content: string | Blob, mime: string) {
  const url = URL.createObjectURL(fileFor(filename, content, mime))
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

// Opens the print dialog with `filename` as the suggested "Save as PDF" name:
// Chrome takes it from document.title, so the title is swapped in briefly.
export function printAs(filename: string) {
  const previousTitle = document.title
  document.title = filename
  window.print()
  window.setTimeout(() => (document.title = previousTitle), 300)
}
