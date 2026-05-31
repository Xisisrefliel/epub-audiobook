import { Library, Plus } from 'lucide-react'

type Props = {
  onAddBook: () => void
}

export function EmptyLibraryView({ onAddBook }: Props) {
  return (
    <section className="flex min-h-screen items-center justify-center overflow-hidden px-6 py-20 text-zinc-900 dark:text-zinc-100">
      <div className="relative w-full max-w-xl">
        <div
          aria-hidden
          className="absolute -inset-20 rounded-full bg-[radial-gradient(circle_at_50%_30%,rgba(251,191,36,0.14),transparent_58%)] blur-2xl dark:bg-[radial-gradient(circle_at_50%_30%,rgba(251,191,36,0.09),transparent_58%)]"
        />
        <div className="surface-floating relative overflow-hidden px-7 py-9 text-center sm:px-10 sm:py-11">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent dark:via-amber-400/35" />
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <Library className="size-7 text-zinc-700 dark:text-zinc-300" strokeWidth={1.8} />
          </div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700/80 dark:text-amber-300/70">
            Empty bookshelf
          </p>
          <h1 className="text-balance text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Add an EPUB to begin
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Your library starts blank. Upload a book and the reader will remember your place, bookmarks, and settings.
          </p>
          <button
            type="button"
            onClick={onAddBook}
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_rgba(24,24,27,0.16)] transition-[transform,background-color] duration-150 ease-(--ease-out-strong) active:scale-[0.96] hoverable:hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:shadow-[0_8px_28px_rgba(255,255,255,0.10)] dark:hoverable:hover:bg-zinc-200"
          >
            <Plus className="size-4" />
            Add EPUB
          </button>
        </div>
      </div>
    </section>
  )
}
