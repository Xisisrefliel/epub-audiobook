import type { ActiveWord } from '../types'

const WORD_MATCH_PATTERN = /[\p{L}\p{N}]+(?:['’\-‐‑‒–—][\p{L}\p{N}]+)*/gu

export function activeWordKey(activeWord: ActiveWord) {
  return `${activeWord.sentenceId}:${activeWord.wordIndex}:${activeWord.isPunctuationPause ? 'pause' : 'word'}`
}

export function findActiveWordRange(sentenceText: string, activeWord: ActiveWord) {
  const target = normalizeWord(activeWord.text)
  if (!target) return null
  const matches = Array.from(sentenceText.matchAll(WORD_MATCH_PATTERN))
  const sameWordMatches = matches.filter((match) => normalizeWord(match[0]) === target)
  const sentenceMatch = sameWordMatches[activeWord.occurrence]
  if (!sentenceMatch || sentenceMatch.index === undefined) return null
  const start = sentenceMatch.index
  let end = start + sentenceMatch[0].length
  if (activeWord.isPunctuationPause) {
    const trailing = sentenceText
      .slice(sentenceMatch.index + sentenceMatch[0].length)
      .match(/^[,;:–—-]+/u)
    end += trailing?.[0].length ?? 0
  }
  return { start, end }
}

function normalizeWord(value: string) {
  return value.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()
}
