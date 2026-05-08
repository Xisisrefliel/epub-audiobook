import { useState } from 'react'
import type { ActiveWord } from '../types'

type NavigationHistoryEntry = { sentenceId: string }
type NavigationHistory = { entries: NavigationHistoryEntry[]; index: number }

type ReadingPosition = {
  currentSentenceId: string | null
  setCurrentSentenceId: React.Dispatch<React.SetStateAction<string | null>>
  locationSentenceId: string | null
  setLocationSentenceId: React.Dispatch<React.SetStateAction<string | null>>
  navigationHistory: NavigationHistory
  setNavigationHistory: React.Dispatch<React.SetStateAction<NavigationHistory>>
  activeWord: ActiveWord | null
  setActiveWord: React.Dispatch<React.SetStateAction<ActiveWord | null>>
}

export function useReadingPosition({
  initialCurrentSentenceId,
  initialLocationSentenceId,
}: {
  initialCurrentSentenceId?: string | null
  initialLocationSentenceId?: string | null
}): ReadingPosition {
  const [currentSentenceId, setCurrentSentenceId] = useState<string | null>(initialCurrentSentenceId ?? null)
  const [locationSentenceId, setLocationSentenceId] = useState<string | null>(initialLocationSentenceId ?? null)
  const [navigationHistory, setNavigationHistory] = useState<NavigationHistory>({ entries: [], index: -1 })
  const [activeWord, setActiveWord] = useState<ActiveWord | null>(null)

  return {
    currentSentenceId,
    setCurrentSentenceId,
    locationSentenceId,
    setLocationSentenceId,
    navigationHistory,
    setNavigationHistory,
    activeWord,
    setActiveWord,
  }
}
