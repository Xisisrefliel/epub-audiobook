import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ActiveWord, Book, ScrollRequest } from '../types'
import { getChapterDisplayTitle } from '../utils/chapterTitle'
import { getParagraphText, walkParagraphLineParts, type TextPart } from '../utils/pretextLayout'
import { SentenceHighlight } from './SentenceHighlight'
import { WordHighlight } from './WordHighlight'

const SERIF_STACK = 'Georgia, Cambria, "Times New Roman", Times, serif'

const findOffsetIndex = (values: number[], target: number) => {
  let lo = 0
  let hi = values.length - 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if ((values[mid] ?? 0) < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

type LineFragment = {
  paragraphId: string
  chapterId: string
  chapterTitle?: string
  parts: TextPart[]
  startsParagraph: boolean
  startsChapter: boolean
}

type Props = {
  book: Book
  chapterIndex: number
  fontSize: number
  lineHeight: number
  measure: number
  currentSentenceId: string | null
  locationSentenceId: string | null
  activeWord: ActiveWord | null
  onSentenceSelect: (id: string | null) => void
  onLocationChange: (id: string | null) => void
  scrollRequest: ScrollRequest | null
  syncKey: number
  onCurrentSentenceVisibilityChange: (visible: boolean) => void
}

export function ReaderScroll({
  book,
  fontSize,
  lineHeight,
  measure,
  currentSentenceId,
  locationSentenceId,
  activeWord,
  onSentenceSelect,
  onLocationChange,
  scrollRequest,
  onCurrentSentenceVisibilityChange,
}: Props) {
  const articleRef = useRef<HTMLElement | null>(null)
  const activeRef = useRef<HTMLSpanElement | null>(null)
  const [contentWidth, setContentWidth] = useState(0)

  useLayoutEffect(() => {
    const article = articleRef.current
    if (!article) return
    const update = () => setContentWidth(article.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(article)
    return () => ro.disconnect()
  }, [])

  const lines = useMemo(() => {
    if (!contentWidth) return []
    return getCachedScrollLines(book, contentWidth, fontSize, lineHeight)
  }, [book, contentWidth, fontSize, lineHeight])

  const linesReady = lines.length > 0
  const lineHeightPx = fontSize * lineHeight
  const [viewport, setViewport] = useState(() => ({ y: 0, h: typeof window === 'undefined' ? 900 : window.innerHeight }))
  const sentenceLineIndex = useMemo(() => {
    const map = new Map<string, number>()
    lines.forEach((line, index) => {
      line.parts.forEach((part) => {
        if (!map.has(part.id)) map.set(part.id, index)
      })
    })
    return map
  }, [lines])
  const lineOffsets = useMemo(() => {
    const offsets = new Array(lines.length + 1)
    offsets[0] = 0
    for (let i = 0; i < lines.length; i++) {
      offsets[i + 1] = offsets[i] + getEstimatedLineBlockHeight(lines[i], i, fontSize, lineHeightPx)
    }
    return offsets
  }, [fontSize, lineHeightPx, lines])
  const virtual = useMemo(() => {
    const overscanPx = lineHeightPx * 60
    const start = Math.max(0, findOffsetIndex(lineOffsets, Math.max(0, viewport.y - 180 - overscanPx)) - 1)
    const end = Math.min(lines.length, findOffsetIndex(lineOffsets, viewport.y + viewport.h + 180 + overscanPx) + 1)
    return {
      start,
      end,
      top: lineOffsets[start] ?? 0,
      bottom: Math.max(0, (lineOffsets.at(-1) ?? 0) - (lineOffsets[end] ?? 0)),
      lines: lines.slice(start, end),
    }
  }, [lineHeightPx, lineOffsets, lines, viewport])
  const handledScrollRequestRef = useRef<number | null>(null)

  useEffect(() => {
    handledScrollRequestRef.current = null
  }, [book])

  useEffect(() => {
    if (!currentSentenceId) {
      onCurrentSentenceVisibilityChange(false)
      return
    }

    const checkVisibility = () => {
      const spans = Array.from(articleRef.current?.querySelectorAll<HTMLElement>(`[data-sid="${currentSentenceId}"]`) ?? [])
      const visible = spans.some((span) => {
        const rect = span.getBoundingClientRect()
        return rect.bottom > 96 && rect.top < window.innerHeight - 140
      })
      onCurrentSentenceVisibilityChange(visible)
    }

    checkVisibility()
    window.addEventListener('scroll', checkVisibility, { passive: true })
    window.addEventListener('resize', checkVisibility)
    return () => {
      window.removeEventListener('scroll', checkVisibility)
      window.removeEventListener('resize', checkVisibility)
    }
  }, [currentSentenceId, lines, onCurrentSentenceVisibilityChange])

  useEffect(() => {
    if (!linesReady || !scrollRequest) return
    if (handledScrollRequestRef.current === scrollRequest.key) return
    handledScrollRequestRef.current = scrollRequest.key

    const articleDocTop = () => {
      const el = articleRef.current
      if (!el) return 0
      return el.getBoundingClientRect().top + window.scrollY
    }

    const scrollToLineIndex = (index: number) => {
      const top = articleDocTop() + (lineOffsets[index] ?? index * lineHeightPx) - window.innerHeight / 2
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
    }

    if (scrollRequest.type === 'sentence') {
      const target = articleRef.current?.querySelector(`[data-sid="${scrollRequest.id}"]`)
      if (target) {
        target.scrollIntoView({ behavior: 'auto', block: 'center' })
        return
      }
      const index = sentenceLineIndex.get(scrollRequest.id)
      if (index !== undefined) scrollToLineIndex(index)
      return
    }

    const chapter = book.chapters[scrollRequest.chapterIndex]
    if (!chapter) return
    const heading = articleRef.current?.querySelector(`[data-chapter-id="${chapter.id}"]`)
    if (heading) heading.scrollIntoView({ behavior: 'auto', block: 'center' })
    else {
      const lineIndex = lines.findIndex((line) => line.chapterId === chapter.id)
      if (lineIndex >= 0) scrollToLineIndex(lineIndex)
    }
  }, [book, lineHeightPx, lineOffsets, lines, linesReady, scrollRequest, sentenceLineIndex] )

  useEffect(() => {
    if (!articleRef.current) return
    let frame = 0
    let lastId = locationSentenceId

    const updateLocationFromViewport = () => {
      frame = 0
      const article = articleRef.current
      if (!article) return
      const probeY = Math.min(window.innerHeight - 120, Math.max(120, window.innerHeight * 0.42))
      const probeX = window.innerWidth / 2
      const elements = document.elementsFromPoint(probeX, probeY)
      let sentence = elements.find((el) => el instanceof HTMLElement && el.dataset.sid) as HTMLElement | undefined

      if (!sentence) {
        const spans = Array.from(article.querySelectorAll<HTMLElement>('[data-sid]'))
        sentence = spans.find((span) => {
          const rect = span.getBoundingClientRect()
          return rect.bottom >= 96 && rect.top <= window.innerHeight - 140
        })
      }

      const id = sentence?.dataset.sid ?? null
      if (id && id !== lastId) {
        lastId = id
        onLocationChange(id)
      }
    }

    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(updateLocationFromViewport)
    }

    schedule()
    const updateViewport = () => setViewport({ y: window.scrollY, h: window.innerHeight })
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('scroll', updateViewport, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('resize', updateViewport)
    updateViewport()
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('resize', updateViewport)
    }
  }, [lines, locationSentenceId, onLocationChange])

  return (
    <div className="px-6 pb-40 pt-24">
      <article
        ref={articleRef}
        className="relative isolate mx-auto text-zinc-700 dark:text-zinc-300"
        style={{
          maxWidth: `${measure}ch`,
          fontSize: `${fontSize}px`,
          lineHeight,
          fontFamily: SERIF_STACK,
        }}
      >
        <SentenceHighlight
          activeId={currentSentenceId}
          articleRef={articleRef}
          fontSize={fontSize}
          refreshKey={`scroll-${lines.length}-${contentWidth}-${fontSize}-${lineHeight}-${measure}`}
        />
        <WordHighlight
          activeKey={activeWord ? `${activeWord.sentenceId}:${activeWord.wordIndex}:${activeWord.isPunctuationPause ? 'pause' : 'word'}` : null}
          articleRef={articleRef}
        />

        <div className="relative z-10">
          <div style={{ height: virtual.top }} />
          {virtual.lines.map((line, offset) => {
            const li = virtual.start + offset
            return (
            <div key={`${line.chapterId}-${line.paragraphId}-${li}`}>
              {line.chapterTitle && (
                <h1
                  data-chapter-id={line.chapterId}
                  className="mb-8 mt-16 scroll-mt-24 text-center text-xl font-semibold leading-tight tracking-tight text-zinc-900 first:mt-0 dark:text-zinc-100"
                >
                  {line.chapterTitle}
                </h1>
              )}
              <div
                style={{ marginTop: li > 0 && line.startsParagraph && !line.startsChapter ? `${fontSize * lineHeight}px` : undefined }}
              >
              {line.parts.map((part, pi) => {
                const isActive = part.id === currentSentenceId
                return (
                  <span
                    key={`${part.id}-${pi}`}
                    ref={isActive ? activeRef : null}
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
            </div>
          )})}
          <div style={{ height: virtual.bottom }} />
        </div>
      </article>
    </div>
  )
}

function HighlightedText({ part, activeWord }: { part: TextPart; activeWord: ActiveWord | null }) {
  const match = activeWord?.sentenceId === part.id ? findActiveWordMatch(part, activeWord) : null
  if (!match) return part.text
  return (
    <>
      {part.text.slice(0, match.start)}
      <mark
        data-active-word={`${activeWord!.sentenceId}:${activeWord!.wordIndex}:${activeWord!.isPunctuationPause ? 'pause' : 'word'}`}
        className="rounded-[0.2em] bg-transparent px-0.5 text-inherit"
      >
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
  let end = start + sentenceMatch[0].length
  if (activeWord.isPunctuationPause) {
    const trailing = part.sentenceText.slice(sentenceMatch.index + sentenceMatch[0].length).match(/^[\s,;:–—-]+/u)
    end += trailing?.[0]?.length ?? 0
  }
  if (end <= 0 || start >= part.text.length) return null
  return { start: Math.max(0, start), end: Math.min(part.text.length, end) }
}

function normalizeWord(value: string) {
  return value.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()
}

const scrollLinesCache = new WeakMap<Book, Map<string, LineFragment[]>>()

function getCachedScrollLines(book: Book, contentWidth: number, fontSize: number, lineHeight: number) {
  const key = `${Math.round(contentWidth)}:${fontSize}:${lineHeight}`
  let bookCache = scrollLinesCache.get(book)
  if (!bookCache) {
    bookCache = new Map()
    scrollLinesCache.set(book, bookCache)
  }
  const cached = bookCache.get(key)
  if (cached) return cached

  const font = `${fontSize}px ${SERIF_STACK}`
  const out: LineFragment[] = []

  for (const [chapterIndex, chapter] of book.chapters.entries()) {
      const displayTitle = getChapterDisplayTitle(book, chapterIndex)
      let isFirstParagraphInChapter = true
      for (const para of chapter.paragraphs) {
        const startsChapter = isFirstParagraphInChapter
        isFirstParagraphInChapter = false
        const paragraphText = getParagraphText(para)
        const isDuplicateHeading =
          startsChapter &&
          normalizeTitle(paragraphText) === normalizeTitle(chapter.title)
        if (isDuplicateHeading) continue

        walkParagraphLineParts(para, font, contentWidth, ({ parts, lineIndex }) => {
          out.push({
            paragraphId: para.id,
            chapterId: chapter.id,
            chapterTitle: startsChapter && lineIndex === 0 ? displayTitle : undefined,
            parts,
            startsParagraph: lineIndex === 0,
            startsChapter: startsChapter && lineIndex === 0,
          })
        })
      }
    }

  bookCache.set(key, out)
  return out
}

function getEstimatedLineBlockHeight(line: LineFragment, index: number, fontSize: number, lineHeightPx: number) {
  let height = lineHeightPx
  if (index > 0 && line.startsParagraph && !line.startsChapter) height += lineHeightPx
  if (line.chapterTitle) {
    const headingLineHeight = Math.max(28, fontSize * 1.25)
    const headingTop = index === 0 ? 0 : 64
    height += headingTop + 32 + headingLineHeight
  }
  return height
}

function normalizeTitle(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
}
