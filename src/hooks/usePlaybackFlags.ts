import { useState } from 'react'

type PlaybackFlags = {
  isPlaying: boolean
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>
  isBuffering: boolean
  setIsBuffering: React.Dispatch<React.SetStateAction<boolean>>
  isCurrentSentenceVisible: boolean
  setIsCurrentSentenceVisible: React.Dispatch<React.SetStateAction<boolean>>
}

export function usePlaybackFlags(): PlaybackFlags {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [isCurrentSentenceVisible, setIsCurrentSentenceVisible] = useState(false)

  return {
    isPlaying,
    setIsPlaying,
    isBuffering,
    setIsBuffering,
    isCurrentSentenceVisible,
    setIsCurrentSentenceVisible,
  }
}
