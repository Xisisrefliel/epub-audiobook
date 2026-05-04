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
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-4 rounded-2xl border border-zinc-200/80 bg-white/85 px-4 py-2.5 shadow-lg shadow-zinc-900/5 ring-1 ring-black/[0.02] backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:shadow-black/30 dark:ring-white/[0.04]">
        <button
          type="button"
          onClick={onOpenLibrary}
          aria-label="Open library"
          title="Open library"
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Library className="h-[18px] w-[18px]" strokeWidth={2} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {chapterTitle}
          </div>
          <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {book.title} · {book.author}
          </div>
        </div>

        <ModeToggle mode={mode} onChange={onModeChange} />

        <button
          type="button"
          onClick={onOpenToc}
          aria-label="Table of contents"
          title="Table of contents"
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <List className="h-[18px] w-[18px]" strokeWidth={2} />
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Reader settings"
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
  return (
    <div className="hidden rounded-full border border-zinc-200 bg-zinc-50 p-0.5 text-xs font-medium dark:border-zinc-800 dark:bg-zinc-900 sm:flex">
      <ModeButton
        active={mode === 'scroll'}
        onClick={() => onChange('scroll')}
        label="Scroll"
      />
      <ModeButton
        active={mode === 'paginated'}
        onClick={() => onChange('paginated')}
        label="Pages"
      />
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
      className={
        active
          ? 'rounded-full bg-white px-3 py-1 text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
          : 'rounded-full px-3 py-1 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
      }
    >
      {label}
    </button>
  )
}
