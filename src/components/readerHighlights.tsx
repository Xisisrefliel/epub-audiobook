import { memo } from 'react'
import type { ActiveWord } from '../types'
import type { TextPart } from '../utils/pretextLayout'
import { activeWordKey, findActiveWordRange } from './activeWordText'

export const HighlightedText = memo(function HighlightedText({
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
        key={activeWordKey(activeWord!)}
        data-active-word={activeWordKey(activeWord!)}
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
}, areHighlightedTextPropsEqual)

function areHighlightedTextPropsEqual(
  prev: {
    part: TextPart
    activeWord: ActiveWord | null
    isBookmarked: boolean
    isActive: boolean
  },
  next: {
    part: TextPart
    activeWord: ActiveWord | null
    isBookmarked: boolean
    isActive: boolean
  },
) {
  if (prev.part !== next.part || prev.isBookmarked !== next.isBookmarked || prev.isActive !== next.isActive) {
    return false
  }
  const prevActive = prev.activeWord?.sentenceId === prev.part.id ? prev.activeWord : null
  const nextActive = next.activeWord?.sentenceId === next.part.id ? next.activeWord : null
  if (!prevActive && !nextActive) return true
  return (
    prevActive?.wordIndex === nextActive?.wordIndex &&
    prevActive?.occurrence === nextActive?.occurrence &&
    prevActive?.text === nextActive?.text &&
    prevActive?.isPunctuationPause === nextActive?.isPunctuationPause
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
  const sentenceMatch = findActiveWordRange(part.sentenceText, activeWord)
  if (!sentenceMatch) return null
  const start = sentenceMatch.start - part.sentenceOffset
  const end = sentenceMatch.end - part.sentenceOffset
  if (end <= 0 || start >= part.text.length) return null
  return { start: Math.max(0, start), end: Math.min(part.text.length, end) }
}
