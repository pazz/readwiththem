import type { BookSearchResult } from '../../catalogue/catalogue'
import { languageFromISBN } from '../../catalogue/language'

export type EntryMode = 'none' | 'scan' | 'again' | 'search' | 'manual'

export interface LogForm {
  mode: EntryMode
  query: string
  results: BookSearchResult[]
  searching: boolean
  selected: BookSearchResult | null
  manual: { title: string; author: string; isbn: string }
  date: string
  note: string
  rating: string
  // Other children who heard the same reading; each gets it logged too.
  alsoFor: string[]
  status: string
}

export type LogFormAction =
  | { type: 'mode'; mode: EntryMode }
  | { type: 'query'; query: string }
  | { type: 'searchStarted' }
  | { type: 'searchFinished'; results?: BookSearchResult[]; status?: string }
  | { type: 'select'; book: BookSearchResult }
  | { type: 'deselect' }
  | { type: 'manual'; field: keyof LogForm['manual']; value: string }
  | { type: 'scanMissed'; isbn: string; status: string }
  | { type: 'details'; field: 'date' | 'note' | 'rating'; value: string }
  | { type: 'status'; status: string }
  | { type: 'toggleAlso'; childId: string }
  | { type: 'logged' }
  | { type: 'bookLogged' }

export function initialLogForm(date: string): LogForm {
  return {
    mode: 'none',
    query: '',
    results: [],
    searching: false,
    selected: null,
    manual: { title: '', author: '', isbn: '' },
    date,
    note: '',
    rating: '',
    alsoFor: [],
    status: '',
  }
}

// The book to log: the picked catalogue result, else the typed-in one.
export function chosenBook(form: LogForm): BookSearchResult | null {
  if (form.selected) return form.selected
  const title = form.manual.title.trim()
  if (!title) return null
  const isbn = form.manual.isbn.trim() || undefined
  return {
    title,
    author: form.manual.author.trim() || 'Unknown',
    isbn,
    language: isbn ? languageFromISBN(isbn) : undefined,
    source: 'manual',
  }
}

export function logFormReducer(form: LogForm, action: LogFormAction): LogForm {
  switch (action.type) {
    case 'mode':
      return { ...form, mode: action.mode }
    case 'query':
      return { ...form, query: action.query }
    case 'searchStarted':
      return { ...form, searching: true }
    case 'searchFinished':
      return { ...form, searching: false, results: action.results ?? form.results, status: action.status ?? form.status }
    case 'select':
      return { ...form, selected: action.book, mode: 'none', status: '' }
    case 'deselect':
      return { ...form, selected: null, mode: 'none' }
    case 'manual':
      return { ...form, manual: { ...form.manual, [action.field]: action.value } }
    case 'scanMissed':
      return { ...form, manual: { ...form.manual, isbn: action.isbn }, mode: 'manual', status: action.status }
    case 'details':
      return { ...form, [action.field]: action.value }
    case 'status':
      return { ...form, status: action.status }
    case 'toggleAlso':
      return {
        ...form,
        alsoFor: form.alsoFor.includes(action.childId)
          ? form.alsoFor.filter((id) => id !== action.childId)
          : [...form.alsoFor, action.childId],
      }
    // Note, rating and the extra children never carry over onto the next book.
    case 'logged':
      return { ...form, note: '', rating: '', alsoFor: [] }
    // A new book logged: start the next entry afresh, keeping only the date.
    case 'bookLogged':
      return { ...initialLogForm(form.date) }
  }
}
