import { BookOpen, Plus } from 'lucide-react'
import type { Book } from '../types'

type Props = {
  open: boolean
  books: Book[]
  currentBookId: string
  onClose: () => void
  onAddBook: () => void
  onSelectBook: (bookId: string) => void
}

export function BookLibrary({
  open,
  books,
  currentBookId,
  onClose,
  onAddBook,
  onSelectBook,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close library"
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <section className="absolute inset-x-3 top-20 mx-auto max-w-4xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Bookshelf</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Upload books and switch between them.</p>
          </div>
          <button
            type="button"
            onClick={onAddBook}
            className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            <Plus className="h-4 w-4" />
            Add EPUB
          </button>
        </div>

        <div className="grid max-h-[65vh] grid-cols-2 gap-4 overflow-y-auto pb-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {books.map((book) => {
            const active = book.id === currentBookId
            return (
              <button
                key={book.id}
                type="button"
                onClick={() => onSelectBook(book.id)}
                className="group rounded-2xl p-2 text-left transition hover:bg-zinc-100 data-[active=true]:bg-zinc-100 dark:hover:bg-zinc-900 dark:data-[active=true]:bg-zinc-900"
                data-active={active}
              >
                <div className="aspect-[2/3] overflow-hidden rounded-xl border border-zinc-200 bg-gradient-to-br from-zinc-100 to-zinc-300 shadow-sm dark:border-zinc-800 dark:from-zinc-800 dark:to-zinc-950">
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <BookOpen className="h-10 w-10 text-zinc-500 dark:text-zinc-400" />
                    </div>
                  )}
                </div>
                <div className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                  {book.title}
                </div>
                <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{book.author}</div>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
