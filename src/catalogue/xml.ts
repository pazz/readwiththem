// Just enough XML reading for the two catalogue formats we fetch (MARC21 slim
// and Dublin Core over SRU): flat, regular and machine-written, so a few
// regular expressions do, and the same code runs in the browser and in tests.
// Namespace prefixes differ between libraries, so they are ignored.

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole
  })
}

export interface Element {
  attrs: string
  inner: string
}

/** Every `<name …>…</name>` in the text, whatever its namespace prefix. */
export function elements(xml: string, name: string): Element[] {
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${name}\\b([^>]*?)(?<!/)>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, 'g')
  return Array.from(xml.matchAll(pattern), (m) => ({ attrs: m[1], inner: m[2] }))
}

export function text(element: Element | undefined): string | undefined {
  if (!element) return undefined
  const value = decodeEntities(element.inner.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
  return value || undefined
}

/** The content exactly as written, for fixed-position fields where every space counts. */
export function rawText(element: Element | undefined): string | undefined {
  return element && decodeEntities(element.inner)
}

export function attribute(element: Element, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(element.attrs)?.[1]
}
