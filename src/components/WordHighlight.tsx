import { memo, useCallback, useLayoutEffect, useReducer, useRef, type RefObject } from 'react'
import type { ActiveWord, HighlightTheme } from '../types'
import { getWordBandHeight } from './highlightGeometry'
import { activeWordKey, findActiveWordRange } from './activeWordText'

type Rect = { top: number; left: number; width: number; height: number }

type Props = {
  activeWord: ActiveWord | null
  articleRef: RefObject<HTMLElement | null>
  highlightTheme: HighlightTheme
}

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'
const HANDWRITTEN_DURATION = 240
const MODERN_DURATION = 180
const SAME_LINE_CENTER_THRESHOLD_PX = 14
const HORIZONTAL_OUTSET_PX = 2
const PEN_STROKE_PATH = 'M1 7 Q 20 2, 45 6 T 90 5 T 99 4'

function getCenterY(rect: Rect) {
  return rect.top + rect.height / 2
}

function mergeLineRects(rects: Rect[]) {
  const sorted = rects.toSorted((a, b) => {
    const centerDelta = getCenterY(a) - getCenterY(b)
    return Math.abs(centerDelta) > SAME_LINE_CENTER_THRESHOLD_PX ? centerDelta : a.left - b.left
  })
  const merged: Rect[] = []
  for (const rect of sorted) {
    const previous = merged.at(-1)
    const sameLine = previous && Math.abs(getCenterY(previous) - getCenterY(rect)) <= SAME_LINE_CENTER_THRESHOLD_PX
    if (previous && sameLine) {
      const right = Math.max(previous.left + previous.width, rect.left + rect.width)
      previous.left = Math.min(previous.left, rect.left)
      previous.top = Math.min(previous.top, rect.top)
      previous.width = right - previous.left
      previous.height = Math.max(previous.height, rect.height)
    } else {
      merged.push({ ...rect })
    }
  }
  return merged
}

function getUnderlineRect(textRect: DOMRect, articleRect: DOMRect, right: number): Rect | null {
  const left = textRect.left - HORIZONTAL_OUTSET_PX
  const width = right + HORIZONTAL_OUTSET_PX - left
  if (width <= 0 || textRect.height <= 0) return null
  return {
    top: textRect.bottom - articleRect.top - Math.max(3, textRect.height * 0.12),
    left: left - articleRect.left,
    width,
    height: Math.max(6, textRect.height * 0.28),
  }
}

function rectsEqual(a: Rect[], b: Rect[]) {
  if (a.length !== b.length) return false
  return a.every((rect, index) => {
    const next = b[index]
    return (
      !!next &&
      Math.abs(rect.top - next.top) < 0.1 &&
      Math.abs(rect.left - next.left) < 0.1 &&
      Math.abs(rect.width - next.width) < 0.1 &&
      Math.abs(rect.height - next.height) < 0.1
    )
  })
}

function rectsReducer(current: Rect[], next: Rect[]) {
  return rectsEqual(current, next) ? current : next
}

type SentencePartElement = {
  textRoot: HTMLElement
  text: string
  start: number
  end: number
}

function getSentencePartElements(article: HTMLElement, sentenceId: string): SentencePartElement[] {
  return Array.from(article.querySelectorAll<HTMLElement>(`[data-sid="${CSS.escape(sentenceId)}"]`)).flatMap((element) => {
    const start = Number(element.dataset.sentenceOffset)
    const end = Number(element.dataset.sentenceEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []
    const textRoot = element.querySelector<HTMLElement>('.sentence-press-feedback') ?? element
    return [{ textRoot, text: textRoot.textContent ?? '', start, end }]
  })
}

function buildSentenceText(parts: SentencePartElement[]) {
  const length = parts.reduce((max, part) => Math.max(max, part.end), 0)
  const chars = new Array<string>(length).fill(' ')
  for (const part of parts) {
    const limit = Math.min(part.text.length, part.end - part.start)
    for (let i = 0; i < limit; i++) {
      chars[part.start + i] = part.text[i] ?? ' '
    }
  }
  return chars.join('')
}

function findTextPosition(root: HTMLElement, offset: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode() as Text | null
  let remaining = Math.max(0, offset)
  let last: Text | null = null
  while (current) {
    last = current
    const length = current.data.length
    if (remaining <= length) return { node: current, offset: remaining }
    remaining -= length
    current = walker.nextNode() as Text | null
  }
  return last ? { node: last, offset: last.data.length } : null
}

function getTextRightAtOffset(root: HTMLElement, offset: number) {
  const end = findTextPosition(root, offset)
  if (!end || !root.firstChild) return null
  const range = document.createRange()
  range.setStartBefore(root.firstChild)
  range.setEnd(end.node, end.offset)
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)
  range.detach()
  return rects.at(-1)?.right ?? null
}

