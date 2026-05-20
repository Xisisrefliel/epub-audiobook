export const SENTENCE_BAND_SCALE = 1.16
export const WORD_BAND_SCALE = 0.9

export function getSentenceBandHeight(fontSize: number, measuredHeight: number) {
  return Math.min(fontSize * SENTENCE_BAND_SCALE, Math.max(fontSize, measuredHeight))
}

export function getWordBandHeight(fontSize: number, measuredHeight: number) {
  const sentenceBandHeight = getSentenceBandHeight(fontSize, measuredHeight)
  return Math.min(sentenceBandHeight * WORD_BAND_SCALE, Math.max(fontSize * 0.86, measuredHeight * 0.72))
}
