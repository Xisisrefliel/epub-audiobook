import { memo, useMemo } from 'react'
import { X } from 'lucide-react'
import type { Book, TocItem } from '../types'

type Props = {
  book: Book
  currentChapterIndex: number
  open: boolean
  onClose: () => void
  onSelectChapter: (index: number) => void
}

export function TableOfContents({
  book,
  currentChapterIndex,
  open,
  onClose,
  onSelectChapter,
}: Props) {
  if (!open) return null

  const toc = useMemo(
    () =>
      book.toc && book.toc.length > 0
        ? book.toc
        : book.chapters.map((chapter, index) => ({
            id: `chapter-${chapter.id}`,
            label: chapter.title,
            chapterIndex: index,
          })),
    [book],
  )

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close table of contents"
        className="absolute inset-0 bg-zinc-950/20 dark:bg-black/40"
        onClick={onClose}
      />

      <aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-sm flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-l-2xl">
        <div className="flex items-start gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Contents
            </div>
            <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {book.title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <TocList
            items={toc}
            currentChapterIndex={currentChapterIndex}
            onSelect={(index) => {
              onSelectChapter(index)
              onClose()
            }}
          />
        </nav>
      </aside>
    </div>
  )
}

const TocList = memo(function TocList({
  items,
  currentChapterIndex,
  onSelect,
  depth = 0,
}: {
  items: TocItem[]
  currentChapterIndex: number
  onSelect: (index: number) => void
  depth?: number
}) {
  return (
    <ol className={depth === 0 ? 'space-y-1' : 'mt-1 space-y-1'}>
      {items.map((item) => {
        const active = item.chapterIndex === currentChapterIndex
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.chapterIndex)}
              className={
                'w-full rounded-lg py-2 pr-3 text-left text-sm transition-colors ' +
                (active
                  ? 'bg-amber-100 text-zinc-950 dark:bg-amber-400/15 dark:text-zinc-50'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100')
              }
              style={{ paddingLeft: `${12 + depth * 16}px` }}
            >
              <span className="line-clamp-2">{item.label}</span>
            </button>
            {item.children && (
              <TocList
                items={item.children}
                currentChapterIndex={currentChapterIndex}
                onSelect={onSelect}
                depth={depth + 1}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
})
