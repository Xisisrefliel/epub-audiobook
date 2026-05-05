import { Bookmark, X } from 'lucide-react'
import { useBottomSheetDrag } from '../hooks/useBottomSheetDrag'

export type BookmarkMenuItem = {
  id: string
  sentence: string
  chapter: string
  pageLabel: string
}

type Props = {
  open: boolean
  bookTitle: string
  items: BookmarkMenuItem[]
  onClose: () => void
  onSelectBookmark: (sentenceId: string) => void
}

export function BookmarksMenu({
  open,
  bookTitle,
  items,
  onClose,
  onSelectBookmark,
}: Props) {
  const {
    shouldRender,
    sheetRef,
    sheetStyle,
    sheetProps,
    backdropStyle,
    handleProps,
    drawerBackdropClass,
    drawerPanelClass,
  } = useBottomSheetDrag({ open, onClose })

  if (!shouldRender) return null

  return (
    <div
      className="fixed inset-0 z-50 flex touch-none items-end justify-end overscroll-contain sm:items-stretch"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Close bookmarks"
        className={['absolute inset-0 bg-zinc-950/30 backdrop-blur-sm dark:bg-black/55', drawerBackdropClass]
          .filter(Boolean)
          .join(' ')}
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
        className={[
          'relative flex max-h-[88dvh] w-full flex-col rounded-t-3xl border-t border-zinc-200 bg-white shadow-2xl sm:h-full sm:max-h-none sm:max-w-sm sm:rounded-l-2xl sm:rounded-tr-none sm:border-l sm:border-t-0 dark:border-zinc-800 dark:bg-zinc-950',
          drawerPanelClass,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div
          {...handleProps}
          className="flex touch-none cursor-grab justify-center px-6 pb-2 pt-3 active:cursor-grabbing sm:hidden"
          aria-label="Drag to close bookmarks"
        >
          <div className="h-1 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <div className="flex items-start gap-3 border-b border-zinc-200 px-5 pb-4 pt-1 sm:pt-5 dark:border-zinc-800">
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Bookmarks
            </h2>
            <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {bookTitle}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bookmarks"
            className="control-button h-9 w-9"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div
          ref={sheetRef as React.RefObject<HTMLDivElement>}
          className="flex-1 overflow-y-auto px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          {items.length > 0 ? (
            <ol className="space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectBookmark(item.id)
                      onClose()
                    }}
                    className="group w-full rounded-2xl border border-transparent px-3 py-3 text-left transition-[background-color,border-color,transform] duration-150 ease-(--ease-out-strong) active:scale-[0.99] hoverable:hover:border-zinc-200 hoverable:hover:bg-zinc-50 dark:hoverable:hover:border-zinc-800 dark:hoverable:hover:bg-zinc-900/70"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-500">
                        {item.chapter}
                      </span>
                      <span className="shrink-0 rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-950 dark:bg-amber-400/20 dark:text-zinc-50">
                        {item.pageLabel}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-[15px] leading-6 text-zinc-700 group-hover:text-zinc-950 dark:text-zinc-300 dark:group-hover:text-zinc-50">
                      {item.sentence}
                    </p>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 px-8 text-center dark:border-zinc-800">
              <Bookmark className="mb-3 h-5 w-5 text-zinc-400 dark:text-zinc-600" strokeWidth={1.8} />
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                No bookmarks yet
              </div>
              <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Long-press a sentence to save it here.
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
