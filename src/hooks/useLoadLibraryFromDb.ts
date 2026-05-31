import { useEffect } from 'react'
import { readLibraryFromDb } from '../storage/libraryDb'
import { normalizeLibrarySentences } from '../utils/normalizeBookSentences'
import type { Book, CounterMode } from '../types'

const REMOVED_SAMPLE_BOOK_ID = 'alice'

type StoredProgress = {
  chapterIndex?: number
  currentSentenceId?: string | null
  locationSentenceId?: string | null
  counterMode?: CounterMode
}

export function useLoadLibraryFromDb({
  activeBookStorageKey,
  markLoadedRef,
  readProgressByBook,
  onLibraryChange,
  onActiveBookIdChange,
  onBookChange,
  onChapterIndexChange,
  onCurrentSentenceIdChange,
  onLocationSentenceIdChange,
  onCounterModeChange,
}: {
  activeBookStorageKey: string
  markLoadedRef: React.MutableRefObject<boolean>
  readProgressByBook: () => Record<string, StoredProgress>
  onLibraryChange: React.Dispatch<React.SetStateAction<Book[]>>
  onActiveBookIdChange: React.Dispatch<React.SetStateAction<string | null>>
  onBookChange: React.Dispatch<React.SetStateAction<Book | null>>
  onChapterIndexChange: React.Dispatch<React.SetStateAction<number>>
  onCurrentSentenceIdChange: React.Dispatch<React.SetStateAction<string | null>>
  onLocationSentenceIdChange: React.Dispatch<React.SetStateAction<string | null>>
  onCounterModeChange: React.Dispatch<React.SetStateAction<CounterMode>>
}) {
  useEffect(() => {
    let cancelled = false
    readLibraryFromDb()
      .then((storedLibrary) => {
        if (cancelled) return
        const dbLibrary =
          normalizeLibrarySentences(storedLibrary?.filter((storedBook) => storedBook?.chapters?.length && storedBook.id !== REMOVED_SAMPLE_BOOK_ID) ?? [])
        if (!dbLibrary.length) return
        const storedActiveBookId = window.localStorage.getItem(activeBookStorageKey)
        const nextBook = dbLibrary.find((candidate) => candidate.id === storedActiveBookId) ?? dbLibrary[0] ?? null
        if (!nextBook) return
        const progress = readProgressByBook()[nextBook.id]
        const nextChapterIndex = Math.max(0, Math.min(nextBook.chapters.length - 1, progress?.chapterIndex ?? 0))
        const hasProgressLocation = progress?.locationSentenceId
          ? nextBook.chapters.some((chapter) =>
              chapter.paragraphs.some((paragraph) =>
                paragraph.sentences.some((sentence) => sentence.id === progress.locationSentenceId),
              ),
            )
          : false
        const fallbackLocationId = nextBook.chapters[nextChapterIndex]?.paragraphs[0]?.sentences[0]?.id ?? null
        onLibraryChange(dbLibrary)
        onActiveBookIdChange(nextBook.id)
        onBookChange(nextBook)
        onChapterIndexChange(nextChapterIndex)
        onCurrentSentenceIdChange(progress?.currentSentenceId ?? null)
        onLocationSentenceIdChange(hasProgressLocation ? progress?.locationSentenceId ?? null : fallbackLocationId)
        onCounterModeChange(progress?.counterMode === 'book' ? 'book' : 'chapter')
      })
      .catch((error) => console.warn('Could not load library from browser database.', error))
      .finally(() => {
        if (!cancelled) markLoadedRef.current = true
      })
    return () => {
      cancelled = true
    }
  }, [activeBookStorageKey, markLoadedRef, readProgressByBook, onActiveBookIdChange, onBookChange, onChapterIndexChange, onCounterModeChange, onCurrentSentenceIdChange, onLibraryChange, onLocationSentenceIdChange])
}
