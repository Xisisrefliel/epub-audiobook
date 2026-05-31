import { useState } from 'react'
import type { Book, BookmarkMap } from '../types'

type BookState = {
  library: Book[]
  setLibrary: React.Dispatch<React.SetStateAction<Book[]>>
  activeBookId: string | null
  setActiveBookId: React.Dispatch<React.SetStateAction<string | null>>
  book: Book | null
  setBook: React.Dispatch<React.SetStateAction<Book | null>>
  chapterIndex: number
  setChapterIndex: React.Dispatch<React.SetStateAction<number>>
  bookmarksByBook: BookmarkMap
  setBookmarksByBook: React.Dispatch<React.SetStateAction<BookmarkMap>>
}

export function useBookState({
  initialLibrary,
  initialActiveBookId,
  initialBook,
  initialChapterIndex,
  initialBookmarksByBook,
}: {
  initialLibrary: () => Book[]
  initialActiveBookId: (library: Book[]) => string | null
  initialBook: (library: Book[], activeBookId: string | null) => Book | null
  initialChapterIndex: (book: Book | null) => number
  initialBookmarksByBook: BookmarkMap
}): BookState {
  const [library, setLibrary] = useState<Book[]>(initialLibrary)
  const [activeBookId, setActiveBookId] = useState(() => initialActiveBookId(library))
  const [book, setBook] = useState<Book | null>(() => initialBook(library, activeBookId))
  const [chapterIndex, setChapterIndex] = useState(() => initialChapterIndex(book))
  const [bookmarksByBook, setBookmarksByBook] = useState<BookmarkMap>(initialBookmarksByBook)

  return {
    library,
    setLibrary,
    activeBookId,
    setActiveBookId,
    book,
    setBook,
    chapterIndex,
    setChapterIndex,
    bookmarksByBook,
    setBookmarksByBook,
  }
}
