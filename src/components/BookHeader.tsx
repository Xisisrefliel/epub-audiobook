import { Library, List, Settings } from 'lucide-react'
import type { Book, Chapter, ReaderMode } from '../types'
import { getChapterDisplayTitle } from '../utils/chapterTitle'

type Props = {
  book: Book
  chapter: Chapter
  mode: ReaderMode
  onModeChange: (mode: ReaderMode) => void
  onOpenSettings: () => void
  onOpenLibrary: () => void
  onOpenToc: () => void
}

export function BookHeader({
  book,
  chapter,
  mode,
  onModeChange,
  onOpenSettings,
  onOpenLibrary,
  onOpenToc,
}: Props) {
  const chapterIndex = Math.max(0, book.chapters.findIndex((ch) => ch.id === chapter.id))
  const chapterTitle = getChapterDisplayTitle(book, chapterIndex)

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4 sm:pt-4">
      <div className="surface-floating pointer-events-auto mx-auto flex max-w-3xl items-center gap-2 px-2.5 py-2 sm:gap-4 sm:px-4 sm:py-2.5">
        <button
          type="button"
          onClick={onOpenLibrary}
          aria-label="Open library"
          title="Open library"
          className="control-button h-9 w-9 sm:h-9 sm:w-9"
        >
          <Library className="h-[18px] w-[18px]" strokeWidth={2} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-5 text-zinc-900 sm:text-sm dark:text-zinc-100">
            {chapterTitle}
          </div>
          <div className="truncate text-[11px] leading-4 text-zinc-500 sm:text-xs dark:text-zinc-400">
            {book.title} · {book.author}
          </div>
        </div>

        <ModeToggle mode={mode} onChange={onModeChange} />

        <button
          type="button"
          onClick={onOpenToc}
          aria-label="Table of contents"
          title="Table of contents"
          className="control-button h-9 w-9 sm:h-9 sm:w-9"
        >
          <List className="h-[18px] w-[18px]" strokeWidth={2} />
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Reader settings"
          className="control-button h-9 w-9 sm:h-9 sm:w-9"
        >
          <Settings className="h-[18px] w-[18px]" strokeWidth={2} />
        </button>
      </div>
    </header>
  )
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: ReaderMode
  onChange: (mode: ReaderMode) => void
}) {
  const activeIndex = mode === 'scroll' ? 0 : 1
  return (
    <div className="relative hidden rounded-full border border-zinc-200 bg-zinc-50 p-0.5 text-xs font-medium dark:border-zinc-800 dark:bg-zinc-900 sm:flex">
      <span
        aria-hidden
        className="absolute left-0.5 top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.04)] transition-transform duration-200 ease-(--ease-out-strong) will-change-transform dark:bg-zinc-700 dark:shadow-[0_1px_4px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.06)]"
        style={{ transform: `translate3d(${activeIndex * 100}%, 0, 0)` }}
      />
      <ModeButton active={mode === 'scroll'} onClick={() => onChange('scroll')} label="Scroll" />
      <ModeButton active={mode === 'paginated'} onClick={() => onChange('paginated')} label="Pages" />
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'relative z-10 rounded-full px-3 py-1 transition-[color,transform] duration-150 ease-(--ease-out-strong) active:scale-[0.96] ' +
        (active
          ? 'text-zinc-900 dark:text-zinc-50'
          : 'text-zinc-500 hoverable:hover:text-zinc-900 dark:text-zinc-400 dark:hoverable:hover:text-zinc-100')
      }
    >
      {label}
    </button>
  )
}
