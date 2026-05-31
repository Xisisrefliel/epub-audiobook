import { useLayoutEffect, useReducer, type RefObject } from 'react'
import type { HighlightTheme } from '../types'
import { getWordBandHeight } from './highlightGeometry'

type Rect = { top: number; left: number; width: number; height: number }

type Props = {
  activeKey: string | null
  articleRef: RefObject<HTMLElement | null>
  highlightTheme: HighlightTheme
}

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'
const HANDWRITTEN_DURATION = 240
const MODERN_DURATION = 180
const SAME_LINE_CENTER_THRESHOLD_PX = 14
const HORIZONTAL_OUTSET_PX = 2

function getCenterY(rect: Rect) {
  return rect.top + rect.height / 2
}

function mergeLineRects(rects: Rect[]) {
  const sorted = rects.toSorted((a, b) => {
    const centerDelta = getCenterY(a) - getCenterY(b)
    return Math.abs(centerDelta) > SAME_LINE_CENTER_THRESHOLD_PX ? centerDelta : a.left - b.left
  })
  const merged: Rect[] = []
  for (const rect of sorted) {
    const previous = merged.at(-1)
    const sameLine = previous && Math.abs(getCenterY(previous) - getCenterY(rect)) <= SAME_LINE_CENTER_THRESHOLD_PX
    if (previous && sameLine) {
      const right = Math.max(previous.left + previous.width, rect.left + rect.width)
      previous.left = Math.min(previous.left, rect.left)
      previous.top = Math.min(previous.top, rect.top)
      previous.width = right - previous.left
      previous.height = Math.max(previous.height, rect.height)
    } else {
      merged.push({ ...rect })
    }
  }
  return merged
}

function getUnderlineRect(textRect: DOMRect, articleRect: DOMRect, right: number): Rect | null {
  const left = textRect.left - HORIZONTAL_OUTSET_PX
  const width = right + HORIZONTAL_OUTSET_PX - left
  if (width <= 0 || textRect.height <= 0) return null
  return {
    top: textRect.bottom - articleRect.top - Math.max(3, textRect.height * 0.12),
    left: left - articleRect.left,
    width,
    height: Math.max(6, textRect.height * 0.28),
  }
}

export function WordHighlight({ activeKey, articleRef, highlightTheme }: Props) {
  const [rects, dispatchRects] = useReducer((_: Rect[], next: Rect[]) => next, [])

  useLayoutEffect(() => {
    if (!activeKey) {
      queueMicrotask(() => dispatchRects([]))
      return
    }

    const article = articleRef.current
    if (!article) return

    const compute = () => {
      const target = article.querySelector<HTMLElement>(`[data-active-word="${CSS.escape(activeKey)}"]`)
      if (highlightTheme === 'modern') {
        if (!target) {
          dispatchRects([])
          return
        }

        const articleRect = article.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(target)
        const textRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)
        range.detach()
        const targetRect = textRects[0] ?? target.getBoundingClientRect()
        const fontSize = Number.parseFloat(window.getComputedStyle(target).fontSize) || targetRect.height
        const height = getWordBandHeight(fontSize, targetRect.height)
        dispatchRects([
          {
            top: targetRect.top - articleRect.top + (targetRect.height - height) / 2,
            left: targetRect.left - articleRect.left,
            width: targetRect.width,
            height,
          },
        ])
        return
      }

      const sentenceId = activeKey.split(':')[0]
      const sentenceParts = Array.from(article.querySelectorAll<HTMLElement>(`[data-sid="${CSS.escape(sentenceId)}"]`))
      const targetPart = target?.closest<HTMLElement>('[data-sid]')

      if (!target || !targetPart || sentenceParts.length === 0) {
        dispatchRects([])
        return
      }

      const articleRect = article.getBoundingClientRect()
      const next: Rect[] = []

      for (const part of sentenceParts) {
        const textRoot = part.querySelector<HTMLElement>('.sentence-press-feedback') ?? part
        const textRect = textRoot.getBoundingClientRect()
        if (part === targetPart) {
          const targetRect = target.getBoundingClientRect()
          const rect = getUnderlineRect(textRect, articleRect, Math.min(textRect.right, targetRect.right))
          if (rect) next.push(rect)
          break
        } else {
          const rect = getUnderlineRect(textRect, articleRect, textRect.right)
          if (rect) next.push(rect)
        }
      }

      dispatchRects(mergeLineRects(next))
    }

    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(article)
    window.addEventListener('resize', compute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [activeKey, articleRef, highlightTheme])

  return (
    <div
      aria-hidden
      className={highlightTheme === 'handwritten' ? 'pointer-events-none absolute inset-0 z-20' : 'pointer-events-none absolute inset-0 z-0'}
    >
      {highlightTheme === 'handwritten'
        ? rects.map((rect, index) => (
            <svg
              key={index}
              className="active-progress-pen-stroke"
              preserveAspectRatio="none"
              viewBox="0 0 100 10"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
                width: rect.width,
                height: rect.height,
                transition: `transform ${HANDWRITTEN_DURATION}ms ${EASE}, width ${HANDWRITTEN_DURATION}ms ${EASE}, height ${HANDWRITTEN_DURATION}ms ${EASE}`,
              }}
            >
              <path d="M1 7 Q 20 2, 45 6 T 90 5 T 99 4" pathLength="100" />
            </svg>
          ))
        : rects.map((rect, index) => (
            <div
              key={index}
              className="absolute rounded-[0.18em] bg-zinc-950/16 shadow-[0_0_0_1px_rgba(24,24,27,0.08)_inset] dark:bg-white/24 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset]"
              style={{
                transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
                width: rect.width,
                height: rect.height,
                transition: `transform ${MODERN_DURATION}ms ${EASE}, width ${MODERN_DURATION}ms ${EASE}, height ${MODERN_DURATION}ms ${EASE}, opacity ${MODERN_DURATION}ms ${EASE}`,
              }}
            />
          ))}
    </div>
  )
}
