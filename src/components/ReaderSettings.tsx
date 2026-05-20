import { useCallback, useState } from 'react'
import { X } from 'lucide-react'
import { useBottomSheetDrag } from '../hooks/useBottomSheetDrag'
import type { Theme, ReaderMode } from '../types'

const SERIF_STACK = 'Georgia, Cambria, "Times New Roman", Times, serif'
const PREVIEW_TEXT =
  'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness.'

type TypographyDraft = {
  fontSize: number
  lineHeight: number
  measure: number
}

type Props = {
  open: boolean
  onClose: () => void
  fontSize: number
  onFontSizeChange: (n: number) => void
  lineHeight: number
  onLineHeightChange: (n: number) => void
  measure: number
  onMeasureChange: (n: number) => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
  mode: ReaderMode
  onModeChange: (mode: ReaderMode) => void
  speed: number
  onSpeedChange: (speed: number) => void
}

export function ReaderSettings({
  open,
  onClose,
  fontSize,
  onFontSizeChange,
  lineHeight,
  onLineHeightChange,
  measure,
  onMeasureChange,
  theme,
  onThemeChange,
  mode,
  onModeChange,
  speed,
  onSpeedChange,
}: Props) {
  const [draft, setDraft] = useState<TypographyDraft>({ fontSize, lineHeight, measure })

  const applyDraftAndClose = useCallback(() => {
    onFontSizeChange(draft.fontSize)
    onLineHeightChange(draft.lineHeight)
    onMeasureChange(draft.measure)
    onClose()
  }, [draft, onClose, onFontSizeChange, onLineHeightChange, onMeasureChange])

  const {
    shouldRender,
    sheetRef,
    sheetStyle,
    sheetProps,
    backdropStyle,
    handleProps,
    drawerBackdropClass,
    drawerPanelClass,
  } = useBottomSheetDrag({ open, onClose: applyDraftAndClose })

  if (!shouldRender) return null

  return (
    <div
      className="fixed inset-0 z-40 flex touch-none items-end justify-end overscroll-contain sm:items-stretch"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={['absolute inset-0 bg-zinc-950/30 backdrop-blur-sm dark:bg-zinc-950/55', drawerBackdropClass]
          .filter(Boolean)
          .join(' ')}
        aria-hidden
        style={backdropStyle}
        onClick={applyDraftAndClose}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-full h-[40vh] bg-white sm:hidden dark:bg-zinc-950"
        style={{ transform: sheetStyle.transform }}
      />
      <aside
        ref={sheetRef}
        style={sheetStyle}
        {...sheetProps}
        className={[
          'relative max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl border-t border-zinc-200 bg-white shadow-2xl sm:h-full sm:max-h-none sm:max-w-xs sm:rounded-l-2xl sm:rounded-tr-none sm:border-l sm:border-t-0 dark:border-zinc-800 dark:bg-zinc-950',
          drawerPanelClass,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div
          {...handleProps}
          className="flex touch-none cursor-grab justify-center px-6 pb-2 pt-3 active:cursor-grabbing sm:hidden"
          aria-label="Drag to close settings"
        >
          <div className="size-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="flex items-start gap-3 border-b border-zinc-200 px-5 pb-4 pt-1 sm:pt-5 dark:border-zinc-800">
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Reader settings
            </h2>
            <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              Layout, theme, and typography
            </div>
          </div>
          <button
            type="button"
            onClick={applyDraftAndClose}
            className="control-button size-9"
            aria-label="Close settings"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-6 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:pt-4">
          <Group label="Typography">
            <TypographyPreview
              fontSize={draft.fontSize}
              lineHeight={draft.lineHeight}
              measure={draft.measure}
            />
            <div className="space-y-5">
              <Slider
                label="Font size"
                value={draft.fontSize}
                min={14}
                max={28}
                step={1}
                unit="px"
                onChange={(fontSize) => setDraft((current) => ({ ...current, fontSize }))}
              />
              <Slider
                label="Line height"
                value={draft.lineHeight}
                min={1.3}
                max={2}
                step={0.05}
                onChange={(lineHeight) => setDraft((current) => ({ ...current, lineHeight }))}
              />
              <Slider
                label="Measure"
                value={draft.measure}
                min={40}
                max={90}
                step={1}
                unit="ch"
                onChange={(measure) => setDraft((current) => ({ ...current, measure }))}
              />
            </div>
          </Group>

          <Group label="Layout">
            <Segmented
              options={[
                { value: 'scroll', label: 'Scroll' },
                { value: 'paginated', label: 'Pages' },
              ]}
              value={mode}
              onChange={(v) => onModeChange(v as ReaderMode)}
            />
          </Group>

          <Group label="Theme">
            <Segmented
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' },
              ]}
              value={theme}
              onChange={(v) => onThemeChange(v as Theme)}
            />
          </Group>

          <Group label="Playback speed">
            <Segmented
              options={[
                { value: '0.5', label: '0.5×' },
                { value: '1', label: '1×' },
                { value: '1.25', label: '1.25×' },
                { value: '1.5', label: '1.5×' },
                { value: '2', label: '2×' },
              ]}
              value={String(speed)}
              onChange={(v) => onSpeedChange(Number(v))}
            />
          </Group>
        </div>
      </aside>
    </div>
  )
}

function TypographyPreview({
  fontSize,
  lineHeight,
  measure,
}: {
  fontSize: number
  lineHeight: number
  measure: number
}) {
  return (
    <div className="mb-3 rounded-lg border border-zinc-200/80 bg-zinc-50/80 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
      <p
        className="line-clamp-2 text-pretty text-zinc-900 dark:text-zinc-100"
        style={{
          fontFamily: SERIF_STACK,
          fontSize: `${fontSize}px`,
          lineHeight,
          maxWidth: `${measure}ch`,
        }}
      >
        {PREVIEW_TEXT}
      </p>
    </div>
  )
}

function Group({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-500">
        {label}
      </div>
      {children}
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (n: number) => void
}) {
  const display = Number.isInteger(step) ? Math.round(value) : Math.round(value * 100) / 100
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
        <span
          key={display}
          className="inline-block animate-(--animate-label-in) text-xs tabular-nums text-zinc-500 dark:text-zinc-400"
        >
          {display}
          {unit ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range-input"
        aria-label={label}
      />
    </div>
  )
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div className="relative flex rounded-full border border-zinc-200 bg-zinc-50 p-0.5 text-xs font-medium dark:border-zinc-800 dark:bg-zinc-950">
      <span
        aria-hidden
        className="absolute left-0.5 top-0.5 bottom-0.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.04)] transition-transform duration-200 ease-(--ease-out-strong) dark:bg-zinc-900 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translate3d(${activeIndex * 100}%, 0, 0)`,
        }}
      />
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={
              'relative z-10 flex-1 rounded-full px-3 py-2 transition-[color,transform] duration-150 ease-(--ease-out-strong) active:scale-[0.97] sm:py-1.5 ' +
              (active
                ? 'text-zinc-900 dark:text-zinc-50'
                : 'text-zinc-500 hoverable:hover:text-zinc-900 dark:text-zinc-400 dark:hoverable:hover:text-zinc-100')
            }
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
