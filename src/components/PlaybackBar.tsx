import type { PointerEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { CornerUpLeft, Pause, Play } from 'lucide-react'
import type { CounterMode, PaginationInfo, ReaderMode, ScrollProgressInfo } from '../types'

type PlaybackState = 'playing' | 'paused'

type PlaybackControls = {
  state: PlaybackState
  buffering: boolean
  onToggle: () => void
}

type NavigationControls = {
  canGoBack: boolean
  onGoBack: () => void
  canSync: boolean
  onSync: () => void
}

type ProgressControls = {
  mode: ReaderMode
  paginationInfo: PaginationInfo | null
  scrollProgressInfo: ScrollProgressInfo | null
  counterMode: CounterMode
  onToggleCounterMode: () => void
  onSeek: (pct: number) => void
}

type Props = {
  playback: PlaybackControls
  navigation: NavigationControls
  progress: ProgressControls
}

const LIVE_SEEK_INTERVAL_MS = 90

export function PlaybackBar({ playback, navigation, progress }: Props) {
  const isPlaying = playback.state === 'playing'
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const root = document.documentElement
    const update = () => {
      const h = el.getBoundingClientRect().height
      root.style.setProperty('--playback-bar-height', `${Math.ceil(h)}px`)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--playback-bar-height')
    }
  }, [])

  return (
    <div ref={wrapperRef} data-reader-chrome="bottom" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4">
      <div className="surface-floating pointer-events-auto mx-auto flex max-w-3xl flex-col gap-1.5 px-2.5 py-2 sm:flex-row sm:items-center sm:gap-3 sm:px-3">
        <div className="flex items-center gap-2 sm:contents">
          <button
            type="button"
            onClick={playback.onToggle}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition-transform duration-150 ease-(--ease-out-strong) active:scale-[0.94] dark:bg-zinc-50 dark:text-zinc-950"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="size-[18px]" fill="currentColor" strokeWidth={0} />
            ) : (
              <Play className="size-[18px] translate-x-[1px]" fill="currentColor" strokeWidth={0} />
            )}
          </button>

          <button
            type="button"
            onClick={navigation.onGoBack}
            disabled={!navigation.canGoBack}
            className="control-button size-10 shrink-0 disabled:cursor-default disabled:opacity-35 disabled:active:scale-100"
            aria-label="Go back to previous reading location"
            title="Go back"
          >
            <CornerUpLeft className="size-[18px]" strokeWidth={2} />
          </button>

          {navigation.canSync && (
            <button
              type="button"
              onClick={navigation.onSync}
              className="ml-auto h-9 rounded-full border border-zinc-200/80 px-3 text-[10px] font-semibold tracking-[0.12em] text-zinc-800 transition-[background-color,transform,color] duration-150 ease-(--ease-out-strong) animate-(--animate-toast-in) active:scale-[0.96] sm:hidden dark:border-zinc-800 dark:text-zinc-100"
              aria-label="Sync to current sentence"
            >
              SYNC
            </button>
          )}
        </div>

        {navigation.canSync && (
          <button
            type="button"
            onClick={navigation.onSync}
            className="hidden shrink-0 rounded-full bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-white shadow-sm transition-[transform,background-color] duration-150 ease-(--ease-out-strong) animate-(--animate-toast-in) active:scale-[0.96] hoverable:hover:bg-zinc-700 sm:block dark:bg-zinc-50 dark:text-zinc-950 dark:hoverable:hover:bg-white"
            aria-label="Sync to current sentence"
          >
            SYNC
          </button>
        )}

        {playback.buffering && (
          <div className="hidden shrink-0 items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500 sm:flex dark:bg-zinc-900 dark:text-zinc-400" aria-live="polite">
            <span className="size-1.5 animate-pulse rounded-full bg-zinc-400 dark:bg-zinc-500" />
            Buffering
          </div>
        )}

        <ReaderProgress
          mode={progress.mode}
          paginationInfo={progress.paginationInfo}
          scrollProgressInfo={progress.scrollProgressInfo}
          counterMode={progress.counterMode}
          onToggleCounterMode={progress.onToggleCounterMode}
          onProgressSeek={progress.onSeek}
          className="order-2 sm:order-none"
        />
      </div>
    </div>
  )
}

