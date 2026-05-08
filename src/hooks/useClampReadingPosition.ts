import { useEffect } from 'react'
import type { Book } from '../types'

export function useClampReadingPosition({
  book,
  sentences,
  setChapterIndex,
  setCurrentSentenceId,
  setLocationSentenceId,
}: {
  book: Book
  sentences: { id: string }[]
  setChapterIndex: React.Dispatch<React.SetStateAction<number>>
  setCurrentSentenceId: React.Dispatch<React.SetStateAction<string | null>>
  setLocationSentenceId: React.Dispatch<React.SetStateAction<string | null>>
}) {
  useEffect(() => {
    queueMicrotask(() => {
      setChapterIndex((index) => Math.max(0, Math.min(book.chapters.length - 1, index)))
      setCurrentSentenceId((id) => (id && sentences.some((s) => s.id === id) ? id : null))
      setLocationSentenceId((id) => (id && sentences.some((s) => s.id === id) ? id : null))
    })
  }, [book.chapters.length, sentences, setChapterIndex, setCurrentSentenceId, setLocationSentenceId])
}
