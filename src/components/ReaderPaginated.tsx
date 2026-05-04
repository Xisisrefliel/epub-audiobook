import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ActiveWord, Book, Chapter, PaginationInfo } from '../types'
import { measureParagraphLines, walkParagraphLineParts, type TextPart } from '../utils/pretextLayout'
import { SentenceHighlight } from './SentenceHighlight'

const PARAGRAPH_GAP_LINES = 1
const SERIF_STACK = 'Georgia, Cambria, "Times New Roman", Times, serif'
const COL_GAP_PX = 64
const MAX_COLS = 2
const VIEWPORT_CHROME_PX = 280

type LineFragment = {
  paragraphId: string
  parts: TextPart[]
  startsParagraph: boolean
}
type Column = { lines: LineFragment[] }
type Page = { columns: Column[]; sentenceIds: Set<string>; firstSentenceId: string | null }

type Props = {
  book: Book
  chapterIndex: number
  onChapterChange: (index: number, edge?: 'start' | 'end') => void
  fontSize: number
  lineHeight: number
  measure: number
  currentSentenceId: string | null
  locationSentenceId: string | null
  activeWord: ActiveWord | null
  onSentenceSelect: (id: string | null) => void
  onLocationChange: (id: string | null) => void
  onPaginationChange: (info: PaginationInfo | null) => void
}

