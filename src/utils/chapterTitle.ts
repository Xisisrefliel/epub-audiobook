import type { Book } from '../types'

export function getChapterDisplayTitle(book: Book, chapterIndex: number) {
  const tocTitle = findTocLabelForChapter(book.toc ?? [], chapterIndex)
  if (tocTitle && normalizeTitle(tocTitle) !== normalizeTitle(book.title)) return tocTitle

  const chapterTitle = book.chapters[chapterIndex]?.title?.trim()
  if (chapterTitle && normalizeTitle(chapterTitle) !== normalizeTitle(book.title)) return chapterTitle

  return `Chapter ${chapterIndex + 1}`
}

function findTocLabelForChapter(items: NonNullable<Book['toc']>, chapterIndex: number): string | null {
  for (const item of items) {
    if (item.chapterIndex === chapterIndex) return item.label
    const childLabel = item.children ? findTocLabelForChapter(item.children, chapterIndex) : null
    if (childLabel) return childLabel
  }
  return null
}

function normalizeTitle(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
}
