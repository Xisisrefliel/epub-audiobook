import type { Book } from '../types'
import { getChapterDisplayTitle } from './chapterTitle'
import { getParagraphText, walkParagraphLineParts, type TextPart } from './pretextLayout'

export const SCROLL_SERIF_STACK = 'Georgia, Cambria, "Times New Roman", Times, serif'

export type ScrollLineFragment = {
  paragraphId: string
  chapterId: string
  chapterTitle?: string
  parts: TextPart[]
  startsParagraph: boolean
  startsChapter: boolean
  endsParagraph: boolean
}

export type ScrollTypography = {
  fontSize: number
  lineHeight: number
}

// Keep these in sync with ReaderScroll's `py-1.5` sentence spans and
// chapter heading classes; virtual spacers must match rendered block height.
const SENTENCE_VERTICAL_PAD_PX = 12
const CHAPTER_HEADING_LINE_HEIGHT_PX = 25
const CHAPTER_HEADING_MARGIN_BOTTOM_PX = 32

const fullLinesCache = new WeakMap<Book, Map<string, ScrollLineFragment[]>>()
const chapterLinesCache = new WeakMap<Book, Map<string, ScrollLineFragment[][]>>()

export function scrollLayoutKey(contentWidth: number, fontSize: number, lineHeight: number) {
  return `${Math.round(contentWidth)}:${fontSize}:${lineHeight}`
}

function normalizeTitle(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
}

export function getCachedScrollLines(
  book: Book,
  contentWidth: number,
  fontSize: number,
  lineHeight: number,
) {
  const key = scrollLayoutKey(contentWidth, fontSize, lineHeight)
  return fullLinesCache.get(book)?.get(key) ?? null
}

function getChapterLinesStore(book: Book, key: string) {
  let bookCache = chapterLinesCache.get(book)
  if (!bookCache) {
    bookCache = new Map()
    chapterLinesCache.set(book, bookCache)
  }
  let chapters = bookCache.get(key)
  if (!chapters) {
    chapters = new Array<ScrollLineFragment[]>(book.chapters.length)
    bookCache.set(key, chapters)
  }
  return chapters
}

export function layoutChapterScrollLines(
  book: Book,
  chapterIndex: number,
  contentWidth: number,
  fontSize: number,
  lineHeight: number,
): ScrollLineFragment[] {
  const key = scrollLayoutKey(contentWidth, fontSize, lineHeight)
  const chapters = getChapterLinesStore(book, key)
  const cached = chapters[chapterIndex]
  if (cached) return cached

  const chapter = book.chapters[chapterIndex]
  if (!chapter) {
    chapters[chapterIndex] = []
    return []
  }

  const font = `${fontSize}px ${SCROLL_SERIF_STACK}`
  const out: ScrollLineFragment[] = []
  const displayTitle = getChapterDisplayTitle(book, chapterIndex)
  let isFirstParagraphInChapter = true

  for (const para of chapter.paragraphs) {
    const startsChapter = isFirstParagraphInChapter
    isFirstParagraphInChapter = false
    const paragraphText = getParagraphText(para)
    const isDuplicateHeading =
      startsChapter && normalizeTitle(paragraphText) === normalizeTitle(chapter.title)
    if (isDuplicateHeading) continue

    walkParagraphLineParts(para, font, contentWidth, ({ parts, lineIndex, endsParagraph }) => {
      out.push({
        paragraphId: para.id,
        chapterId: chapter.id,
        chapterTitle: startsChapter && lineIndex === 0 ? displayTitle : undefined,
        parts,
        startsParagraph: lineIndex === 0,
        startsChapter: startsChapter && lineIndex === 0,
        endsParagraph,
      })
    })
  }

  chapters[chapterIndex] = out
  return out
}

function storeFullScrollLines(book: Book, key: string, lines: ScrollLineFragment[]) {
  let bookCache = fullLinesCache.get(book)
  if (!bookCache) {
    bookCache = new Map()
    fullLinesCache.set(book, bookCache)
  }
  bookCache.set(key, lines)
}

export async function buildScrollLinesAsync(
  book: Book,
  contentWidth: number,
  fontSize: number,
  lineHeight: number,
  isCancelled: () => boolean,
  onProgress?: (lines: ScrollLineFragment[]) => void,
) {
  const key = scrollLayoutKey(contentWidth, fontSize, lineHeight)
  const cached = getCachedScrollLines(book, contentWidth, fontSize, lineHeight)
  if (cached) return cached

  const flat: ScrollLineFragment[] = []
  for (let chapterIndex = 0; chapterIndex < book.chapters.length; chapterIndex++) {
    if (isCancelled()) return null
    flat.push(...layoutChapterScrollLines(book, chapterIndex, contentWidth, fontSize, lineHeight))
    onProgress?.(flat.slice())
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }

  if (isCancelled()) return null
  storeFullScrollLines(book, key, flat)
  return flat
}

export function getEstimatedLineBlockHeight(
  line: ScrollLineFragment,
  index: number,
  lineHeightPx: number,
) {
  let height = lineHeightPx + SENTENCE_VERTICAL_PAD_PX
  if (index > 0 && line.startsParagraph && !line.startsChapter) height += lineHeightPx
  if (line.chapterTitle) {
    height += CHAPTER_HEADING_MARGIN_BOTTOM_PX + CHAPTER_HEADING_LINE_HEIGHT_PX
  }
  return height
}
