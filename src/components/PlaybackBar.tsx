import type { PointerEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import type { CounterMode, PaginationInfo, ReaderMode, ScrollProgressInfo } from '../types'

type Props = {
  isPlaying: boolean
  onTogglePlay: () => void
  speed: number
  onSpeedChange: (speed: number) => void
  isBuffering: boolean
  canSync: boolean
  onSync: () => void
  mode: ReaderMode
  paginationInfo: PaginationInfo | null
  scrollProgressInfo: ScrollProgressInfo | null
  counterMode: CounterMode
  onToggleCounterMode: () => void
  onProgressSeek: (pct: number) => void
}

const SPEEDS = [0.5, 1, 1.25, 1.5, 2]
const LIVE_SEEK_INTERVAL_MS = 90

export function PlaybackBar({
  isPlaying,
  onTogglePlay,
  speed,
  onSpeedChange,
  isBuffering,
  canSync,
  onSync,
  mode,
  paginationInfo,
  scrollProgressInfo,
  counterMode,
  onToggleCounterMode,
  onProgressSeek,
}: Props) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4">
      <div className="pointer-events-auto mx-auto grid max-w-3xl grid-cols-[auto_1fr_auto] items-center gap-2 rounded-2xl border border-zinc-200/80 bg-white/90 px-2.5 py-2 shadow-lg shadow-zinc-900/5 ring-1 ring-black/[0.02] backdrop-blur-md sm:flex sm:gap-3 sm:px-3 dark:border-zinc-800/80 dark:bg-zinc-900/85 dark:shadow-black/30 dark:ring-white/[0.04]">
        <button
          type="button"
          onClick={onTogglePlay}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition-transform hover:scale-105 active:scale-95 sm:h-10 sm:w-10 dark:bg-zinc-100 dark:text-zinc-900"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="h-[18px] w-[18px]" fill="currentColor" strokeWidth={0} />
          ) : (
            <Play className="h-[18px] w-[18px] translate-x-[1px]" fill="currentColor" strokeWidth={0} />
          )}
        </button>

        <div className="order-3 col-span-3 sm:order-none sm:col-span-1">
          <SpeedButtons speed={speed} onSpeedChange={onSpeedChange} />
        </div>

        {canSync && (
          <button
            type="button"
            onClick={onSync}
            className="order-2 shrink-0 rounded-full bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-white shadow-sm transition-[transform,background-color] duration-150 ease-(--ease-out-strong) hover:scale-[1.03] active:scale-[0.97] sm:order-none dark:bg-zinc-100 dark:text-zinc-900"
            aria-label="Sync to current sentence"
          >
            SYNC
          </button>
        )}

        {isBuffering && (
          <div className="hidden shrink-0 items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500 sm:flex dark:bg-zinc-800/70 dark:text-zinc-400" aria-live="polite">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 dark:bg-zinc-500" />
            Buffering
          </div>
        )}

        <ReaderProgress
          mode={mode}
          paginationInfo={paginationInfo}
          scrollProgressInfo={scrollProgressInfo}
          counterMode={counterMode}
          onToggleCounterMode={onToggleCounterMode}
          onProgressSeek={onProgressSeek}
        />
      </div>
    </div>
  )
}

