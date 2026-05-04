import { memo, useMemo } from 'react'
import { X } from 'lucide-react'
import { useBottomSheetDrag } from '../hooks/useBottomSheetDrag'
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

  const bottomSheet = useBottomSheetDrag({ open, onClose })

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
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch">
      <button
        type="button"
        aria-label="Close table of contents"
        className="absolute inset-0 bg-zinc-950/25 backdrop-blur-[1px] dark:bg-black/45"
        onClick={onClose}
      />

      <aside
        style={bottomSheet.sheetStyle}
        className={`relative flex max-h-[88dvh] w-full flex-col rounded-t-3xl border-t border-zinc-200 bg-white shadow-2xl sm:h-full sm:max-h-none sm:max-w-sm sm:rounded-l-2xl sm:rounded-tr-none sm:border-l sm:border-t-0 sm:transition-none dark:border-zinc-800 dark:bg-zinc-950 ${bottomSheet.sheetClassName}`}
      >
        <div
          {...bottomSheet.handleProps}
          className="flex touch-none cursor-grab justify-center px-6 pb-2 pt-3 active:cursor-grabbing sm:hidden"
          aria-label="Drag to close table of contents"
        >
          <div className="h-1 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="flex items-start gap-3 border-b border-zinc-200 px-5 pb-4 pt-1 sm:pt-4 dark:border-zinc-800">
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors active:bg-zinc-100 active:text-zinc-900 sm:h-8 sm:w-8 dark:active:bg-zinc-800 dark:active:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
                'w-full rounded-xl py-3 pr-3 text-left text-[15px] leading-5 transition-colors sm:rounded-lg sm:py-2 sm:text-sm ' +
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
