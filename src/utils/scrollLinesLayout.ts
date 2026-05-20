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
  fontSize: number,
  lineHeightPx: number,
) {
  let height = lineHeightPx
  if (index > 0 && line.startsParagraph && !line.startsChapter) height += lineHeightPx
  if (line.chapterTitle) {
    const headingLineHeight = Math.max(28, fontSize * 1.25)
    const headingTop = index === 0 ? 0 : 64
    height += headingTop + 32 + headingLineHeight
  }
  return height
}
