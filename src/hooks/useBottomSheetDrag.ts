import { useRef, useState, useEffect, useCallback, useReducer, type PointerEvent } from 'react'

type Options = {
  open: boolean
  onClose: () => void
}

const CLOSE_DISTANCE = 120
const FLING_VELOCITY = 650
const ENGAGE_THRESHOLD = 6
const VELOCITY_WINDOW_MS = 80
const DESKTOP_EXIT_MS = 200

type DesktopPresence = { mounted: boolean; closing: boolean }
type DesktopPresenceAction = { type: 'open' } | { type: 'close-start' } | { type: 'close-end' }

function desktopPresenceReducer(state: DesktopPresence, action: DesktopPresenceAction): DesktopPresence {
  switch (action.type) {
    case 'open':
      return { mounted: true, closing: false }
    case 'close-start':
      return state.mounted ? { mounted: true, closing: true } : state
    case 'close-end':
      return { mounted: false, closing: false }
  }
}

function rubberBand(delta: number, dim = 120) {
  if (!Number.isFinite(delta) || delta <= 0) return 0
  return delta * 0.55 * Math.log10(1 + delta / dim)
}

function springTo({
  from,
  to,
  stiffness = 420,
  damping = 30,
  mass = 1,
  initialVelocity = 0,
  onUpdate,
  onComplete,
}: {
  from: number
  to: number
  stiffness?: number
  damping?: number
  mass?: number
  initialVelocity?: number
  onUpdate: (value: number) => void
  onComplete?: () => void
}) {
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    onUpdate(to)
    onComplete?.()
    return () => {}
  }
  let current = from
  let velocity = Number.isFinite(initialVelocity) ? initialVelocity : 0
  let rafId: number
  let lastTime = performance.now()

  const step = (now: number) => {
    const dt = Math.min(0.064, Math.max(0.001, (now - lastTime) / 1000))
    lastTime = now

    const displacement = to - current
    const springForce = displacement * stiffness
    const dampingForce = velocity * damping
    const acceleration = (springForce - dampingForce) / mass
    velocity += acceleration * dt
    current += velocity * dt

    const isSettled = Math.abs(displacement) < 0.5 && Math.abs(velocity) < 0.5
    if (isSettled) {
      current = to
      onUpdate(to)
      onComplete?.()
    } else {
      onUpdate(current)
      rafId = requestAnimationFrame(step)
    }
  }

  rafId = requestAnimationFrame(step)
  return () => cancelAnimationFrame(rafId)
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false,
  )

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 639px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isMobile
}

type Phase = 'idle' | 'pending' | 'dragging'

