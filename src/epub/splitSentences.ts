export function splitSentences(text: string): string[] {
  const normalized = text
    .replace(/\s+/g, ' ')
    .replace(/([.!?])(?=[\p{Lu}\p{N}"“‘])/gu, '$1 ')
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
