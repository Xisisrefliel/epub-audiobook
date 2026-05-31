import { useEffect } from 'react'
import type { Book } from '../types'

export function useClampReadingPosition({
  book,
  sentences,
  onChapterIndexChange,
  onCurrentSentenceIdChange,
  onLocationSentenceIdChange,
}: {
  book: Book | null
  sentences: { id: string }[]
  onChapterIndexChange: React.Dispatch<React.SetStateAction<number>>
  onCurrentSentenceIdChange: React.Dispatch<React.SetStateAction<string | null>>
  onLocationSentenceIdChange: React.Dispatch<React.SetStateAction<string | null>>
}) {
  useEffect(() => {
    if (!book) return
    queueMicrotask(() => {
      onChapterIndexChange((index) => Math.max(0, Math.min(book.chapters.length - 1, index)))
      onCurrentSentenceIdChange((id) => (id && sentences.some((s) => s.id === id) ? id : null))
      onLocationSentenceIdChange((id) => (id && sentences.some((s) => s.id === id) ? id : null))
    })
  }, [book, sentences, onChapterIndexChange, onCurrentSentenceIdChange, onLocationSentenceIdChange])
}
