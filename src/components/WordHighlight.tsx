import { useLayoutEffect, useState, type RefObject } from 'react'

type Rect = { top: number; left: number; width: number; height: number }

type Props = {
  activeKey: string | null
  articleRef: RefObject<HTMLElement | null>
}

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'
const DURATION = 180

export function WordHighlight({ activeKey, articleRef }: Props) {
  const [rect, setRect] = useState<Rect | null>(null)

  useLayoutEffect(() => {
    if (!activeKey) {
      setRect(null)
      return
    }

    const article = articleRef.current
    if (!article) return

    const compute = () => {
      const target = article.querySelector<HTMLElement>(`[data-active-word="${CSS.escape(activeKey)}"]`)
      if (!target) {
        setRect(null)
        return
      }
      const articleRect = article.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      setRect({
        top: targetRect.top - articleRect.top,
        left: targetRect.left - articleRect.left,
        width: targetRect.width,
        height: targetRect.height,
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
          className="absolute rounded-[0.22em] bg-zinc-900/10 shadow-[0_0_0_1px_rgba(24,24,27,0.03)] dark:bg-zinc-100/15 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
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
