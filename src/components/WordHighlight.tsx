import { useLayoutEffect, useReducer, type RefObject } from 'react'

type Rect = { top: number; left: number; width: number; height: number }

type Props = {
  activeKey: string | null
  articleRef: RefObject<HTMLElement | null>
}

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'
const DURATION = 180

export function WordHighlight({ activeKey, articleRef }: Props) {
  const [rect, dispatchRect] = useReducer((_: Rect | null, next: Rect | null) => next, null)

  useLayoutEffect(() => {
    if (!activeKey) {
      queueMicrotask(() => dispatchRect(null))
      return
    }

    const article = articleRef.current
    if (!article) return

    const compute = () => {
      const target = article.querySelector<HTMLElement>(`[data-active-word="${CSS.escape(activeKey)}"]`)
      if (!target) {
        dispatchRect(null)
        return
      }
      const articleRect = article.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(target)
      const textRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)
      range.detach()
      const targetRect = textRects[0] ?? target.getBoundingClientRect()
      const fontSize = Number.parseFloat(window.getComputedStyle(target).fontSize) || targetRect.height
      const verticalInset = fontSize * 0.08
      dispatchRect({
        top: targetRect.top - articleRect.top + verticalInset,
        left: targetRect.left - articleRect.left,
        width: targetRect.width,
        height: Math.min(fontSize * 1.18, Math.max(fontSize, targetRect.height - verticalInset * 2)),
      })
    }

    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(article)
    window.addEventListener('resize', compute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [activeKey, articleRef])

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      {rect && (
        <div
          className="absolute rounded-[0.22em] bg-zinc-950/14 shadow-[0_0_0_1px_rgba(24,24,27,0.08)_inset] dark:bg-white/24 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset]"
          style={{
            transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
            width: rect.width,
            height: rect.height,
            transition: `transform ${DURATION}ms ${EASE}, width ${DURATION}ms ${EASE}, height ${DURATION}ms ${EASE}, opacity ${DURATION}ms ${EASE}`,
          }}
        />
      )}
    </div>
  )
}
