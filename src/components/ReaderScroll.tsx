import { Fragment, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Bookmark } from 'lucide-react'
import type { ActiveWord, Book, Bookmark as BookmarkAnchor, HighlightTheme, ScrollRequest } from '../types'
import { useScrollLinesLayout } from '../hooks/useScrollLinesLayout'
import {
  getEstimatedLineBlockHeight,
  SCROLL_SERIF_STACK,
} from '../utils/scrollLinesLayout'
import type { TextPart } from '../utils/pretextLayout'
import { SentenceHighlight } from './SentenceHighlight'
import { WordHighlight } from './WordHighlight'
import { HighlightedText } from './readerHighlights'
const LONG_PRESS_BOOKMARK_MS = 520
const LONG_PRESS_FEEDBACK_MS = 140
const LONG_PRESS_MOVE_THRESHOLD_PX = 10
const LOCATION_SCROLL_UPDATE_MS = 120

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


type BookmarkTarget = { lineKey: string; sentenceId: string; offset: number }

type Props = {
  book: Book
  chapterIndex: number
  highlightTheme: HighlightTheme
  fontSize: number
  lineHeight: number
  measure: number
  currentSentenceId: string | null
  locationSentenceId: string | null
  activeWord: ActiveWord | null
  bookmarkBySentenceId: Map<string, BookmarkAnchor>
  onSentenceSelect: (id: string | null) => void
  onBookmarkToggle: (id: string, offset: number) => void
  onLocationChange: (id: string | null) => void
  scrollRequest: ScrollRequest | null
  syncKey: number
  onCurrentSentenceVisibilityChange: (visible: boolean) => void
}

