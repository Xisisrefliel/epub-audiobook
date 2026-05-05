import { memo } from 'react'
import type { ActiveWord, Book, Bookmark, PaginationInfo, ReaderMode, ScrollRequest } from '../types'
import { ReaderScroll } from './ReaderScroll'
import { ReaderPaginated } from './ReaderPaginated'

type Props = {
  book: Book
  chapterIndex: number
  onChapterChange: (index: number, edge?: 'start' | 'end') => void
  mode: ReaderMode
  fontSize: number
  lineHeight: number
  measure: number
  currentSentenceId: string | null
  locationSentenceId: string | null
  activeWord: ActiveWord | null
  bookmarkBySentenceId: Map<string, Bookmark>
  onSentenceSelect: (id: string | null) => void
  onBookmarkToggle: (id: string, offset: number) => void
  onLocationChange: (id: string | null) => void
  onPaginationChange: (info: PaginationInfo | null) => void
  scrollRequest: ScrollRequest | null
  syncKey: number
  onCurrentSentenceVisibilityChange: (visible: boolean) => void
}

export const Reader = memo(function Reader({ onPaginationChange, ...props }: Props) {
  if (props.mode === 'paginated') {
    return <ReaderPaginated {...props} onPaginationChange={onPaginationChange} />
  }
  return <ReaderScroll {...props} />
})
