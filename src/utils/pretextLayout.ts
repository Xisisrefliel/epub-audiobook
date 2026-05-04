import {
  layoutNextLineRange,
  materializeLineRange,
  prepareWithSegments,
  measureLineStats,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
import type { Paragraph } from '../types'

export type SentenceRange = { id: string; start: number; end: number }
export type TextPart = { id: string; text: string; sentenceOffset: number; sentenceText: string }

const preparedParagraphCache = new WeakMap<Paragraph, Map<string, PreparedTextWithSegments>>()
const paragraphTextCache = new WeakMap<Paragraph, string>()
const sentenceRangesCache = new WeakMap<Paragraph, SentenceRange[]>()

export function getParagraphText(para: Paragraph) {
  const cached = paragraphTextCache.get(para)
  if (cached !== undefined) return cached
  const text = para.sentences.map((s) => s.text).join(' ')
  paragraphTextCache.set(para, text)
  return text
}

export function getSentenceRanges(para: Paragraph) {
  const cached = sentenceRangesCache.get(para)
  if (cached) return cached
  const ranges: SentenceRange[] = []
  let cursor = 0
  for (const sentence of para.sentences) {
    const start = cursor
    const end = start + sentence.text.length
    ranges.push({ id: sentence.id, start, end })
    cursor = end + 1
  }
  sentenceRangesCache.set(para, ranges)
  return ranges
}

export function getPreparedParagraph(para: Paragraph, font: string) {
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
    const parts = ranges
      .map((range) => {
        const start = Math.max(lineStart, range.start)
        const end = Math.min(lineEnd, range.end)
        if (start >= end) return null
        const sentenceText = text.slice(range.start, range.end)
        return {
          id: range.id,
          text: text.slice(start, end),
          sentenceOffset: start - range.start,
          sentenceText,
        }
      })
      .filter((part): part is TextPart => part !== null)

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
