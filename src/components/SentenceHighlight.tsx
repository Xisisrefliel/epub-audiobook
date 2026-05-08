import { useLayoutEffect, useReducer, type RefObject } from 'react'

type Rect = { top: number; left: number; width: number; height: number }

type Props = {
  activeId: string | null
  articleRef: RefObject<HTMLElement | null>
  fontSize: number
  refreshKey?: string | number
}

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'
const DURATION = 220

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

export function SentenceHighlight({
  activeId,
  articleRef,
  fontSize,
  refreshKey,
}: Props) {
  const [rects, dispatchRects] = useReducer((_: Rect[], next: Rect[]) => next, [])

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
      const bandHeight = fontSize * 1.18
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
        const height = Math.min(bandHeight, Math.max(fontSize, r.height))
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
      {rects.map((r) => (
        <div
          key={`${Math.round(r.left)}:${Math.round(r.top)}:${Math.round(r.width)}:${Math.round(r.height)}`}
          className="absolute rounded-sm bg-amber-200/80 shadow-[0_0_0_1px_rgba(180,83,9,0.08)_inset] dark:bg-amber-400/28 dark:shadow-[0_0_0_1px_rgba(251,191,36,0.12)_inset]"
          style={{
            transform: `translate3d(${r.left}px, ${r.top}px, 0)`,
            width: r.width,
            height: r.height,
            transition: `transform ${DURATION}ms ${EASE}, width ${DURATION}ms ${EASE}, height ${DURATION}ms ${EASE}`,
          }}
        />
      ))}
    </div>
  )
}
