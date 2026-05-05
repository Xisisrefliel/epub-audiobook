import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'

type Rect = { key: string; top: number; left: number; width: number; height: number; pressing: boolean }

type Props = {
  bookmarkIds: string[]
  pressingId: string | null
  articleRef: RefObject<HTMLElement | null>
  fontSize: number
  refreshKey?: string | number
}

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'
const DURATION = 220

export function BookmarkHighlight({
  bookmarkIds,
  pressingId,
  articleRef,
  fontSize,
  refreshKey,
}: Props) {
  const [rects, setRects] = useState<Rect[]>([])
  const targetEntries = useMemo(() => {
    const next = bookmarkIds.map((id) => ({ id, pressing: false }))
    if (pressingId && !bookmarkIds.includes(pressingId)) next.push({ id: pressingId, pressing: true })
    return next
  }, [bookmarkIds, pressingId])

  useLayoutEffect(() => {
    let frame: number | null = null

    if (targetEntries.length === 0) {
      frame = requestAnimationFrame(() => setRects([]))
      return () => {
        if (frame !== null) cancelAnimationFrame(frame)
      }
    }
    const article = articleRef.current
    if (!article) {
      frame = requestAnimationFrame(() => setRects([]))
      return () => {
        if (frame !== null) cancelAnimationFrame(frame)
      }
    }

    const compute = () => {
      const articleRect = article.getBoundingClientRect()
      const bandHeight = fontSize * 1.4
      const next: Rect[] = []
      targetEntries.forEach((entry) => {
        const spans = Array.from(
          article.querySelectorAll<HTMLElement>(`[data-sid="${CSS.escape(entry.id)}"]`),
        )
        spans.forEach((span, spanIndex) => {
          const range = document.createRange()
          range.selectNodeContents(span)
          const spanRects = Array.from(range.getClientRects()).map((r, rectIndex) => ({
            key: `${entry.id}:${spanIndex}:${rectIndex}`,
            top: r.top - articleRect.top + (r.height - bandHeight) / 2,
            left: r.left - articleRect.left,
            width: r.width,
            height: bandHeight,
            pressing: entry.pressing,
          }))
          range.detach()
          next.push(...spanRects)
        })
      })
      setRects(next)
    }

    const scheduleCompute = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = null
        compute()
      })
    }

    scheduleCompute()

    const ro = new ResizeObserver(scheduleCompute)
    ro.observe(article)
    window.addEventListener('resize', scheduleCompute)
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('resize', scheduleCompute)
    }
  }, [articleRef, fontSize, refreshKey, targetEntries])

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-20">
      {rects.map((r) => (
        <div
          key={r.key}
          className={
            'absolute rounded-sm ' +
            (r.pressing ? 'bg-rose-900/18 dark:bg-rose-400/18' : 'bg-rose-900/10 dark:bg-rose-400/10')
          }
          style={{
            transform: `translate3d(${r.left}px, ${r.top}px, 0)`,
            width: r.width,
            height: r.height,
            transition: `transform ${DURATION}ms ${EASE}, width ${DURATION}ms ${EASE}, height ${DURATION}ms ${EASE}, background-color ${DURATION}ms ${EASE}`,
          }}
        />
      ))}
    </div>
  )
}
