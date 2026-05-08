import { useState } from 'react'
import type { Book, BookmarkMap } from '../types'

type BookState = {
  library: Book[]
  setLibrary: React.Dispatch<React.SetStateAction<Book[]>>
  activeBookId: string
  setActiveBookId: React.Dispatch<React.SetStateAction<string>>
  book: Book
  setBook: React.Dispatch<React.SetStateAction<Book>>
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
  initialActiveBookId: (library: Book[]) => string
  initialBook: (library: Book[], activeBookId: string) => Book
  initialChapterIndex: (book: Book) => number
  initialBookmarksByBook: BookmarkMap
}): BookState {
  const [library, setLibrary] = useState<Book[]>(initialLibrary)
  const [activeBookId, setActiveBookId] = useState(() => initialActiveBookId(library))
  const [book, setBook] = useState<Book>(() => initialBook(library, activeBookId))
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
