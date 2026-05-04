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

  const { shouldRender, sheetRef, sheetStyle, sheetProps, backdropStyle, handleProps } =
    useBottomSheetDrag({ open, onClose })

  if (!shouldRender) return null

  return (
    <div
      className="fixed inset-0 z-50 flex touch-none items-end justify-end overscroll-contain sm:items-stretch"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Close table of contents"
        className="absolute inset-0 bg-zinc-950/30 backdrop-blur-sm dark:bg-black/55"
        style={backdropStyle}
        onClick={onClose}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-full h-[40vh] bg-white sm:hidden dark:bg-zinc-950"
        style={{ transform: sheetStyle.transform, willChange: sheetStyle.willChange }}
      />

      <aside
        style={sheetStyle}
        {...sheetProps}
        className="relative flex max-h-[88dvh] w-full flex-col rounded-t-3xl border-t border-zinc-200 bg-white shadow-2xl sm:h-full sm:max-h-none sm:max-w-sm sm:rounded-l-2xl sm:rounded-tr-none sm:border-l sm:border-t-0 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div
          {...handleProps}
          className="flex touch-none cursor-grab justify-center px-6 pb-2 pt-3 active:cursor-grabbing sm:hidden"
          aria-label="Drag to close table of contents"
        >
          <div className="h-1 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="flex items-start gap-3 border-b border-zinc-200 px-5 pb-4 pt-1 sm:pt-5 dark:border-zinc-800">
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Contents
            </h2>
            <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {book.title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="control-button h-9 w-9"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <nav
          ref={sheetRef as React.RefObject<HTMLElement>}
          className="flex-1 overflow-y-auto px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
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
                'w-full rounded-xl py-3 pr-3 text-left text-[15px] leading-5 transition-[background-color,color,transform] duration-150 ease-(--ease-out-strong) active:scale-[0.99] sm:rounded-lg sm:py-2 sm:text-sm ' +
                (active
                  ? 'bg-amber-200/70 text-zinc-950 dark:bg-amber-400/20 dark:text-zinc-50'
                  : 'text-zinc-600 hoverable:hover:bg-zinc-100 hoverable:hover:text-zinc-950 dark:text-zinc-400 dark:hoverable:hover:bg-zinc-900 dark:hoverable:hover:text-zinc-100')
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
