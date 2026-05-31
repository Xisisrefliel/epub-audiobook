const sentenceSegmenter = 'Segmenter' in Intl
  ? new Intl.Segmenter(undefined, { granularity: 'sentence' })
  : null

const ORPHAN_CLOSING_MARKS = /^[\p{Pe}"'’”»›]+$/u
const LEADING_CLOSING_MARKS = /^([\p{Pe}"'’”»›]+)\s+(.+)$/u

export function splitSentences(text: string): string[] {
  const normalized = text
    .replace(/\s+/g, ' ')
    // Some EPUBs collapse sentence boundaries (e.g. "Hello.World"). Add a
    // missing space after sentence-ending punctuation while avoiding decimals.
    .replace(/([!?])(?=[^\s.!?])/gu, '$1 ')
    .replace(/\.(?=(?!\d)[^\s.!?])/gu, '. ')
    .trim()
  if (!normalized) return []

  if (sentenceSegmenter) {
    return mergeOrphanClosingMarks(Array.from(sentenceSegmenter.segment(normalized)).flatMap((s) => {
      const sentence = s.segment.trim()
      return sentence ? [sentence] : []
    }))
  }

  return mergeOrphanClosingMarks(normalized.split(/(?<=[.!?])\s+/).flatMap((s) => {
    const sentence = s.trim()
    return sentence ? [sentence] : []
  }))
}

function mergeOrphanClosingMarks(segments: string[]) {
  const sentences: string[] = []

  for (const segment of segments) {
    if (ORPHAN_CLOSING_MARKS.test(segment) && sentences.length > 0) {
      sentences[sentences.length - 1] = `${sentences[sentences.length - 1]}${segment}`
      continue
    }

    const leadingMarks = segment.match(LEADING_CLOSING_MARKS)
    if (leadingMarks && sentences.length > 0) {
      sentences[sentences.length - 1] = `${sentences[sentences.length - 1]}${leadingMarks[1]}`
      sentences.push(leadingMarks[2])
      continue
    }

    sentences.push(segment)
  }

  return sentences
}