export function ReaderScroll({
  book,
  highlightTheme,
  fontSize,
  lineHeight,
  measure,
  currentSentenceId,
  locationSentenceId,
  activeWord,
  bookmarkBySentenceId,
  onSentenceSelect,
  onBookmarkToggle,
  onLocationChange,
  scrollRequest,
  onCurrentSentenceVisibilityChange,
}: Props) {
  const articleRef = useRef<HTMLElement | null>(null)
  const activeRef = useRef<HTMLSpanElement | null>(null)
  const [contentWidth, setContentWidth] = useState(0)
  const [hoveredBookmarkTarget, setHoveredBookmarkTarget] = useState<BookmarkTarget | null>(null)
  const longPressRef = useRef<{
    timer: number
    feedbackTimer: number
    pointerId: number
    sentenceId: string
    feedbackEl: HTMLElement | null
    x: number
    y: number
  } | null>(null)
  const suppressNextClickRef = useRef(false)

  useLayoutEffect(() => {
    const article = articleRef.current
    if (!article) return
    const update = () => setContentWidth(article.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(article)
    return () => ro.disconnect()
  }, [])

  const linesLayout = useScrollLinesLayout({ book, contentWidth, fontSize, lineHeight })
  const { lines, displayFontSize, displayLineHeight, linesReady, isUpdating } = linesLayout
  const lineHeightPx = displayFontSize * displayLineHeight
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
      offsets[i + 1] = offsets[i] + getEstimatedLineBlockHeight(lines[i], i, lineHeightPx)
    }
    return offsets
  }, [lineHeightPx, lines])

  const prevUpdatingRef = useRef(false)
  useEffect(() => {
    if (prevUpdatingRef.current && !isUpdating && locationSentenceId && linesReady) {
      requestAnimationFrame(() => {
        const target = articleRef.current?.querySelector<HTMLElement>(
          `[data-sid="${CSS.escape(locationSentenceId)}"]`,
        )
        target?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'auto' })
      })
    }
    prevUpdatingRef.current = isUpdating
  }, [isUpdating, linesReady, locationSentenceId])

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

  const cancelLongPress = () => {
    if (!longPressRef.current) return
    const sentenceId = longPressRef.current.sentenceId
    window.clearTimeout(longPressRef.current.timer)
    window.clearTimeout(longPressRef.current.feedbackTimer)
    setPressFeedback(sentenceId, false)
    longPressRef.current = null
  }

  const startBookmarkLongPress = (
    event: PointerEvent<HTMLSpanElement>,
    sentenceId: string,
    offset: number,
  ) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    cancelLongPress()
    const pointerId = event.pointerId
    const feedbackEl = event.currentTarget.querySelector<HTMLElement>('.sentence-press-feedback')
    longPressRef.current = {
      feedbackTimer: window.setTimeout(() => {
        setPressFeedback(sentenceId, true)
      }, LONG_PRESS_FEEDBACK_MS),
      timer: window.setTimeout(() => {
        suppressNextClickRef.current = true
        onBookmarkToggle(sentenceId, offset)
        requestAnimationFrame(() => {
          if (longPressRef.current?.sentenceId === sentenceId) setPressFeedback(sentenceId, true)
        })
      }, LONG_PRESS_BOOKMARK_MS),
      pointerId,
      sentenceId,
      feedbackEl,
      x: event.clientX,
      y: event.clientY,
    }
  }

  const moveBookmarkLongPress = (event: PointerEvent<HTMLSpanElement>) => {
    const press = longPressRef.current
    if (!press || press.pointerId !== event.pointerId) return
    const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y)
    if (distance > LONG_PRESS_MOVE_THRESHOLD_PX) cancelLongPress()
  }

  useEffect(() => cancelLongPress, [])

  useEffect(() => {
    handledScrollRequestRef.current = null
  }, [book])

  const notifyCurrentSentenceVisibility = useEffectEvent(onCurrentSentenceVisibilityChange)

  useEffect(() => {
    if (!currentSentenceId) {
      notifyCurrentSentenceVisibility(false)
      return
    }

    let frame = 0
    let lastVisible: boolean | null = null
    const checkVisibility = () => {
      frame = 0
      const spans = Array.from(articleRef.current?.querySelectorAll<HTMLElement>(`[data-sid="${currentSentenceId}"]`) ?? [])
      const visible = spans.some((span) => {
        const rect = span.getBoundingClientRect()
        return rect.bottom > 96 && rect.top < window.innerHeight - 140
      })
      if (visible !== lastVisible) {
        lastVisible = visible
        notifyCurrentSentenceVisibility(visible)
      }
    }
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(checkVisibility)
    }

    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [currentSentenceId, lines])

  useEffect(() => {
    if (!linesReady || !scrollRequest) return
    if (handledScrollRequestRef.current === scrollRequest.key) return
    handledScrollRequestRef.current = scrollRequest.key

    const articleDocTop = () => {
      const el = articleRef.current
      if (!el) return 0
      return el.getBoundingClientRect().top + window.scrollY
    }

    const scrollToLineIndex = (index: number, behavior: ScrollBehavior = 'auto') => {
      const top = articleDocTop() + (lineOffsets[index] ?? index * lineHeightPx) - window.innerHeight / 2 + lineHeightPx / 2
      window.scrollTo({ top: Math.max(0, top), behavior })
    }

    const centerMountedSentence = (id: string, behavior: ScrollBehavior, offset?: number) => {
      const spans = Array.from(articleRef.current?.querySelectorAll<HTMLElement>(`[data-sid="${CSS.escape(id)}"]`) ?? [])
      if (!spans.length) return false
      const targets = offset === undefined
        ? spans
        : spans.filter((span) => {
            const start = Number(span.dataset.sentenceOffset)
            const end = Number(span.dataset.sentenceEnd)
            return Number.isFinite(start) && Number.isFinite(end) && offset >= start && offset < end
          })
      const rects: DOMRect[] = []
      for (const target of targets.length ? targets : spans) {
        const rect = target.getBoundingClientRect()
        if (rect.height > 0) rects.push(rect)
      }
      if (!rects.length) return false
      const first = rects[0]
      const last = rects.at(-1) ?? first
      const center = (first.top + last.bottom) / 2
      const chromeTop = Math.max(
        0,
        ...Array.from(document.querySelectorAll<HTMLElement>('[data-reader-chrome="top"]')).map((el) => el.getBoundingClientRect().bottom),
      )
      const chromeBottom = Math.min(
        window.innerHeight,
        ...Array.from(document.querySelectorAll<HTMLElement>('[data-reader-chrome="bottom"]')).map((el) => el.getBoundingClientRect().top),
      )
      const visibleTop = Math.min(chromeTop + 12, window.innerHeight / 2)
      const visibleBottom = Math.max(chromeBottom - 12, visibleTop + 1)
      const viewportCenter = (visibleTop + visibleBottom) / 2
      window.scrollTo({ top: Math.max(0, window.scrollY + center - viewportCenter), behavior })
      return true
    }

    if (scrollRequest.type === 'sentence') {
      const behavior = prefersReducedMotion() ? 'auto' : (scrollRequest.behavior ?? 'auto')
      if (scrollRequest.align === 'center') {
        if (centerMountedSentence(scrollRequest.id, behavior, scrollRequest.offset)) return
        const index = sentenceLineIndex.get(scrollRequest.id)
        if (index !== undefined) {
          scrollToLineIndex(index, behavior)
          let attempts = 0
          const refine = () => {
            attempts++
            if (centerMountedSentence(scrollRequest.id, 'auto', scrollRequest.offset)) return
            if (attempts < 8) requestAnimationFrame(refine)
          }
          requestAnimationFrame(refine)
        }
        return
      }
      const target = articleRef.current?.querySelector(`[data-sid="${CSS.escape(scrollRequest.id)}"]`)
      if (target) {
        target.scrollIntoView({ behavior, block: 'center' })
        return
      }
      const index = sentenceLineIndex.get(scrollRequest.id)
      if (index !== undefined) scrollToLineIndex(index, behavior)
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

  const notifyLocationChange = useEffectEvent(onLocationChange)

  useEffect(() => {
    if (!articleRef.current) return
    let frame = 0
    let lastId = locationSentenceId
    let lastLocationCheck = 0

    const updateLocationFromViewport = () => {
      frame = 0
      const now = performance.now()
      if (now - lastLocationCheck < LOCATION_SCROLL_UPDATE_MS) return
      lastLocationCheck = now
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
        notifyLocationChange(id)
      }
    }

    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(updateLocationFromViewport)
    }

    schedule()
    let viewportFrame = 0
    const updateViewport = () => {
      viewportFrame = 0
      const next = { y: window.scrollY, h: window.innerHeight }
      setViewport((current) => (current.y === next.y && current.h === next.h ? current : next))
    }
    const scheduleViewport = () => {
      if (viewportFrame) return
      viewportFrame = requestAnimationFrame(updateViewport)
    }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('scroll', scheduleViewport, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('resize', scheduleViewport)
    updateViewport()
    return () => {
      if (frame) cancelAnimationFrame(frame)
      if (viewportFrame) cancelAnimationFrame(viewportFrame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('scroll', scheduleViewport)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('resize', scheduleViewport)
    }
  }, [lines, locationSentenceId])

  return (
    <div className="px-4 pb-52 pt-24 sm:px-6 sm:pb-40">
      <article
        ref={articleRef}
        data-highlight-theme={highlightTheme}
        className="relative isolate mx-auto text-zinc-700 dark:text-zinc-300"
        style={{
          maxWidth: `${measure}ch`,
          fontSize: `${displayFontSize}px`,
          lineHeight: displayLineHeight,
          fontFamily: SCROLL_SERIF_STACK,
        }}
      >
        <SentenceHighlight
          activeId={currentSentenceId}
          articleRef={articleRef}
          fontSize={displayFontSize}
          highlightTheme={highlightTheme}
          refreshKey={`scroll-${lines.length}-${virtual.start}-${virtual.end}-${contentWidth}-${displayFontSize}-${displayLineHeight}-${measure}`}
        />
        <WordHighlight
          activeKey={activeWord ? `${activeWord.sentenceId}:${activeWord.wordIndex}:${activeWord.isPunctuationPause ? 'pause' : 'word'}` : null}
          articleRef={articleRef}
          highlightTheme={highlightTheme}
        />

        <div className="relative z-10">
          {!linesReady && (
            <div
              role="status"
              className="mx-auto mt-[22vh] max-w-sm animate-(--animate-toast-in) text-center"
            >
              <div className="mx-auto mb-4 size-2 animate-pulse rounded-full bg-zinc-400 dark:bg-zinc-500" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Preparing scroll view…</p>
              <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-500">
                Measuring the first chapter so you can start reading before the whole book is laid out.
              </p>
            </div>
          )}
          <div style={{ height: virtual.top }} />
          {virtual.lines.map((line, offset) => {
            const li = virtual.start + offset
            const lineKey = `${line.chapterId}-${line.paragraphId}-${li}`
            const anchoredPart = line.parts.find((part) => {
              const bookmark = bookmarkBySentenceId.get(part.id)
              return bookmark ? partContainsOffset(part, bookmark.offset) : false
            })
            const anchoredBookmark = anchoredPart ? bookmarkBySentenceId.get(anchoredPart.id) : undefined
            const target =
              anchoredPart && anchoredBookmark
                ? { sentenceId: anchoredPart.id, offset: anchoredBookmark.offset, isBookmarked: true }
                : hoveredBookmarkTarget?.lineKey === lineKey
                  ? { sentenceId: hoveredBookmarkTarget.sentenceId, offset: hoveredBookmarkTarget.offset, isBookmarked: false }
                  : line.parts[0]
                    ? { sentenceId: line.parts[0].id, offset: line.parts[0].sentenceOffset, isBookmarked: false }
                    : null
            return (
            <div key={lineKey}>
              {line.chapterTitle && (
                <h1
                  data-chapter-id={line.chapterId}
                  className="mb-8 mt-16 scroll-mt-24 text-center text-xl font-semibold leading-tight tracking-tight text-zinc-900 first:mt-0 dark:text-zinc-100"
                >
                  {line.chapterTitle}
                </h1>
              )}
              <div
                className={
                  'group/line relative ' +
                  'whitespace-nowrap'
                }
                style={{ marginTop: li > 0 && line.startsParagraph && !line.startsChapter ? `${displayFontSize * displayLineHeight}px` : undefined }}
              >
              {target && (
                <BookmarkButton
                  isBookmarked={target.isBookmarked}
                  sentenceId={target.sentenceId}
                  offset={target.offset}
                  onToggle={onBookmarkToggle}
                />
              )}
              {line.parts.map((part, pi) => {
                const isActive = part.id === currentSentenceId
                const isBookmarked = bookmarkBySentenceId.has(part.id)
                return (
                  <Fragment key={`${part.id}-${pi}`}>
                    {part.leadingText ? <span aria-hidden="true">{part.leadingText.replace(/ /g, '\u00a0')}</span> : null}
                    <span
                    ref={isActive ? activeRef : null}
                    data-sid={part.id}
                    data-sentence-offset={part.sentenceOffset}
                    data-sentence-end={part.sentenceOffset + part.text.length}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (suppressNextClickRef.current) {
                        suppressNextClickRef.current = false
                        return
                      }
                      onSentenceSelect(part.id)
                    }}
                    onPointerDown={(event) => startBookmarkLongPress(event, part.id, part.sentenceOffset)}
                    onPointerMove={moveBookmarkLongPress}
                    onPointerUp={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                    onContextMenu={(event) => {
                      if (suppressNextClickRef.current) event.preventDefault()
                    }}
                    onMouseEnter={() => {
                      setHoveredBookmarkTarget({ lineKey, sentenceId: part.id, offset: part.sentenceOffset })
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSentenceSelect(part.id)
                      }
                    }}
                    className={
                      'inline-block cursor-pointer select-none rounded-sm py-1.5 box-decoration-clone transition-[background-color,color] duration-300 ease-(--ease-out-strong) hoverable:select-text ' +
                      (isBookmarked && !isActive
                        ? 'text-rose-950 dark:text-rose-100 '
                        : '') +
                      (isActive
                        ? 'text-zinc-900 dark:text-zinc-50'
                        : 'hoverable:hover:text-zinc-900 dark:hoverable:hover:text-zinc-50')
                    }
                  >
                    <span
                      className={
                        'sentence-press-feedback rounded-sm box-decoration-clone ' +
                        (pi === 0 ? 'sentence-line-start ' : '') +
                        ''
                      }
                    >
                      <HighlightedText part={part} activeWord={activeWord} isBookmarked={isBookmarked} isActive={isActive} />
                    </span>
                    </span>
                  </Fragment>
                )
              })}
              </div>
            </div>
          )})}
          <div style={{ height: virtual.bottom }} />
        </div>
      </article>
      {isUpdating && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-24 z-20 mx-auto w-fit rounded-full bg-zinc-900/85 px-3 py-1 text-[11px] font-medium text-white dark:bg-zinc-100/90 dark:text-zinc-900"
        >
          Updating layout…
        </div>
      )}
    </div>
  )
}

