import { useState } from 'react'
import type { BookmarkPageInfo, CounterMode, PaginationInfo, ScrollRequest } from '../types'

type ReaderRuntime = {
  isLoadingBook: boolean
  setIsLoadingBook: React.Dispatch<React.SetStateAction<boolean>>
  paginationInfo: PaginationInfo | null
  setPaginationInfo: React.Dispatch<React.SetStateAction<PaginationInfo | null>>
  bookmarkPages: Record<string, BookmarkPageInfo>
  setBookmarkPages: React.Dispatch<React.SetStateAction<Record<string, BookmarkPageInfo>>>
  counterMode: CounterMode
  setCounterMode: React.Dispatch<React.SetStateAction<CounterMode>>
  scrollRequest: ScrollRequest | null
  setScrollRequest: React.Dispatch<React.SetStateAction<ScrollRequest | null>>
  syncKey: number
  setSyncKey: React.Dispatch<React.SetStateAction<number>>
}

export function useReaderRuntime(initialCounterMode: CounterMode): ReaderRuntime {
  const [isLoadingBook, setIsLoadingBook] = useState(false)
  const [paginationInfo, setPaginationInfo] = useState<PaginationInfo | null>(null)
  const [bookmarkPages, setBookmarkPages] = useState<Record<string, BookmarkPageInfo>>({})
  const [counterMode, setCounterMode] = useState<CounterMode>(initialCounterMode)
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(null)
  const [syncKey, setSyncKey] = useState(0)

  return {
    isLoadingBook,
    setIsLoadingBook,
    paginationInfo,
    setPaginationInfo,
    bookmarkPages,
    setBookmarkPages,
    counterMode,
    setCounterMode,
    scrollRequest,
    setScrollRequest,
    syncKey,
    setSyncKey,
  }
}
