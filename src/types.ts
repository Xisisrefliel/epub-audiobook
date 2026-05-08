export type ReaderMode = 'scroll' | 'paginated'
export type Theme = 'light' | 'dark' | 'system'

type Sentence = {
  id: string
  text: string
}

export type Paragraph = {
  id: string
  sentences: Sentence[]
}

export type Chapter = {
  id: string
  title: string
  paragraphs: Paragraph[]
}

export type TocItem = {
  id: string
  label: string
  chapterIndex: number
  children?: TocItem[]
}

export type Book = {
  id: string
  title: string
  author: string
  chapters: Chapter[]
  toc?: TocItem[]
  coverUrl?: string
}

export type PaginationInfo = {
  pageIndex: number
  totalPages: number
  chapterPageIndex: number
  chapterTotal: number
}

export type BookmarkPageInfo = {
  pageIndex: number
  totalPages: number
}

export type ScrollProgressInfo = {
  chapterIndex: number
  chapterTotal: number
  chapterSentenceIndex: number
  chapterSentenceTotal: number
  bookSentenceIndex: number
  bookSentenceTotal: number
}

export type ScrollRequest =
  | { key: number; type: 'sentence'; id: string; behavior?: ScrollBehavior; align?: 'nearest' | 'center'; offset?: number }
  | { key: number; type: 'chapter'; chapterIndex: number }

export type ActiveWord = {
  sentenceId: string
  wordIndex: number
  occurrence: number
  text: string
  isPunctuationPause?: boolean
}

export type CounterMode = 'chapter' | 'book'

export type Bookmark = {
  sentenceId: string
  offset: number
}

export type BookmarkMap = Record<string, Bookmark[]>
