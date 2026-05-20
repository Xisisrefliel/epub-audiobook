import { startTransition, useEffect, useState } from 'react'
import type { Book } from '../types'
import {
  buildScrollLinesAsync,
  getCachedScrollLines,
  scrollLayoutKey,
  type ScrollLineFragment,
} from '../utils/scrollLinesLayout'

type LayoutSnapshot = {
  lines: ScrollLineFragment[]
  fontSize: number
  lineHeight: number
}

type Args = {
  book: Book
  contentWidth: number
  fontSize: number
  lineHeight: number
}

export function useScrollLinesLayout({ book, contentWidth, fontSize, lineHeight }: Args) {
  const [snapshot, setSnapshot] = useState<LayoutSnapshot>(() => ({
    lines: [],
    fontSize,
    lineHeight,
  }))

  const cached = contentWidth
    ? getCachedScrollLines(book, contentWidth, fontSize, lineHeight)
    : null

  useEffect(() => {
    if (!contentWidth || cached) return

    let cancelled = false

    const publish = (lines: ScrollLineFragment[]) => {
      startTransition(() => {
        setSnapshot({ lines, fontSize, lineHeight })
      })
    }

    void buildScrollLinesAsync(book, contentWidth, fontSize, lineHeight, () => cancelled, (lines) => {
      if (!cancelled) publish(lines)
    }).then((lines) => {
      if (!lines || cancelled) return
      publish(lines)
    })

    return () => {
      cancelled = true
    }
  }, [book, cached, contentWidth, fontSize, lineHeight])

  const lines = cached ?? (contentWidth ? snapshot.lines : [])
  const displayFontSize = cached ? fontSize : snapshot.fontSize
  const displayLineHeight = cached ? lineHeight : snapshot.lineHeight
  const targetKey = contentWidth ? scrollLayoutKey(contentWidth, fontSize, lineHeight) : ''
  const displayKey = contentWidth ? scrollLayoutKey(contentWidth, displayFontSize, displayLineHeight) : ''
  const isUpdating = !!contentWidth && !cached && targetKey !== displayKey

  return {
    lines,
    displayFontSize,
    displayLineHeight,
    linesReady: lines.length > 0,
    isUpdating,
  }
}
