import type { ActiveWord } from '../types'
import type { TextPart } from '../utils/pretextLayout'

const WORD_MATCH_PATTERN = /[\p{L}\p{N}]+(?:['’\-‐‑‒–—][\p{L}\p{N}]+)*/gu

export function HighlightedText({
  part,
  activeWord,
  isBookmarked,
  isActive,
}: {
  part: TextPart
  activeWord: ActiveWord | null
  isBookmarked: boolean
  isActive: boolean
}) {
  const match = activeWord?.sentenceId === part.id ? findActiveWordMatch(part, activeWord) : null
  if (!match) return <BookmarkText text={part.text} isBookmarked={isBookmarked} isActive={isActive} />
  return (
    <>
      <BookmarkText text={part.text.slice(0, match.start)} isBookmarked={isBookmarked} isActive={isActive} />
      <mark
        key={`${activeWord!.sentenceId}:${activeWord!.wordIndex}:${activeWord!.isPunctuationPause ? 'pause' : 'word'}`}
        data-active-word={`${activeWord!.sentenceId}:${activeWord!.wordIndex}:${activeWord!.isPunctuationPause ? 'pause' : 'word'}`}
        className={
          (isBookmarked ? 'bookmark-text-highlight ' : '') +
          (isBookmarked && isActive ? 'active-bookmark-cue ' : '') +
          'bg-transparent p-0 text-inherit'
        }
      >
        {part.text.slice(match.start, match.end)}
      </mark>
      <BookmarkText text={part.text.slice(match.end)} isBookmarked={isBookmarked} isActive={isActive} />
    </>
  )
}

function BookmarkText({ text, isBookmarked, isActive }: { text: string; isBookmarked: boolean; isActive: boolean }) {
  if (!isBookmarked) return text
  const leading = text.match(/^\s*/u)?.[0] ?? ''
  const trailing = text.match(/\s*$/u)?.[0] ?? ''
  const content = text.slice(leading.length, text.length - trailing.length)
  if (!content) return text
  return (
    <>
      {leading}
      <span className={(isActive ? 'active-bookmark-cue ' : '') + 'bookmark-text-highlight rounded-sm box-decoration-clone'}>
        {content}
      </span>
      {trailing}
    </>
  )
}

function findActiveWordMatch(part: TextPart, activeWord: ActiveWord) {
  const target = normalizeWord(activeWord.text)
  if (!target) return null
  const matches = Array.from(part.sentenceText.matchAll(WORD_MATCH_PATTERN))
  const sameWordMatches = matches.filter((match) => normalizeWord(match[0]) === target)
  const sentenceMatch = sameWordMatches[activeWord.occurrence]
  if (!sentenceMatch || sentenceMatch.index === undefined) return null
  const start = sentenceMatch.index - part.sentenceOffset
  let end = start + sentenceMatch[0].length
  if (activeWord.isPunctuationPause) {
    const trailing = part.sentenceText
      .slice(sentenceMatch.index + sentenceMatch[0].length)
      .match(/^[,;:–—-]+/u)
    end += trailing?.[0].length ?? 0
  }
  if (end <= 0 || start >= part.text.length) return null
  return { start: Math.max(0, start), end: Math.min(part.text.length, end) }
}

function normalizeWord(value: string) {
  return value.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()
}
