const sentenceSegmenter = 'Segmenter' in Intl
  ? new Intl.Segmenter(undefined, { granularity: 'sentence' })
  : null

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
    return Array.from(sentenceSegmenter.segment(normalized)).flatMap((s) => {
      const sentence = s.segment.trim()
      return sentence ? [sentence] : []
    })
  }

  return normalized.split(/(?<=[.!?])\s+/).flatMap((s) => {
    const sentence = s.trim()
    return sentence ? [sentence] : []
  })
}
