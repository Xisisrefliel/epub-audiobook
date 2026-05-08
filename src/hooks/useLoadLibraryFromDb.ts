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
  setLibrary,
  setActiveBookId,
  setBook,
  setChapterIndex,
  setCurrentSentenceId,
  setLocationSentenceId,
  setCounterMode,
}: {
  activeBookStorageKey: string
  markLoadedRef: React.MutableRefObject<boolean>
  readProgressByBook: () => Record<string, StoredProgress>
  setLibrary: React.Dispatch<React.SetStateAction<Book[]>>
  setActiveBookId: React.Dispatch<React.SetStateAction<string>>
  setBook: React.Dispatch<React.SetStateAction<Book>>
  setChapterIndex: React.Dispatch<React.SetStateAction<number>>
  setCurrentSentenceId: React.Dispatch<React.SetStateAction<string | null>>
  setLocationSentenceId: React.Dispatch<React.SetStateAction<string | null>>
  setCounterMode: React.Dispatch<React.SetStateAction<CounterMode>>
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
        setLibrary(nextLibrary)
        setActiveBookId(nextBook.id)
        setBook(nextBook)
        setChapterIndex(nextChapterIndex)
        setCurrentSentenceId(progress?.currentSentenceId ?? null)
        setLocationSentenceId(hasProgressLocation ? progress?.locationSentenceId ?? null : fallbackLocationId)
        setCounterMode(progress?.counterMode === 'book' ? 'book' : 'chapter')
      })
      .catch((error) => console.warn('Could not load library from browser database.', error))
      .finally(() => {
        if (!cancelled) markLoadedRef.current = true
      })
    return () => {
      cancelled = true
    }
  }, [activeBookStorageKey, markLoadedRef, readProgressByBook, setActiveBookId, setBook, setChapterIndex, setCounterMode, setCurrentSentenceId, setLibrary, setLocationSentenceId])
}
