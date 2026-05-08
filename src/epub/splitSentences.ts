export function splitSentences(text: string): string[] {
  const normalized = text
    .replace(/\s+/g, ' ')
    // Some EPUBs collapse sentence boundaries (e.g. "Hello.World"). Add a
    // missing space after sentence-ending punctuation while avoiding decimals.
    .replace(/([!?])(?=[^\s.!?])/gu, '$1 ')
    .replace(/\.(?=(?!\d)[^\s.!?])/gu, '. ')
    .trim()
  if (!normalized) return []

  if ('Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' })
    return Array.from(segmenter.segment(normalized))
      .map((s) => s.segment.trim())
      .filter(Boolean)
  }

  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}