function ReaderProgress({
  mode,
  paginationInfo,
  scrollProgressInfo,
  counterMode,
  onToggleCounterMode,
  onProgressSeek,
  className = '',
}: {
  mode: ReaderMode
  paginationInfo: PaginationInfo | null
  scrollProgressInfo: ScrollProgressInfo | null
  counterMode: CounterMode
  onToggleCounterMode: () => void
  onProgressSeek: (pct: number) => void
  className?: string
}) {
  const effectiveCounterMode = mode === 'scroll' ? 'book' : counterMode
  const progress =
    mode === 'paginated'
      ? getPageProgress(paginationInfo, effectiveCounterMode)
      : getScrollProgress(scrollProgressInfo)
  const progressContext = `${mode}-${effectiveCounterMode}`
  const [dragPct, setDragPct] = useState<number | null>(null)
  const [dragContext, setDragContext] = useState(progressContext)
  const frameRef = useRef(0)
  const latestPctRef = useRef(0)
  const lastLiveSeekRef = useRef(0)
  const isDragging = dragPct !== null && dragContext === progressContext
  const displayPct = dragPct ?? progress.pct
  const displayProgressPct = isDragging ? displayPct : progress.pct

  const pctFromPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  }

  const previewFromPointer = (event: PointerEvent<HTMLButtonElement>, liveSeek = false) => {
    latestPctRef.current = pctFromPointer(event)
    if (!frameRef.current) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0
        setDragPct(latestPctRef.current * 100)
      })
    }

    if (!liveSeek) return
    const now = performance.now()
    if (now - lastLiveSeekRef.current < LIVE_SEEK_INTERVAL_MS) return
    lastLiveSeekRef.current = now
    onProgressSeek(latestPctRef.current)
  }

  const commitSeek = (event: PointerEvent<HTMLButtonElement>) => {
    const pct = pctFromPointer(event)
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
    setDragPct(null)
    lastLiveSeekRef.current = performance.now()
    onProgressSeek(pct)
  }

  return (
    <div
      data-dragging={isDragging || undefined}
      className={`group/progress flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1.5 transition-colors duration-150 ease-(--ease-out-strong) hoverable:hover:bg-zinc-100 data-[dragging]:bg-zinc-100 sm:gap-3 sm:px-2 dark:hoverable:hover:bg-zinc-900 dark:data-[dragging]:bg-zinc-900 ${className}`}
    >
      <div className="relative flex min-w-0 flex-1">
        <button
          type="button"
          disabled={!progress.enabled}
          aria-label="Seek reading position"
          className="relative flex h-10 min-w-0 flex-1 cursor-pointer touch-none items-center rounded-full outline-none disabled:cursor-default"
          onPointerDown={(event) => {
            if (!progress.enabled) return
            event.currentTarget.setPointerCapture(event.pointerId)
            const pct = pctFromPointer(event)
            setDragContext(progressContext)
            latestPctRef.current = pct
            lastLiveSeekRef.current = performance.now()
            setDragPct(pct * 100)
            onProgressSeek(pct)
          }}
          onPointerMove={(event) => {
            if (!progress.enabled || event.buttons !== 1) return
            previewFromPointer(event, true)
          }}
          onPointerUp={(event) => {
            if (!progress.enabled) return
            commitSeek(event)
          }}
          onPointerCancel={() => setDragPct(null)}
        >
          <span className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 shadow-[inset_0_1px_1px_rgba(0,0,0,0.06)] transition-[height,background-color] duration-200 ease-(--ease-out-strong) hoverable:group-hover/progress:h-2 hoverable:group-hover/progress:bg-zinc-300/70 group-data-[dragging]/progress:h-2.5 group-data-[dragging]/progress:bg-zinc-300/80 dark:bg-zinc-950 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)] dark:hoverable:group-hover/progress:bg-zinc-950 dark:group-data-[dragging]/progress:bg-zinc-950">
          <span
            className={
              'absolute inset-y-0 left-0 origin-left rounded-full bg-zinc-900 will-change-transform dark:bg-zinc-50 ' +
              'shadow-[0_0_0_1px_rgba(255,255,255,0.22)_inset,0_0_14px_rgba(24,24,27,0.18)] ' +
              'dark:shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset,0_0_18px_rgba(255,255,255,0.18)] ' +
              'group-data-[dragging]/progress:shadow-[0_0_0_1px_rgba(255,255,255,0.4)_inset,0_0_18px_rgba(24,24,27,0.28)] ' +
              'dark:group-data-[dragging]/progress:shadow-[0_0_0_1px_rgba(255,255,255,0.22)_inset,0_0_22px_rgba(255,255,255,0.28)] ' +
              (isDragging
                ? 'w-full'
                : 'w-full transition-transform duration-200 ease-(--ease-out-strong)')
            }
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, displayProgressPct / 100))})` }}
          />
          <span
            className={
              'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 ' +
              'shadow-[0_1px_5px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.08)] ' +
              'dark:bg-zinc-100 dark:shadow-[0_1px_8px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.2)] ' +
              'transition-[opacity,transform] duration-200 ease-(--ease-out-strong) ' +
              'hoverable:group-hover/progress:opacity-100 ' +
              (isDragging ? 'scale-110 opacity-100' : 'scale-[0.85]')
            }
            style={{ left: `${displayProgressPct}%` }}
          />
          </span>
        </button>
      </div>
      <button
        type="button"
        onClick={mode === 'paginated' ? onToggleCounterMode : undefined}
        aria-label={mode === 'paginated' ? 'Toggle chapter / book progress' : 'Book progress'}
        disabled={!progress.enabled}
        title={progress.enabled && mode === 'paginated' ? 'Toggle chapter / book progress' : undefined}
        className={
          'shrink-0 rounded-md px-1 py-1 text-[11px] tabular-nums text-zinc-500 transition-[color,transform] duration-150 ease-(--ease-out-strong) disabled:cursor-default disabled:active:scale-100 sm:px-1.5 sm:text-xs dark:text-zinc-400 ' +
          (mode === 'paginated'
            ? 'active:scale-[0.96] hoverable:hover:text-zinc-900 dark:hoverable:hover:text-zinc-100'
            : 'cursor-default')
        }
      >
        <span
          key={`${effectiveCounterMode}-${progress.enabled}`}
          aria-live="polite"
          className="inline-block animate-(--animate-label-in)"
        >
          {progress.label}
        </span>
      </button>
    </div>
  )
}

function getPageProgress(paginationInfo: PaginationInfo | null, counterMode: CounterMode) {
  const enabled = !!paginationInfo && paginationInfo.totalPages > 0
  if (!enabled) return { enabled: false, pct: 0, label: '—' }
  const current = counterMode === 'chapter' ? paginationInfo.chapterPageIndex + 1 : paginationInfo.pageIndex + 1
  const total = counterMode === 'chapter' ? paginationInfo.chapterTotal : paginationInfo.totalPages
  return {
    enabled: total > 0,
    pct: total > 0 ? (current / total) * 100 : 0,
    label: `${current} / ${total} ${counterMode === 'chapter' ? 'chapter pages' : 'pages'}`,
  }
}

function getScrollProgress(scrollProgressInfo: ScrollProgressInfo | null) {
  if (!scrollProgressInfo) return { enabled: false, pct: 0, label: '—' }
  const current = scrollProgressInfo.bookSentenceIndex + 1
  const total = scrollProgressInfo.bookSentenceTotal
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return {
    enabled: total > 0,
    pct,
    label: `Book · ${pct}%`,
  }
}