function SpeedButtons({
  speed,
  onSpeedChange,
}: {
  speed: number
  onSpeedChange: (speed: number) => void
}) {
  const activeIndex = Math.max(0, SPEEDS.indexOf(speed))

  return (
    <div className="relative flex w-full shrink-0 items-center gap-0.5 rounded-full bg-zinc-100 p-0.5 shadow-[inset_0_1px_1px_rgba(0,0,0,0.04)] sm:w-auto dark:bg-zinc-800/70 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
      <span
        aria-hidden="true"
        className="absolute left-0.5 top-0.5 h-8 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.04)] transition-transform duration-100 ease-[cubic-bezier(0.23,1,0.32,1)] will-change-transform dark:bg-zinc-700 dark:shadow-[0_1px_4px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.06)]"
        style={{ width: 'calc((100% - 4px) / 5)', transform: `translate3d(${activeIndex * 100}%, 0, 0)` }}
      />
      {SPEEDS.map((s) => {
        const active = s === speed
        return (
          <button
            key={s}
            type="button"
            onClick={() => onSpeedChange(s)}
            className={
              'relative z-10 h-8 flex-1 rounded-full text-[11px] font-medium tabular-nums transition-[color,transform] duration-100 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.96] sm:w-9 ' +
              (active
                ? 'text-zinc-900 dark:text-zinc-50'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100')
            }
            aria-pressed={active}
            aria-label={`Playback speed ${s}×`}
          >
            {s}×
          </button>
        )
      })}
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
}: {
  mode: ReaderMode
  paginationInfo: PaginationInfo | null
  scrollProgressInfo: ScrollProgressInfo | null
  counterMode: CounterMode
  onToggleCounterMode: () => void
  onProgressSeek: (pct: number) => void
}) {
  const progress =
    mode === 'paginated'
      ? getPageProgress(paginationInfo, counterMode)
      : getScrollProgress(scrollProgressInfo, counterMode)
  const [dragPct, setDragPct] = useState<number | null>(null)
  const frameRef = useRef(0)
  const latestPctRef = useRef(0)
  const lastLiveSeekRef = useRef(0)
  const isDragging = dragPct !== null
  const displayPct = dragPct ?? progress.pct

  useEffect(() => {
    setDragPct(null)
  }, [mode, counterMode])

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
      className="group/progress col-span-2 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1.5 transition-colors duration-150 ease-(--ease-out-strong) hover:bg-zinc-100 data-[dragging]:bg-zinc-100 sm:col-span-1 sm:gap-3 sm:px-2 dark:hover:bg-zinc-800 dark:data-[dragging]:bg-zinc-800"
    >
      <button
        type="button"
        disabled={!progress.enabled}
        aria-label="Seek reading position"
        className="relative flex h-10 min-w-0 flex-1 cursor-pointer touch-none items-center rounded-full outline-none disabled:cursor-default"
        onPointerDown={(event) => {
          if (!progress.enabled) return
          event.currentTarget.setPointerCapture(event.pointerId)
          const pct = pctFromPointer(event)
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
        <span className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 shadow-[inset_0_1px_1px_rgba(0,0,0,0.06)] transition-[height,background-color] duration-200 ease-(--ease-out-strong) group-hover/progress:h-2 group-hover/progress:bg-zinc-300/70 group-data-[dragging]/progress:h-2.5 group-data-[dragging]/progress:bg-zinc-300/80 dark:bg-zinc-800 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] dark:group-hover/progress:bg-zinc-700 dark:group-data-[dragging]/progress:bg-zinc-700">
          <span
            className={
              'absolute inset-y-0 left-0 origin-left rounded-full bg-zinc-900 will-change-transform dark:bg-zinc-100 ' +
              'shadow-[0_0_0_1px_rgba(255,255,255,0.22)_inset,0_0_14px_rgba(24,24,27,0.18)] ' +
              'dark:shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset,0_0_18px_rgba(255,255,255,0.18)] ' +
              'group-data-[dragging]/progress:shadow-[0_0_0_1px_rgba(255,255,255,0.4)_inset,0_0_18px_rgba(24,24,27,0.28)] ' +
              'dark:group-data-[dragging]/progress:shadow-[0_0_0_1px_rgba(255,255,255,0.22)_inset,0_0_22px_rgba(255,255,255,0.28)] ' +
              (isDragging
                ? 'w-full'
                : 'w-full transition-transform duration-200 ease-(--ease-out-strong)')
            }
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, displayPct / 100))})` }}
          />
          <span
            className={
              'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 ' +
              'shadow-[0_1px_5px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.08)] ' +
              'dark:bg-zinc-100 dark:shadow-[0_1px_8px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.2)] ' +
              'transition-[opacity,transform] duration-200 ease-(--ease-out-strong) ' +
              'group-hover/progress:opacity-100 ' +
              (isDragging ? 'scale-110 opacity-100' : 'scale-[0.85]')
            }
            style={{ left: `${displayPct}%` }}
          />
        </span>
      </button>
      <button
        type="button"
        onClick={onToggleCounterMode}
        disabled={!progress.enabled}
        title={progress.enabled ? 'Toggle chapter / book progress' : undefined}
        className="shrink-0 rounded-md px-1 py-1 text-[11px] tabular-nums text-zinc-500 transition-[color,transform] duration-150 ease-(--ease-out-strong) hover:text-zinc-900 active:scale-[0.96] disabled:cursor-default disabled:active:scale-100 sm:px-1.5 sm:text-xs dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <span
          key={`${counterMode}-${progress.enabled}`}
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

function getScrollProgress(scrollProgressInfo: ScrollProgressInfo | null, counterMode: CounterMode) {
  if (!scrollProgressInfo) return { enabled: false, pct: 0, label: '—' }
  if (counterMode === 'chapter') {
    const current = scrollProgressInfo.chapterSentenceIndex + 1
    const total = scrollProgressInfo.chapterSentenceTotal
    const pct = total > 0 ? Math.round((current / total) * 100) : 0
    return {
      enabled: total > 0,
      pct,
      label: `Ch ${scrollProgressInfo.chapterIndex + 1} / ${scrollProgressInfo.chapterTotal} · ${pct}%`,
    }
  }

  const current = scrollProgressInfo.bookSentenceIndex + 1
  const total = scrollProgressInfo.bookSentenceTotal
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return {
    enabled: total > 0,
    pct,
    label: `Book · ${pct}%`,
  }
}
