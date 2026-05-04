import { useRef, useState, type PointerEvent } from 'react'

type Options = {
  open: boolean
  onClose: () => void
}

const CLOSE_THRESHOLD = 96
const VELOCITY_THRESHOLD = 0.45

export function useBottomSheetDrag({ open, onClose }: Options) {
  const [dragY, setDragY] = useState(0)
  const startYRef = useRef(0)
  const startTimeRef = useRef(0)
  const draggingRef = useRef(false)

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    draggingRef.current = true
    startYRef.current = event.clientY
    startTimeRef.current = performance.now()
    setDragY(0)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return
    setDragY(Math.max(0, event.clientY - startYRef.current))
  }

  const endDrag = (event: PointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const delta = Math.max(0, event.clientY - startYRef.current)
    const elapsed = Math.max(1, performance.now() - startTimeRef.current)
    const velocity = delta / elapsed
    setDragY(0)
    if (delta > CLOSE_THRESHOLD || velocity > VELOCITY_THRESHOLD) onClose()
  }

  return {
    dragY,
    sheetStyle: open ? { transform: `translate3d(0, ${dragY}px, 0)` } : undefined,
    sheetClassName: dragY > 0 ? 'transition-none' : 'transition-transform duration-200 ease-(--ease-out-strong)',
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  }
}
