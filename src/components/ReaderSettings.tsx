import { X } from 'lucide-react'
import { useBottomSheetDrag } from '../hooks/useBottomSheetDrag'
import type { Theme, ReaderMode } from '../types'

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
}: Props) {
  const bottomSheet = useBottomSheetDrag({ open, onClose })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-end sm:items-stretch" onClick={onClose}>
      <div
        className="absolute inset-0 bg-black/20 dark:bg-black/50"
        aria-hidden
      />
      <aside
        onClick={(e) => e.stopPropagation()}
        style={bottomSheet.sheetStyle}
        className={`relative max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl border-t border-zinc-200 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:h-full sm:max-h-none sm:max-w-sm sm:rounded-none sm:border-l sm:border-t-0 sm:p-6 sm:transition-none dark:border-zinc-800 dark:bg-zinc-950 ${bottomSheet.sheetClassName}`}
      >
        <div
          {...bottomSheet.handleProps}
          className="-mt-2 mb-3 flex touch-none cursor-grab justify-center px-6 pb-2 pt-1 active:cursor-grabbing sm:hidden"
          aria-label="Drag to close settings"
        >
          <div className="h-1 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            Reader settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 active:bg-zinc-100 sm:h-8 sm:w-8 dark:text-zinc-400 dark:active:bg-zinc-800"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-6">
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

          <Slider
            label="Font size"
            value={fontSize}
            min={14}
            max={28}
            step={1}
            unit="px"
            onChange={onFontSizeChange}
          />
          <Slider
            label="Line height"
            value={lineHeight}
            min={1.3}
            max={2}
            step={0.05}
            onChange={onLineHeightChange}
          />
          <Slider
            label="Measure"
            value={measure}
            min={40}
            max={90}
            step={1}
            unit="ch"
            onChange={onMeasureChange}
          />
        </div>
      </aside>
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
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
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
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
        <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {value}
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
        className="h-8 w-full accent-zinc-900 dark:accent-zinc-100"
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
  return (
    <div className="flex rounded-full border border-zinc-200 bg-zinc-50 p-0.5 text-xs font-medium dark:border-zinc-800 dark:bg-zinc-900">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={
            value === opt.value
              ? 'flex-1 rounded-full bg-white px-3 py-2 text-zinc-900 shadow-sm sm:py-1.5 dark:bg-zinc-700 dark:text-zinc-50'
              : 'flex-1 rounded-full px-3 py-2 text-zinc-600 hover:text-zinc-900 sm:py-1.5 dark:text-zinc-400 dark:hover:text-zinc-100'
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