export function ReaderPaginated({
  book,
  chapterIndex,
  onChapterChange,
  fontSize,
  lineHeight,
  measure,
  currentSentenceId,
  locationSentenceId,
  activeWord,
  onSentenceSelect,
  onLocationChange,
  onPaginationChange,
}: Props) {
  const chapter = book.chapters[chapterIndex]
  const containerRef = useRef<HTMLDivElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [pageHeight, setPageHeight] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)
  const suppressNextAnchorSyncRef = useRef(false)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setContainerWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const update = () =>
      setPageHeight(Math.max(400, window.innerHeight - VIEWPORT_CHROME_PX))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const layoutInfo = useMemo(() => {
    if (!containerWidth) return null
    const targetColPx = measure * fontSize * 0.5
    const fits = Math.floor(
      (containerWidth + COL_GAP_PX) / (targetColPx + COL_GAP_PX),
    )
    const colCount = Math.max(1, Math.min(MAX_COLS, fits))
    const columnWidth = Math.min(
      targetColPx,
      (containerWidth - COL_GAP_PX * (colCount - 1)) / colCount,
    )
    const articleWidth =
      columnWidth * colCount + COL_GAP_PX * (colCount - 1)
    return { colCount, columnWidth, articleWidth }
  }, [containerWidth, fontSize, measure])

  const chapterTotal = useMemo(() => {
    if (!layoutInfo || !pageHeight) return 0
    return getCachedChapterPageCount(chapter, layoutInfo, pageHeight, fontSize, lineHeight)
  }, [chapter, fontSize, lineHeight, layoutInfo, pageHeight])

  const currentPage = useMemo(() => {
    if (!layoutInfo || !pageHeight || chapterTotal === 0) return undefined
    const clamped = Math.max(0, Math.min(pageIndex, chapterTotal - 1))
    return getCachedChapterPage(chapter, clamped, layoutInfo, pageHeight, fontSize, lineHeight)
  }, [chapter, chapterTotal, fontSize, lineHeight, layoutInfo, pageHeight, pageIndex])

  const chapterPageCounts = useMemo(() => {
    if (!layoutInfo || !pageHeight) return null
    return book.chapters.map((ch) =>
      getCachedChapterPageCount(ch, layoutInfo, pageHeight, fontSize, lineHeight),
    )
  }, [book, fontSize, lineHeight, layoutInfo, pageHeight])

  const bookPageOffset = chapterPageCounts
    ? chapterPageCounts.slice(0, chapterIndex).reduce((sum, count) => sum + count, 0)
    : 0
  const totalBookPages = chapterPageCounts?.reduce((sum, count) => sum + count, 0) ?? 0

  useEffect(() => {
    if (chapterTotal === 0 || totalBookPages === 0) {
      onPaginationChange(null)
      return
    }
    onPaginationChange({
      pageIndex: bookPageOffset + pageIndex,
      totalPages: totalBookPages,
      chapterPageIndex: pageIndex,
      chapterTotal,
    })
  }, [pageIndex, chapterTotal, bookPageOffset, totalBookPages, onPaginationChange])

  useEffect(() => {
    return () => onPaginationChange(null)
  }, [onPaginationChange])

  useEffect(() => {
    if (suppressNextAnchorSyncRef.current) {
      suppressNextAnchorSyncRef.current = false
      return
    }
    const anchorId = currentSentenceId ?? locationSentenceId
    if (!anchorId || !layoutInfo || !pageHeight || chapterTotal === 0) return
    const idx = findPageIndexForSentence(chapter, anchorId, layoutInfo, pageHeight, fontSize, lineHeight)
    if (idx >= 0) setPageIndex((prev) => (prev === idx ? prev : idx))
  }, [chapter, chapterTotal, currentSentenceId, fontSize, lineHeight, locationSentenceId, layoutInfo, pageHeight])

  useEffect(() => {
    if (chapterTotal > 0 && pageIndex >= chapterTotal) setPageIndex(chapterTotal - 1)
  }, [chapterTotal, pageIndex])

  const goToPage = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(nextIndex, chapterTotal - 1))
    const page = layoutInfo && pageHeight ? getCachedChapterPage(chapter, clamped, layoutInfo, pageHeight, fontSize, lineHeight) : undefined
    suppressNextAnchorSyncRef.current = true
    setPageIndex(clamped)
    onSentenceSelect(null)
    onLocationChange(page?.firstSentenceId ?? null)
  }

  const goPrev = () => {
    if (pageIndex > 0) {
      goToPage(pageIndex - 1)
      return
    }
    if (chapterIndex > 0) {
      const prevChapter = book.chapters[chapterIndex - 1]
      const prevTotal = layoutInfo && pageHeight
        ? getCachedChapterPageCount(prevChapter, layoutInfo, pageHeight, fontSize, lineHeight)
        : 1
      setPageIndex(Math.max(0, prevTotal - 1))
      onChapterChange(chapterIndex - 1, 'end')
    }
  }

  const goNext = () => {
    if (pageIndex < chapterTotal - 1) {
      goToPage(pageIndex + 1)
      return
    }
    if (chapterIndex < book.chapters.length - 1) {
      setPageIndex(0)
      onChapterChange(chapterIndex + 1, 'start')
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.matches('input, textarea, [contenteditable]')) return
      if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div ref={containerRef} className="px-8 pt-20 pb-28">
      <div
        className="mx-auto"
        style={{ width: layoutInfo?.articleWidth ?? 'auto', maxWidth: '100%' }}
      >
        <article
          ref={articleRef}
          className="relative isolate text-zinc-700 dark:text-zinc-300"
          style={{
            fontSize: `${fontSize}px`,
            lineHeight,
            height: pageHeight || undefined,
            fontFamily: SERIF_STACK,
          }}
        >
          <SentenceHighlight
            activeId={currentSentenceId}
            articleRef={articleRef}
            fontSize={fontSize}
            refreshKey={`pages-${pageIndex}-${chapterTotal}-${layoutInfo?.articleWidth ?? 0}-${fontSize}-${lineHeight}-${measure}`}
          />

          {currentPage && layoutInfo && (
            <div
              className="grid h-full"
              style={{
                gridTemplateColumns: `repeat(${layoutInfo.colCount}, minmax(0, 1fr))`,
                gap: `${COL_GAP_PX}px`,
              }}
            >
              {currentPage.columns.map((col, ci) => (
                <div key={ci} className="min-w-0">
                  {col.lines.map((line, li) => (
                    <div
                      key={`${line.paragraphId}-${li}`}
                      style={{ marginTop: li > 0 && line.startsParagraph ? `${fontSize * lineHeight * PARAGRAPH_GAP_LINES}px` : undefined }}
                    >
                      {line.parts.map((part, pi) => {
                        const isActive = part.id === currentSentenceId
                        return (
                          <span
                            key={`${part.id}-${pi}`}
                            data-sid={part.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              onLocationChange(part.id)
                              onSentenceSelect(part.id)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                onLocationChange(part.id)
                                onSentenceSelect(part.id)
                              }
                            }}
                            className={
                              'cursor-pointer rounded-sm py-1.5 box-decoration-clone transition-colors duration-200 ' +
                              (isActive
                                ? 'text-zinc-900 dark:text-zinc-50'
                                : 'hover:text-zinc-900 dark:hover:text-zinc-50')
                            }
                          >
                            <HighlightedText part={part} activeWord={activeWord} />
                          </span>
                        )
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </article>

        <PageNav onPrev={goPrev} onNext={goNext} />
      </div>
    </div>
  )
}

function HighlightedText({ part, activeWord }: { part: TextPart; activeWord: ActiveWord | null }) {
  const match = activeWord?.sentenceId === part.id ? findActiveWordMatch(part, activeWord) : null
  if (!match) return part.text
  return (
    <>
      {part.text.slice(0, match.start)}
      <mark className="rounded-sm bg-zinc-900/10 px-0.5 text-inherit transition-colors duration-100 dark:bg-zinc-100/15">
        {part.text.slice(match.start, match.end)}
      </mark>
      {part.text.slice(match.end)}
    </>
  )
}

function findActiveWordMatch(part: TextPart, activeWord: ActiveWord) {
  const target = normalizeWord(activeWord.text)
  if (!target) return null
  const matches = Array.from(part.sentenceText.matchAll(/[\p{L}\p{N}]+/gu))
  const sameWordMatches = matches.filter((match) => normalizeWord(match[0]) === target)
  const sentenceMatch = sameWordMatches[activeWord.occurrence]
  if (!sentenceMatch || sentenceMatch.index === undefined) return null
  const start = sentenceMatch.index - part.sentenceOffset
  const end = start + sentenceMatch[0].length
  if (end <= 0 || start >= part.text.length) return null
  return { start: Math.max(0, start), end: Math.min(part.text.length, end) }
}

function normalizeWord(value: string) {
  return value.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()
}

const paginationCache = new WeakMap<Chapter, Map<string, Page>>()
const pageCountCache = new WeakMap<Chapter, Map<string, number>>()

function getCachedChapterPageCount(
  chapter: Chapter,
  layoutInfo: { colCount: number; columnWidth: number },
  pageHeight: number,
  fontSize: number,
  lineHeight: number,
) {
  const key = `${layoutInfo.colCount}:${Math.round(layoutInfo.columnWidth)}:${Math.round(pageHeight)}:${fontSize}:${lineHeight}`
  let chapterCache = pageCountCache.get(chapter)
  if (!chapterCache) {
    chapterCache = new Map()
    pageCountCache.set(chapter, chapterCache)
  }
  const cached = chapterCache.get(key)
  if (cached !== undefined) return cached
  const count = countChapterPages(chapter, layoutInfo, pageHeight, fontSize, lineHeight)
  chapterCache.set(key, count)
  return count
}

function getCachedChapterPage(
  chapter: Chapter,
  pageIndex: number,
  layoutInfo: { colCount: number; columnWidth: number },
  pageHeight: number,
  fontSize: number,
  lineHeight: number,
) {
  const key = `${pageIndex}:${layoutInfo.colCount}:${Math.round(layoutInfo.columnWidth)}:${Math.round(pageHeight)}:${fontSize}:${lineHeight}`
  let chapterCache = paginationCache.get(chapter)
  if (!chapterCache) {
    chapterCache = new Map()
    paginationCache.set(chapter, chapterCache)
  }
  const cached = chapterCache.get(key)
  if (cached) return cached
  const page = paginateChapterPage(chapter, pageIndex, layoutInfo, pageHeight, fontSize, lineHeight)
  chapterCache.set(key, page)
  return page
}

function countChapterPages(
  chapter: Chapter,
  layoutInfo: { colCount: number; columnWidth: number },
  pageHeight: number,
  fontSize: number,
  lineHeight: number,
) {
  const { colCount, columnWidth } = layoutInfo
  const font = `${fontSize}px ${SERIF_STACK}`
  const lineHeightPx = fontSize * lineHeight
  const maxLines = Math.max(1, Math.floor(pageHeight / lineHeightPx))
  let pageCount = 0
  let colIdx = 0
  let colUsed = 0
  const advanceColumn = () => {
    colIdx++
    colUsed = 0
    if (colIdx >= colCount) {
      pageCount++
      colIdx = 0
    }
  }

  for (const para of chapter.paragraphs) {
    const lineCount = measureParagraphLines(para, font, columnWidth)
    for (let i = 0; i < lineCount; i++) {
      const startsParagraph = i === 0
      const gap = colUsed > 0 && startsParagraph ? PARAGRAPH_GAP_LINES : 0
      if (colUsed + gap + 1 > maxLines) advanceColumn()
      colUsed += (colUsed > 0 && startsParagraph ? PARAGRAPH_GAP_LINES : 0) + 1
    }
  }

  if (colUsed > 0 || colIdx > 0) pageCount++
  return pageCount
}

function paginateChapterPage(
  chapter: Chapter,
  targetPageIndex: number,
  layoutInfo: { colCount: number; columnWidth: number },
  pageHeight: number,
  fontSize: number,
  lineHeight: number,
): Page {
  const { colCount, columnWidth } = layoutInfo
  const font = `${fontSize}px ${SERIF_STACK}`
  const lineHeightPx = fontSize * lineHeight
  const maxLines = Math.max(1, Math.floor(pageHeight / lineHeightPx))
  const newPage = (): Page => ({
    columns: Array.from({ length: colCount }, () => ({ lines: [] })),
    sentenceIds: new Set(),
    firstSentenceId: null,
  })
  let page = newPage()
  let pageIndex = 0
  let colIdx = 0
  let colUsed = 0

  const advanceColumn = () => {
    colIdx++
    colUsed = 0
    if (colIdx >= colCount) {
      pageIndex++
      page = pageIndex === targetPageIndex ? newPage() : page
      colIdx = 0
    }
  }

  for (const para of chapter.paragraphs) {
    let done = false
    walkParagraphLineParts(para, font, columnWidth, ({ parts, lineIndex }) => {
      const startsParagraph = lineIndex === 0
      const gap = colUsed > 0 && startsParagraph ? PARAGRAPH_GAP_LINES : 0
      if (colUsed + gap + 1 > maxLines) advanceColumn()
      if (pageIndex > targetPageIndex) {
        done = true
        return false
      }
      if (pageIndex === targetPageIndex) {
        const line = { paragraphId: para.id, parts, startsParagraph }
        page.columns[colIdx].lines.push(line)
        parts.forEach((p) => {
          if (!page.firstSentenceId) page.firstSentenceId = p.id
          page.sentenceIds.add(p.id)
        })
      }
      colUsed += (colUsed > 0 && startsParagraph ? PARAGRAPH_GAP_LINES : 0) + 1
    })
    if (done) break
  }

  return page
}

function findPageIndexForSentence(
  chapter: Chapter,
  sentenceId: string,
  layoutInfo: { colCount: number; columnWidth: number },
  pageHeight: number,
  fontSize: number,
  lineHeight: number,
) {
  const { colCount, columnWidth } = layoutInfo
  const font = `${fontSize}px ${SERIF_STACK}`
  const maxLines = Math.max(1, Math.floor(pageHeight / (fontSize * lineHeight)))
  let pageIndex = 0
  let colIdx = 0
  let colUsed = 0
  let found = -1
  const advanceColumn = () => {
    colIdx++
    colUsed = 0
    if (colIdx >= colCount) {
      pageIndex++
      colIdx = 0
    }
  }

  for (const para of chapter.paragraphs) {
    if (found >= 0) break
    walkParagraphLineParts(para, font, columnWidth, ({ parts, lineIndex }) => {
      if (found >= 0) return false
      const startsParagraph = lineIndex === 0
      const gap = colUsed > 0 && startsParagraph ? PARAGRAPH_GAP_LINES : 0
      if (colUsed + gap + 1 > maxLines) advanceColumn()
      if (parts.some((part) => part.id === sentenceId)) {
        found = pageIndex
        return false
      }
      colUsed += (colUsed > 0 && startsParagraph ? PARAGRAPH_GAP_LINES : 0) + 1
    })
  }
  return found
}

function PageNav({
  onPrev,
  onNext,
}: {
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="mt-8 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous page"
        className="flex items-center gap-1 rounded-md px-2 py-1 transition-[color,transform] duration-200 ease-out hover:text-zinc-900 active:scale-[0.96] dark:hover:text-zinc-100"
      >
        <ChevronLeft className="h-4 w-4" />
        Prev
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next page"
        className="flex items-center gap-1 rounded-md px-2 py-1 transition-[color,transform] duration-200 ease-out hover:text-zinc-900 active:scale-[0.96] dark:hover:text-zinc-100"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
