import { useEffect } from 'react'

/** Prevent the page behind a modal overlay from scrolling. */
export function useOverlayScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const { body } = document
    const prevOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    return () => {
      body.style.overflow = prevOverflow
    }
  }, [active])
}