function BookmarkButton({
  isBookmarked,
  sentenceId,
  offset,
  onToggle,
}: {
  isBookmarked: boolean
  sentenceId: string
  offset: number
  onToggle: (id: string, offset: number) => void
}) {
  return (
    <button
      type="button"
      aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
      aria-pressed={isBookmarked}
      onClick={(event) => {
        event.stopPropagation()
        onToggle(sentenceId, offset)
      }}
      onKeyDown={(event) => event.stopPropagation()}
      className={
        'absolute -left-7 top-1/2 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full transition-[opacity,color,transform] duration-200 ease-(--ease-out-strong) hoverable:flex hoverable:group-hover/line:opacity-70 hoverable:hover:scale-105 hoverable:hover:opacity-100 ' +
        (isBookmarked
          ? 'text-rose-900 opacity-90 dark:text-rose-300'
          : 'text-zinc-500 opacity-0 dark:text-zinc-500')
      }
    >
      <Bookmark
        className="size-4"
        strokeWidth={1.8}
        fill={isBookmarked ? 'currentColor' : 'none'}
      />
    </button>
  )
}

function partContainsOffset(part: TextPart, offset: number) {
  return offset >= part.sentenceOffset && offset < part.sentenceOffset + part.text.length
}

function setPressFeedback(sentenceId: string, pressing: boolean) {
  document
    .querySelectorAll<HTMLElement>(`[data-sid="${CSS.escape(sentenceId)}"] .sentence-press-feedback`)
    .forEach((el) => el.classList.toggle('is-pressing', pressing))
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
