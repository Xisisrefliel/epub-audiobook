import {
  layoutNextLineRange,
  materializeLineRange,
  prepareWithSegments,
  measureLineStats,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
import type { Paragraph } from '../types'

type SentenceRange = { id: string; start: number; end: number }
export type TextPart = { id: string; text: string; sentenceOffset: number; sentenceText: string; leadingText: string }

const preparedParagraphCache = new WeakMap<Paragraph, Map<string, PreparedTextWithSegments>>()
const paragraphTextCache = new WeakMap<Paragraph, string>()
const sentenceRangesCache = new WeakMap<Paragraph, SentenceRange[]>()

function normalizeDisplaySentenceText(text: string) {
  return text
    .replace(/([!?])(?=[^\s.!?])/gu, '$1 ')
    .replace(/\.(?=(?!\d)[^\s.!?])/gu, '. ')
}

export function getParagraphText(para: Paragraph) {
  const cached = paragraphTextCache.get(para)
  if (cached !== undefined) return cached
  const text = para.sentences.map((s) => normalizeDisplaySentenceText(s.text)).join(' ')
  paragraphTextCache.set(para, text)
  return text
}

function getSentenceRanges(para: Paragraph) {
  const cached = sentenceRangesCache.get(para)
  if (cached) return cached
  const ranges: SentenceRange[] = []
  let cursor = 0
  for (const sentence of para.sentences) {
    const sentenceText = normalizeDisplaySentenceText(sentence.text)
    const start = cursor
    const end = start + sentenceText.length
    ranges.push({ id: sentence.id, start, end })
    cursor = end + 1
  }
  sentenceRangesCache.set(para, ranges)
  return ranges
}

function getPreparedParagraph(para: Paragraph, font: string) {
  let cache = preparedParagraphCache.get(para)
  if (!cache) {
    cache = new Map()
    preparedParagraphCache.set(para, cache)
  }
  const cached = cache.get(font)
  if (cached) return cached
  const prepared = prepareWithSegments(getParagraphText(para), font)
  cache.set(font, prepared)
  return prepared
}

export function measureParagraphLines(para: Paragraph, font: string, width: number) {
  return measureLineStats(getPreparedParagraph(para, font), width).lineCount
}

export function walkParagraphLineParts(
  para: Paragraph,
  font: string,
  width: number,
  onLine: (line: { parts: TextPart[]; lineIndex: number; endsParagraph: boolean }) => void | false,
) {
  const text = getParagraphText(para)
  const ranges = getSentenceRanges(para)
  const prepared = getPreparedParagraph(para, font)
  const lines: { parts: TextPart[]; lineIndex: number }[] = []
  let offset = 0
  let lineIndex = 0

  let cursor = { segmentIndex: 0, graphemeIndex: 0 }
  while (true) {
    const lineRange = layoutNextLineRange(prepared, cursor, width)
    if (!lineRange) break

    const lineText = materializeLineRange(prepared, lineRange).text
    const lineStart = offset
    const lineEnd = lineStart + lineText.length
    let previousPartEnd = lineStart
    const parts: TextPart[] = []
    for (const range of ranges) {
      const start = Math.max(lineStart, range.start)
      const end = Math.min(lineEnd, range.end)
      if (start >= end) continue
      const sentenceText = text.slice(range.start, range.end)
      const leadingText = text.slice(previousPartEnd, start)
      previousPartEnd = end
      parts.push({
        id: range.id,
        text: text.slice(start, end),
        sentenceOffset: start - range.start,
        sentenceText,
        leadingText,
      })
    }

    lines.push({ parts, lineIndex })

    offset = lineEnd
    while (text[offset] === ' ') offset++
    lineIndex++
    cursor = lineRange.end
  }

  for (const [index, line] of lines.entries()) {
    const shouldContinue = onLine({ ...line, endsParagraph: index === lines.length - 1 })
    if (shouldContinue === false) break
  }
}
