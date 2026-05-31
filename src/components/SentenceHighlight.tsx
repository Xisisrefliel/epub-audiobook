import { memo, useLayoutEffect, useReducer, type RefObject } from 'react'
import type { HighlightTheme } from '../types'
import { getSentenceBandHeight } from './highlightGeometry'

type Rect = { top: number; left: number; width: number; height: number }

type Props = {
  activeId: string | null
  articleRef: RefObject<HTMLElement | null>
  fontSize: number
  highlightTheme: HighlightTheme
  refreshKey?: string | number
}

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'
const DURATION = 220

function buildMarkerClipPath(width: number, height: number) {
  const slant = Math.min(4, Math.max(2.5, width * 0.018))
  const radius = Math.min(3.5, height * 0.35)
  return `path("M ${slant + radius} 0 L ${width - radius} 0 Q ${width} 0 ${width} ${radius} L ${width - slant} ${height - radius} Q ${width - slant} ${height} ${width - slant - radius} ${height} L ${radius} ${height} Q 0 ${height} 0 ${height - radius} L ${slant} ${radius} Q ${slant} 0 ${slant + radius} 0 Z")`
}

function mergeLineRects(rects: Rect[], maxGap: number) {
  const sorted = rects.toSorted((a, b) => (Math.abs(a.top - b.top) > 2 ? a.top - b.top : a.left - b.left))
  const merged: Rect[] = []
  for (const rect of sorted) {
    const previous = merged.at(-1)
    const sameLine = previous && Math.abs(previous.top - rect.top) < 3 && Math.abs(previous.height - rect.height) < 3
    const gap = previous ? rect.left - (previous.left + previous.width) : Infinity
    if (previous && sameLine && gap >= 0 && gap <= maxGap) {
      previous.width = rect.left + rect.width - previous.left
      previous.top = Math.min(previous.top, rect.top)
      previous.height = Math.max(previous.height, rect.height)
    } else {
      merged.push({ ...rect })
    }
  }
  return merged
}

function rectsEqual(a: Rect[], b: Rect[]) {
  if (a.length !== b.length) return false
  return a.every((rect, index) => {
    const next = b[index]
    return (
      !!next &&
      Math.abs(rect.top - next.top) < 0.1 &&
      Math.abs(rect.left - next.left) < 0.1 &&
      Math.abs(rect.width - next.width) < 0.1 &&
      Math.abs(rect.height - next.height) < 0.1
    )
  })
}

function rectsReducer(current: Rect[], next: Rect[]) {
  return rectsEqual(current, next) ? current : next
}

const SentenceHighlightImpl = function SentenceHighlight({
  activeId,
  articleRef,
  fontSize,
  highlightTheme,
  refreshKey,
}: Props) {
  const [rects, dispatchRects] = useReducer(rectsReducer, [])

  useLayoutEffect(() => {
    if (!activeId) {
      queueMicrotask(() => dispatchRects([]))
      return
    }
    const article = articleRef.current
    if (!article) return

    const compute = () => {
      const spans = Array.from(
        article.querySelectorAll<HTMLElement>(`[data-sid="${CSS.escape(activeId)}"]`),
      )
      if (spans.length === 0) {
        dispatchRects([])
        return
      }
      const articleRect = article.getBoundingClientRect()
      const horizontalOutset = fontSize * 0.12
      const next = spans.flatMap((span) => {
        const textRoot = span.querySelector<HTMLElement>('.sentence-press-feedback') ?? span
        const hasContent = (textRoot.textContent ?? '').trim().length > 0
        if (!hasContent) return []

        // Highlight the visible text wrapper, not the outer clickable span: the
        // outer span carries vertical tap padding, which makes the active band
        // look like it floats above punctuation/quotes on short lines.
        const r = textRoot.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) return []
        const height = getSentenceBandHeight(fontSize, r.height)
        return [{
          top: r.top - articleRect.top + (r.height - height) / 2,
          left: r.left - articleRect.left - horizontalOutset,
          width: r.width + horizontalOutset * 2,
          height,
        }]
      })
      dispatchRects(mergeLineRects(next, fontSize * 0.35))
    }

    compute()

    const ro = new ResizeObserver(compute)
    ro.observe(article)
    const onResize = () => compute()
    window.addEventListener('resize', onResize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [activeId, articleRef, fontSize, refreshKey])

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
    >
      {rects.map((r, index) => (
        <div
          key={index}
          className={
            highlightTheme === 'handwritten'
              ? 'reader-marker-highlight absolute'
              : 'absolute rounded-sm bg-amber-200/80 shadow-[0_0_0_1px_rgba(180,83,9,0.08)_inset] dark:bg-amber-400/28 dark:shadow-[0_0_0_1px_rgba(251,191,36,0.12)_inset]'
          }
          style={{
            transform: `translate3d(${r.left}px, ${r.top}px, 0)`,
            width: r.width,
            height: r.height,
            clipPath: highlightTheme === 'handwritten' ? buildMarkerClipPath(r.width, r.height) : undefined,
            WebkitClipPath: highlightTheme === 'handwritten' ? buildMarkerClipPath(r.width, r.height) : undefined,
            transition: `transform ${DURATION}ms ${EASE}, width ${DURATION}ms ${EASE}, height ${DURATION}ms ${EASE}`,
          }}
        />
      ))}
    </div>
  )
}

export const SentenceHighlight = memo(SentenceHighlightImpl)
