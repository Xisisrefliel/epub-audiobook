import { useLayoutEffect, useState, type RefObject } from 'react'

type Rect = { top: number; left: number; width: number; height: number }

type Props = {
  activeId: string | null
  articleRef: RefObject<HTMLElement | null>
  fontSize: number
  refreshKey?: string | number
}

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'
const DURATION = 220

export function SentenceHighlight({
  activeId,
  articleRef,
  fontSize,
  refreshKey,
}: Props) {
  const [rects, setRects] = useState<Rect[]>([])

  useLayoutEffect(() => {
    if (!activeId) {
      setRects([])
      return
    }
    const article = articleRef.current
    if (!article) return

    const compute = () => {
      const spans = Array.from(
        article.querySelectorAll<HTMLElement>(`[data-sid="${activeId}"]`),
      )
      if (spans.length === 0) {
        setRects([])
        return
      }
      const articleRect = article.getBoundingClientRect()
      const bandHeight = fontSize * 1.4
      const next = spans.flatMap((span) => {
        const range = document.createRange()
        range.selectNodeContents(span)
        const rects = Array.from(range.getClientRects()).map((r) => ({
          top: r.top - articleRect.top + (r.height - bandHeight) / 2,
          left: r.left - articleRect.left,
          width: r.width,
          height: bandHeight,
        }))
        range.detach()
        return rects
      })
      setRects(next)
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
      {rects.map((r, i) => (
        <div
          key={i}
          className="absolute rounded-sm bg-amber-200/70 dark:bg-amber-400/20"
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