const WordHighlightImpl = function WordHighlight({ activeWord, articleRef, highlightTheme }: Props) {
  const [rects, dispatchRects] = useReducer(rectsReducer, [])
  const activeWordRef = useRef<ActiveWord | null>(null)
  const highlightThemeRef = useRef<HighlightTheme>(highlightTheme)
  const activeKey = activeWord ? activeWordKey(activeWord) : null

  const compute = useCallback(() => {
    const latestActiveWord = activeWordRef.current
    const latestHighlightTheme = highlightThemeRef.current
    if (!latestActiveWord) {
      dispatchRects([])
      return
    }

    const article = articleRef.current
    if (!article) return

    if (latestHighlightTheme === 'modern') {
      const target = article.querySelector<HTMLElement>(`[data-active-word="${CSS.escape(activeWordKey(latestActiveWord))}"]`)
      if (!target) {
        dispatchRects([])
        return
      }

      const articleRect = article.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(target)
      const textRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)
      range.detach()
      const targetRect = textRects[0] ?? target.getBoundingClientRect()
      const fontSize = Number.parseFloat(window.getComputedStyle(target).fontSize) || targetRect.height
      const height = getWordBandHeight(fontSize, targetRect.height)
      dispatchRects([
        {
          top: targetRect.top - articleRect.top + (targetRect.height - height) / 2,
          left: targetRect.left - articleRect.left,
          width: targetRect.width,
          height,
        },
      ])
      return
    }

    const sentenceParts = getSentencePartElements(article, latestActiveWord.sentenceId)
    if (sentenceParts.length === 0) {
      dispatchRects([])
      return
    }
    const wordRange = findActiveWordRange(buildSentenceText(sentenceParts), latestActiveWord)
    if (!wordRange) {
      dispatchRects([])
      return
    }

    const articleRect = article.getBoundingClientRect()
    const next: Rect[] = []

    for (const part of sentenceParts) {
      if (part.start >= wordRange.end) break
      const textRect = part.textRoot.getBoundingClientRect()
      const right = wordRange.end < part.end
        ? getTextRightAtOffset(part.textRoot, Math.max(0, wordRange.end - part.start))
        : textRect.right
      if (right === null) continue
      const rect = getUnderlineRect(textRect, articleRect, Math.min(textRect.right, right))
      if (rect) next.push(rect)
    }

    dispatchRects(mergeLineRects(next))
  }, [articleRef])

  useLayoutEffect(() => {
    activeWordRef.current = activeWord
    highlightThemeRef.current = highlightTheme
    compute()
  }, [activeKey, activeWord, compute, highlightTheme])

  useLayoutEffect(() => {
    const article = articleRef.current
    if (!article) return
    const ro = new ResizeObserver(compute)
    ro.observe(article)
    window.addEventListener('resize', compute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [articleRef, compute])

  return (
    <div
      aria-hidden
      className={highlightTheme === 'handwritten' ? 'pointer-events-none absolute inset-0 z-20' : 'pointer-events-none absolute inset-0 z-0'}
    >
      {highlightTheme === 'handwritten'
        ? rects.map((rect, index) => (
            <svg
              key={index}
              className="active-progress-pen-stroke"
              preserveAspectRatio="none"
              viewBox="0 0 100 10"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
                width: rect.width,
                height: rect.height,
                transition: `transform ${HANDWRITTEN_DURATION}ms ${EASE}, width ${HANDWRITTEN_DURATION}ms ${EASE}, height ${HANDWRITTEN_DURATION}ms ${EASE}`,
              }}
            >
              <path d={PEN_STROKE_PATH} pathLength="100" />
            </svg>
          ))
        : rects.map((rect, index) => (
            <div
              key={index}
              className="absolute rounded-[0.18em] bg-zinc-950/16 shadow-[0_0_0_1px_rgba(24,24,27,0.08)_inset] dark:bg-white/24 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset]"
              style={{
                transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
                width: rect.width,
                height: rect.height,
                transition: `transform ${MODERN_DURATION}ms ${EASE}, width ${MODERN_DURATION}ms ${EASE}, height ${MODERN_DURATION}ms ${EASE}, opacity ${MODERN_DURATION}ms ${EASE}`,
              }}
            />
          ))}
    </div>
  )
}

export const WordHighlight = memo(WordHighlightImpl)