export function useBottomSheetDrag({ open, onClose }: Options) {
  const isMobile = useIsMobile()
  const [shouldRender, setShouldRender] = useState(open)
  const [{ mounted: desktopMounted, closing: desktopClosing }, dispatchDesktopPresence] = useReducer(
    desktopPresenceReducer,
    open,
    (initialOpen) => ({ mounted: initialOpen, closing: false }),
  )
  const initialTranslateY = open ? 0 : typeof window !== 'undefined' ? window.innerHeight : 800
  const translateYRef = useRef(initialTranslateY)
  const [translateY, setTranslateY] = useState(initialTranslateY)
  const [backdropOpacity, setBackdropOpacity] = useState(open ? 1 : 0)
  const springCancelRef = useRef<(() => void) | null>(null)
  const phaseRef = useRef<Phase>('idle')
  const startYRef = useRef(0)
  const startTranslateYRef = useRef(0)
  const samplesRef = useRef<Array<{ t: number; y: number }>>([])
  const sheetRef = useRef<HTMLElement | null>(null)
  const closeVelocityRef = useRef(0)
  const viewportHeightRef = useRef(typeof window !== 'undefined' ? window.innerHeight : 800)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const updateVH = () => {
      viewportHeightRef.current = window.innerHeight
    }
    window.addEventListener('resize', updateVH)
    return () => window.removeEventListener('resize', updateVH)
  }, [])

  const overlayVisible = isMobile ? shouldRender : desktopMounted

  /* Drawer desktop lifecycle: delayed unmount for exit animation (same idea as BookLibrary). */
  useEffect(() => {
    if (isMobile) return
    if (open) {
      dispatchDesktopPresence({ type: 'open' })
      return
    }
    if (!desktopMounted) return
    dispatchDesktopPresence({ type: 'close-start' })
    const t = setTimeout(() => {
      if (isMountedRef.current) dispatchDesktopPresence({ type: 'close-end' })
    }, DESKTOP_EXIT_MS)
    return () => clearTimeout(t)
  }, [open, isMobile, desktopMounted])

  // Listen for Escape while overlay is visible (incl. desktop exit).
  useEffect(() => {
    if (!overlayVisible) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [overlayVisible, onClose])

  const updateVisuals = useCallback((y: number) => {
    if (!Number.isFinite(y)) return
    translateYRef.current = y
    setTranslateY(y)
    const vh = viewportHeightRef.current || 1
    const opacity = Math.max(0, Math.min(1, 1 - y / (vh * 0.5)))
    setBackdropOpacity(opacity)
  }, [])

  const startSpring = useCallback(
    (
      from: number,
      to: number,
      onComplete?: () => void,
      initialVelocity = 0,
      tuning?: { stiffness?: number; damping?: number },
    ) => {
      springCancelRef.current?.()
      const cancel = springTo({
        from,
        to,
        stiffness: tuning?.stiffness ?? (to === 0 ? 450 : 380),
        damping: tuning?.damping ?? (to === 0 ? 26 : 34),
        initialVelocity,
        onUpdate: updateVisuals,
        onComplete: () => {
          if (isMountedRef.current) onComplete?.()
        },
      })
      springCancelRef.current = cancel
    },
    [updateVisuals],
  )

  // Mobile open/close spring animations
  useEffect(() => {
    if (!isMobile) return
    if (open) {
      startSpring(translateYRef.current, 0)
    } else if (shouldRender) {
      const v = closeVelocityRef.current
      closeVelocityRef.current = 0
      startSpring(
        translateYRef.current,
        viewportHeightRef.current,
        () => {
          if (isMountedRef.current) setShouldRender(false)
        },
        v,
      )
    }
  }, [open, isMobile, shouldRender, startSpring])

  // Mount immediately when open becomes true so the open animation can play
  if (open && !shouldRender) {
    setShouldRender(true)
  }

  // Cleanup spring on unmount
  useEffect(() => {
    return () => springCancelRef.current?.()
  }, [])

  const pushSample = useCallback((t: number, y: number) => {
    const samples = samplesRef.current
    samples.push({ t, y })
    const cutoff = t - VELOCITY_WINDOW_MS * 2
    while (samples.length > 1 && samples[0].t < cutoff) samples.shift()
  }, [])

  const releaseVelocity = useCallback((nowT: number, nowY: number) => {
    const samples = samplesRef.current
    if (samples.length < 2) return 0
    const target = nowT - VELOCITY_WINDOW_MS
    let ref = samples[0]
    for (const s of samples) {
      if (s.t <= target) ref = s
      else break
    }
    const dt = nowT - ref.t
    if (dt < 8) return 0
    return ((nowY - ref.y) / dt) * 1000 // px/s, downward positive
  }, [])

  const beginTracking = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      startYRef.current = event.clientY
      startTranslateYRef.current = translateYRef.current
      samplesRef.current = [{ t: event.timeStamp, y: event.clientY }]
    },
    [],
  )

  const commitDrag = useCallback((event: PointerEvent<HTMLElement>) => {
    springCancelRef.current?.()
    phaseRef.current = 'dragging'
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some browsers throw if the pointer isn't capturable; ignore.
    }
  }, [])

  // Handle: immediate engagement (no scroll-state check)
  const onHandleDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!isMobile) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      beginTracking(event)
      commitDrag(event)
    },
    [isMobile, beginTracking, commitDrag],
  )

  // Sheet body: tentative — only engage if scroll is at top and user pulls down
  const onSheetDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!isMobile) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const scrollTop = sheetRef.current?.scrollTop ?? 0
      if (scrollTop > 0) return
      beginTracking(event)
      phaseRef.current = 'pending'
    },
    [isMobile, beginTracking],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!isMobile) return
      const phase = phaseRef.current
      if (phase === 'idle') return

      pushSample(event.timeStamp, event.clientY)
      const delta = event.clientY - startYRef.current

      if (phase === 'pending') {
        // If content scrolled or user is moving up, this is a scroll, not a drag
        const scrollTop = sheetRef.current?.scrollTop ?? 0
        if (scrollTop > 0 || delta < -ENGAGE_THRESHOLD) {
          phaseRef.current = 'idle'
          return
        }
        if (delta > ENGAGE_THRESHOLD) {
          commitDrag(event)
        } else {
          return
        }
      }

      let newTranslateY: number
      if (delta >= 0) {
        // Pulling down — rubber-banded follow (existing dismiss feel)
        newTranslateY = startTranslateYRef.current + rubberBand(delta)
      } else {
        const natural = startTranslateYRef.current + delta
        if (natural >= 0) {
          // Returning toward rest from a partially-dragged state — 1:1 follow
          newTranslateY = natural
        } else {
          // Past rest — overdrag with tighter rubber-band
          newTranslateY = -rubberBand(-natural, 80)
        }
      }
      updateVisuals(newTranslateY)
    },
    [isMobile, commitDrag, pushSample, updateVisuals],
  )

  const endDrag = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!isMobile) return
      const wasDragging = phaseRef.current === 'dragging'
      phaseRef.current = 'idle'
      if (!wasDragging) return

      pushSample(event.timeStamp, event.clientY)
      const velocity = releaseVelocity(event.timeStamp, event.clientY) // px/s
      const y = translateYRef.current

      const shouldClose =
        y > CLOSE_DISTANCE ||
        velocity > FLING_VELOCITY ||
        (y > 40 && velocity > FLING_VELOCITY * 0.5)

      if (shouldClose) {
        closeVelocityRef.current = Math.max(velocity, 600)
        onClose()
      } else {
        // Spring back home, carrying release velocity for a lively feel
        startSpring(y, 0, undefined, velocity, { stiffness: 480, damping: 26 })
      }
    },
    [isMobile, onClose, pushSample, releaseVelocity, startSpring],
  )

  const drawerBackdropClass = isMobile
    ? undefined
    : desktopClosing
      ? 'animate-drawer-backdrop-out'
      : 'animate-drawer-backdrop-in'
  const drawerPanelClass = isMobile
    ? undefined
    : desktopClosing
      ? 'animate-drawer-panel-out'
      : 'animate-drawer-panel-in'

  return {
    shouldRender: isMobile ? shouldRender : desktopMounted,
    sheetRef,
    sheetStyle: {
      transform: isMobile ? `translate3d(0, ${translateY}px, 0)` : undefined,
      willChange: isMobile ? 'transform' : undefined,
      touchAction: isMobile ? 'pan-y' : undefined,
    } as React.CSSProperties,
    backdropStyle: {
      ...(isMobile ? { opacity: backdropOpacity, willChange: 'opacity' as const } : {}),
    } as React.CSSProperties,
    drawerBackdropClass,
    drawerPanelClass,
    handleProps: {
      onPointerDown: onHandleDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    sheetProps: {
      onPointerDown: onSheetDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  }
}
