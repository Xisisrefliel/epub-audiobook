import { useEffect } from 'react'
import { sampleBook } from '../data/sampleChapter'
import { readLibraryFromDb } from '../storage/libraryDb'
import type { Book, CounterMode } from '../types'

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
  onActiveBookIdChange: React.Dispatch<React.SetStateAction<string>>
  onBookChange: React.Dispatch<React.SetStateAction<Book>>
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
        const dbLibrary = storedLibrary?.filter((storedBook) => storedBook?.chapters?.length) ?? []
        if (!dbLibrary.length) return
        const nextLibrary = dbLibrary.some((storedBook) => storedBook.id === sampleBook.id)
          ? dbLibrary
          : [sampleBook, ...dbLibrary]
        const storedActiveBookId = window.localStorage.getItem(activeBookStorageKey)
        const nextBook = nextLibrary.find((candidate) => candidate.id === storedActiveBookId) ?? nextLibrary[0] ?? sampleBook
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
        onLibraryChange(nextLibrary)
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
