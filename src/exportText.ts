export interface MarkdownRow {
  title: string
  author?: string
  notes: string[]
  count: number
}

/**
 * Deliberately text-only — no cover images. A locally photographed cover only
 * exists as a session-scoped blob: URL, which would be a dead link the moment
 * this file is reopened elsewhere, and even a real http(s) cover URL adds
 * nothing a plain reading list needs.
 */
export function booksToMarkdown(
  title: string,
  periodLabel: string,
  rows: MarkdownRow[],
  options: { showCounts: boolean },
): string {
  // Setext-style heading: the title underlined with "=", rather than "# Title",
  // so the period can sit on its own line directly beneath without competing
  // for the same line.
  const lines = [title, '='.repeat(title.length), periodLabel, '']
  if (rows.length === 0) {
    lines.push('_No readings logged for this selection._')
    return lines.join('\n')
  }
  for (const row of rows) {
    const authorPart = row.author ? ` — ${row.author}` : ''
    const countPart = options.showCounts && row.count > 1 ? ` (×${row.count})` : ''
    lines.push(`- ${row.title}${authorPart}${countPart}`)
    for (const note of row.notes) {
      lines.push(`  - ${note}`)
    }
  }
  return lines.join('\n')
}
