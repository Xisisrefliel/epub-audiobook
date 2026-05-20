import { interpolate } from 'flubber'
import { useEffect, useMemo, useRef } from 'react'

type Props = {
  playing: boolean
}

// Font Awesome Free v7.2.0 — https://fontawesome.com/license/free
const PLAY_PATH =
  'M187.2 100.9C174.8 94.1 159.8 94.4 147.6 101.6C135.4 108.8 128 121.9 128 136L128 504C128 518.1 135.5 531.2 147.6 538.4C159.7 545.6 174.8 545.9 187.2 539.1L523.2 355.1C536 348.1 544 334.6 544 320C544 305.4 536 291.9 523.2 284.9L187.2 100.9z'

const LEFT_PAUSE_PATH =
  'M176 96C149.5 96 128 117.5 128 144L128 496C128 522.5 149.5 544 176 544L240 544C266.5 544 288 522.5 288 496L288 144C288 117.5 266.5 96 240 96L176 96z'

const RIGHT_PAUSE_PATH =
  'M400 96C373.5 96 352 117.5 352 144L352 496C352 522.5 373.5 544 400 544L464 544C490.5 544 512 522.5 512 496L512 144C512 117.5 490.5 96 464 96L400 96z'

/** Collapsed to the play tip — right bar disappears into the triangle point. */
const COLLAPSED_PATH = 'M544 320 L544 320 L544 320 Z'

const DURATION_MS = 280

function easeOutStrong(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Material-style morph: left shape becomes the full play triangle, right bar
 * collapses into the tip; both expand into pause bars on the way back.
 */
export function PlayPauseMorph({ playing }: Props) {
  const leftRef = useRef<SVGPathElement>(null)
  const rightRef = useRef<SVGPathElement>(null)
  const progressRef = useRef(playing ? 1 : 0)
  const rafRef = useRef(0)

  const { leftInterp, rightInterp } = useMemo(
    () => ({
      leftInterp: interpolate(PLAY_PATH, LEFT_PAUSE_PATH, { maxSegmentLength: 12 }),
      rightInterp: interpolate(COLLAPSED_PATH, RIGHT_PAUSE_PATH, { maxSegmentLength: 12 }),
    }),
    [],
  )

  useEffect(() => {
    const left = leftRef.current
    const right = rightRef.current
    if (!left || !right) return

    const target = playing ? 1 : 0
    const start = progressRef.current

    const apply = (progress: number) => {
      left.setAttribute('d', leftInterp(progress))
      right.setAttribute('d', rightInterp(progress))
      right.style.opacity = progress < 0.04 ? '0' : '1'
    }

    if (prefersReducedMotion() || start === target) {
      progressRef.current = target
      apply(target)
      return
    }

    const startTime = performance.now()

    const tick = (now: number) => {
      const raw = Math.min(1, (now - startTime) / DURATION_MS)
      const progress = start + (target - start) * easeOutStrong(raw)
      progressRef.current = progress
      apply(progress)
      if (raw < 1) rafRef.current = requestAnimationFrame(tick)
    }

    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, leftInterp, rightInterp])

  const initial = playing ? 1 : 0

  return (
    <svg viewBox="0 0 640 640" className="size-[18px]" aria-hidden>
      <path ref={leftRef} fill="currentColor" d={leftInterp(initial)} />
      <path ref={rightRef} fill="currentColor" d={rightInterp(initial)} style={{ opacity: initial < 0.04 ? 0 : 1 }} />
    </svg>
  )
}
