import { useEffect, useState } from 'react'
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

const STAGGER_MS = 30
const STAGGER_BASE_MS = 60
const STAGGER_MAX_MS = 280
const EXIT_MS = 200

export function BookLibrary({
  open,
  books,
  currentBookId,
  onClose,
  onAddBook,
  onSelectBook,
}: Props) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setMounted(true)
        setClosing(false)
      })
      return
    }
    if (!mounted) return
    queueMicrotask(() => setClosing(true))
    const t = setTimeout(() => {
      setMounted(false)
      setClosing(false)
    }, EXIT_MS)
    return () => clearTimeout(t)
  }, [open, mounted])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close library"
        className={`absolute inset-0 bg-zinc-950/30 backdrop-blur-sm dark:bg-black/55 ${
          closing ? 'animate-library-backdrop-out' : 'animate-library-backdrop-in'
        }`}
        onClick={onClose}
      />
      <section
        className={`absolute inset-x-3 top-20 mx-auto max-w-4xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 sm:p-6 ${
          closing ? 'animate-library-panel-out' : 'animate-library-panel-in'
        }`}
        style={{ transformOrigin: 'top left' }}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50" style={{ textWrap: 'balance' }}>Bookshelf</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Upload books and switch between them.</p>
          </div>
          <button
            type="button"
            onClick={onAddBook}
            className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-[transform,background-color] duration-150 ease-(--ease-out-strong) active:scale-[0.96] hoverable:hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hoverable:hover:bg-zinc-200"
          >
            <Plus className="h-4 w-4" />
            Add EPUB
          </button>
        </div>

        <div className="grid max-h-[65vh] grid-cols-2 gap-4 overflow-y-auto pb-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {books.map((book, i) => {
            const active = book.id === currentBookId
            const delay = closing ? 0 : Math.min(STAGGER_BASE_MS + i * STAGGER_MS, STAGGER_MAX_MS)
            return (
              <button
                key={book.id}
                type="button"
                onClick={() => onSelectBook(book.id)}
                className={`group rounded-2xl p-2 text-left transition-[transform,background-color] duration-150 ease-(--ease-out-strong) active:scale-[0.97] hoverable:hover:bg-zinc-100 data-[active=true]:bg-zinc-100 dark:hoverable:hover:bg-zinc-900 dark:data-[active=true]:bg-zinc-900 ${
                  closing ? 'animate-library-card-out' : 'animate-library-card-in'
                }`}
                data-active={active}
                style={{ animationDelay: `${delay}ms` }}
              >
                <div className="aspect-[2/3] overflow-hidden rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-300 shadow-sm outline outline-1 -outline-offset-1 outline-black/10 transition-transform duration-300 ease-(--ease-out-strong) group-data-[active=true]:scale-[1.01] hoverable:group-hover:scale-[1.015] dark:from-zinc-800 dark:to-zinc-950 dark:outline-white/10">
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
