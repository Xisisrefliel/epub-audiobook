import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Effect } from 'effect'
import { BookHeader } from './components/BookHeader'
import { Reader } from './components/Reader'
import { PlaybackBar } from './components/PlaybackBar'
import { ReaderSettings } from './components/ReaderSettings'
import { TableOfContents } from './components/TableOfContents'
import { BookmarksMenu, type BookmarkMenuItem } from './components/BookmarksMenu'
import { BookLibrary } from './components/BookLibrary'
import { BookLoadingView } from './components/BookLoadingView'
import { EmptyLibraryView } from './components/EmptyLibraryView'
import { loadEpub } from './epub/loadEpub'
import { defaultTtsConfig, getSpeechAudio, prefetchSpeech, ttsErrorMessage } from './tts/kokoroTts'
import type { TtsAudio } from './tts/kokoroTts'
import { getChapterDisplayTitle } from './utils/chapterTitle'
import { usePlaybackFlags } from './hooks/usePlaybackFlags'
import { useReaderRuntime } from './hooks/useReaderRuntime'
import { useBookState } from './hooks/useBookState'
import { useReadingPosition } from './hooks/useReadingPosition'
import { useClampReadingPosition } from './hooks/useClampReadingPosition'
import { useLoadLibraryFromDb } from './hooks/useLoadLibraryFromDb'
import { writeLibraryToDb } from './storage/libraryDb'
import type { Book, Bookmark, BookmarkPageInfo, CounterMode, ReaderMode, ScrollProgressInfo, Theme } from './types'

const STORAGE_PREFIX = 'audiobook-ui.'
const PLAYBACK_SPEED_STORAGE_KEY = `${STORAGE_PREFIX}playbackSpeed`
const BOOK_STORAGE_KEY = `${STORAGE_PREFIX}book`
const LIBRARY_STORAGE_KEY = `${STORAGE_PREFIX}library`
const ACTIVE_BOOK_STORAGE_KEY = `${STORAGE_PREFIX}activeBookId`
const PROGRESS_STORAGE_KEY = `${STORAGE_PREFIX}progress`
const PROGRESS_BY_BOOK_STORAGE_KEY = `${STORAGE_PREFIX}progressByBook`
const BOOKMARKS_BY_BOOK_STORAGE_KEY = `${STORAGE_PREFIX}bookmarksByBook`
const SETTINGS_STORAGE_KEY = `${STORAGE_PREFIX}settings`
const PREFETCH_AHEAD_SENTENCES = 4
const BUFFERING_DELAY_MS = 350
const REMOVED_SAMPLE_BOOK_ID = 'alice'

type StoredProgress = {
  chapterIndex?: number
  currentSentenceId?: string | null
  locationSentenceId?: string | null
  counterMode?: CounterMode
}

type AppSettingsState = {
  mode: ReaderMode
  theme: Theme
  fontSize: number
  lineHeight: number
  measure: number
  speed: number
}

type AppSettingsAction =
  | { type: 'mode'; value: ReaderMode }
  | { type: 'theme'; value: Theme }
  | { type: 'fontSize'; value: number }
  | { type: 'lineHeight'; value: number }
  | { type: 'measure'; value: number }
  | { type: 'speed'; value: number }

function appSettingsReducer(state: AppSettingsState, action: AppSettingsAction): AppSettingsState {
  switch (action.type) {
    case 'mode':
      return state.mode === action.value ? state : { ...state, mode: action.value }
    case 'theme':
      return state.theme === action.value ? state : { ...state, theme: action.value }
    case 'fontSize':
      return state.fontSize === action.value ? state : { ...state, fontSize: action.value }
    case 'lineHeight':
      return state.lineHeight === action.value ? state : { ...state, lineHeight: action.value }
    case 'measure':
      return state.measure === action.value ? state : { ...state, measure: action.value }
    case 'speed':
      return state.speed === action.value ? state : { ...state, speed: action.value }
  }
}

type OverlayName = 'settings' | 'toc' | 'bookmarks' | 'library'
type OverlayState = Record<OverlayName, boolean>
type OverlayAction = { type: 'open'; overlay: OverlayName } | { type: 'close'; overlay: OverlayName }

function overlayReducer(state: OverlayState, action: OverlayAction): OverlayState {
  if (action.type === 'close') return state[action.overlay] ? { ...state, [action.overlay]: false } : state
  return {
    settings: action.overlay === 'settings',
    toc: action.overlay === 'toc',
    bookmarks: action.overlay === 'bookmarks',
    library: action.overlay === 'library',
  }
}

type StoredSettings = {
  mode?: ReaderMode
  theme?: Theme
  fontSize?: number
  lineHeight?: number
  measure?: number
  speed?: number
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.warn(`Could not save ${key} to browser storage.`, error)
  }
}

function readStoredPlaybackSpeed(settings = readJson<StoredSettings>(SETTINGS_STORAGE_KEY)) {
  const value = Number(settings?.speed ?? window.localStorage.getItem(PLAYBACK_SPEED_STORAGE_KEY))
  return Number.isFinite(value) && value >= 0.5 && value <= 2 ? value : 1
}

function readStoredLibrary() {
  const storedLibrary =
    readJson<Book[]>(LIBRARY_STORAGE_KEY)?.filter((book) => book?.chapters?.length && book.id !== REMOVED_SAMPLE_BOOK_ID) ?? []
  const legacyBook = readJson<Book>(BOOK_STORAGE_KEY)
  return storedLibrary.length
    ? storedLibrary
    : legacyBook?.chapters?.length && legacyBook.id !== REMOVED_SAMPLE_BOOK_ID
      ? [legacyBook]
      : []
}

function readStoredSettings() {
  return readJson<StoredSettings>(SETTINGS_STORAGE_KEY) ?? {}
}

function readStoredProgress() {
  return readJson<StoredProgress>(PROGRESS_STORAGE_KEY) ?? {}
}

function readProgressByBook() {
  return readJson<Record<string, StoredProgress>>(PROGRESS_BY_BOOK_STORAGE_KEY) ?? {}
}

function readBookmarksByBook() {
  const stored = readJson<Record<string, Array<string | Partial<Bookmark>>>>(BOOKMARKS_BY_BOOK_STORAGE_KEY) ?? {}
  return Object.fromEntries(
    Object.entries(stored).map(([bookId, bookmarks]) => {
      const normalized: Bookmark[] = []
      for (const bookmark of bookmarks) {
        if (typeof bookmark === 'string') {
          normalized.push({ sentenceId: bookmark, offset: 0 })
        } else if (typeof bookmark.sentenceId === 'string') {
          normalized.push({ sentenceId: bookmark.sentenceId, offset: Math.max(0, Number(bookmark.offset) || 0) })
        }
      }
      return [bookId, normalized]
    }),
  )
}

function normalizeWord(value: string) {
  return value.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()
}

function useTheme(theme: Theme) {
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      const isDark = theme === 'dark' || (theme === 'system' && prefersDark)
      root.classList.toggle('dark', isDark)
    }
    apply()
    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      mql.addEventListener('change', apply)
      return () => mql.removeEventListener('change', apply)
    }
  }, [theme])
}

export default function App() {
  const storedSettings = useMemo(() => readStoredSettings(), [])
  const progressByBook = useMemo(() => readProgressByBook(), [])
  const storedBookmarksByBook = useMemo(() => readBookmarksByBook(), [])
  const fallbackProgress = useMemo(() => readStoredProgress(), [])
  const [settings, dispatchSettings] = useReducer(appSettingsReducer, storedSettings, (stored): AppSettingsState => ({
    mode: stored.mode === 'paginated' ? 'paginated' : 'scroll',
    theme:
      stored.theme === 'light' || stored.theme === 'dark' || stored.theme === 'system'
        ? stored.theme
        : 'system',
    fontSize: Number.isFinite(stored.fontSize) ? Math.min(28, Math.max(14, stored.fontSize ?? 19)) : 19,
    lineHeight: Number.isFinite(stored.lineHeight) ? Math.min(2.2, Math.max(1.25, stored.lineHeight ?? 1.65)) : 1.65,
    measure: Number.isFinite(stored.measure) ? Math.min(84, Math.max(42, stored.measure ?? 62)) : 62,
    speed: readStoredPlaybackSpeed(stored),
  }))
  const { mode, theme, fontSize, lineHeight, measure, speed } = settings
  const [overlays, dispatchOverlay] = useReducer(overlayReducer, {
    settings: false,
    toc: false,
    bookmarks: false,
    library: false,
  })
  const { settings: settingsOpen, toc: tocOpen, bookmarks: bookmarksOpen, library: libraryOpen } = overlays
  const [readerTypography, setReaderTypography] = useState({ fontSize, lineHeight, measure })
  const [settingsSession, setSettingsSession] = useState(0)
  const readerFontSize = settingsOpen ? readerTypography.fontSize : fontSize
  const readerLineHeight = settingsOpen ? readerTypography.lineHeight : lineHeight
  const readerMeasure = settingsOpen ? readerTypography.measure : measure
  const setMode = (value: ReaderMode) => dispatchSettings({ type: 'mode', value })
  const setTheme = (value: Theme) => dispatchSettings({ type: 'theme', value })
  const setFontSize = (value: number) => dispatchSettings({ type: 'fontSize', value })
  const setLineHeight = (value: number) => dispatchSettings({ type: 'lineHeight', value })
  const setMeasure = (value: number) => dispatchSettings({ type: 'measure', value })
  const setSpeed = (value: number) => dispatchSettings({ type: 'speed', value })
  const openOverlay = (overlay: OverlayName) => dispatchOverlay({ type: 'open', overlay })
  const closeOverlay = (overlay: OverlayName) => dispatchOverlay({ type: 'close', overlay })
  const {
    library,
    setLibrary,
    activeBookId,
    setActiveBookId,
    book,
    setBook,
    chapterIndex,
    setChapterIndex,
    bookmarksByBook,
    setBookmarksByBook,
  } = useBookState({
    initialLibrary: readStoredLibrary,
    initialActiveBookId: (initialLibrary) => {
      const storedActiveBookId = window.localStorage.getItem(ACTIVE_BOOK_STORAGE_KEY)
      return initialLibrary.some((book) => book.id === storedActiveBookId) ? storedActiveBookId : initialLibrary[0]?.id ?? null
    },
    initialBook: (initialLibrary, initialActiveBookId) => initialLibrary.find((candidate) => candidate.id === initialActiveBookId) ?? initialLibrary[0] ?? null,
    initialChapterIndex: (initialBook) => Math.max(0, initialBook ? (progressByBook[initialBook.id] ?? fallbackProgress).chapterIndex ?? 0 : 0),
    initialBookmarksByBook: storedBookmarksByBook,
  })
  const hasLoadedLibraryDbRef = useRef(false)
  const initialProgress = book ? progressByBook[book.id] ?? fallbackProgress : fallbackProgress
  const {
    isLoadingBook,
    setIsLoadingBook,
    paginationInfo,
    setPaginationInfo,
    bookmarkPages,
    setBookmarkPages,
    counterMode,
    setCounterMode,
    scrollRequest,
    setScrollRequest,
    syncKey,
    setSyncKey,
  } = useReaderRuntime(initialProgress.counterMode === 'book' ? 'book' : 'chapter')
  const scrollRequestKeyRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playbackRunRef = useRef(0)
  const speedRef = useRef(speed)
  const wordFrameRef = useRef(0)
  const prefetchControllersRef = useRef<AbortController[]>([])
  const {
    isPlaying,
    setIsPlaying,
    isBuffering,
    setIsBuffering,
    isCurrentSentenceVisible,
    setIsCurrentSentenceVisible,
  } = usePlaybackFlags()
  const [ttsError, setTtsError] = useState<string | null>(null)

  useEffect(() => {
    if (!ttsError) return
    const timer = window.setTimeout(() => setTtsError(null), 5000)
    return () => window.clearTimeout(timer)
  }, [ttsError])

  useTheme(theme)

  const requestScrollToSentence = (id: string, behavior: ScrollBehavior = 'auto', align: 'nearest' | 'center' = 'nearest', offset?: number) => {
    setScrollRequest({ key: ++scrollRequestKeyRef.current, type: 'sentence', id, behavior, align, offset })
  }

  const requestScrollToChapter = (index: number) => {
    setScrollRequest({ key: ++scrollRequestKeyRef.current, type: 'chapter', chapterIndex: index })
  }

  const chapter = book?.chapters[chapterIndex] ?? book?.chapters[0] ?? null

  const sentenceMeta = useMemo(() => {
    const byId = new Map<string, { chapterIndex: number; chapterSentenceIndex: number; bookSentenceIndex: number }>()
    const chapterSentenceCounts = book?.chapters.map((ch) =>
      ch.paragraphs.reduce((sum, p) => sum + p.sentences.length, 0),
    ) ?? []
    const sentences = book?.chapters.flatMap((ch, chapterIndex) => {
      let chapterSentenceIndex = 0
      return ch.paragraphs.flatMap((p) =>
        p.sentences.map((sentence) => {
          const bookSentenceIndex = byId.size
          byId.set(sentence.id, { chapterIndex, chapterSentenceIndex, bookSentenceIndex })
          chapterSentenceIndex++
          return sentence
        }),
      )
    }) ?? []
    return { byId, chapterSentenceCounts, sentences }
  }, [book])

  const sentences = sentenceMeta.sentences
  const sentenceIndexById = useMemo(() => {
    const map = new Map<string, number>()
    sentences.forEach((sentence, index) => map.set(sentence.id, index))
    return map
  }, [sentences])
  const {
    currentSentenceId,
    setCurrentSentenceId,
    locationSentenceId,
    setLocationSentenceId,
    navigationHistory,
    setNavigationHistory,
    activeWord,
    setActiveWord,
  } = useReadingPosition({
    initialCurrentSentenceId: initialProgress.currentSentenceId,
    initialLocationSentenceId: initialProgress.locationSentenceId,
  })
  const bookmarkBySentenceId = useMemo(() => {
    const map = new Map<string, Bookmark>()
    if (!book) return map
    ;(bookmarksByBook[book.id] ?? []).forEach((bookmark) => map.set(bookmark.sentenceId, bookmark))
    return map
  }, [book, bookmarksByBook])

  const bookmarkMenuItems = useMemo<BookmarkMenuItem[]>(() => {
    const items: BookmarkMenuItem[] = []
    if (!book) return items
    for (const bookmark of bookmarksByBook[book.id] ?? []) {
      const meta = sentenceMeta.byId.get(bookmark.sentenceId)
      const sentence = sentences[sentenceIndexById.get(bookmark.sentenceId) ?? -1]
      if (!meta || !sentence) continue
      const page = bookmarkPages[bookmark.sentenceId]
      items.push({
        id: bookmark.sentenceId,
        offset: bookmark.offset,
        sentence: sentence.text,
        chapter: getChapterDisplayTitle(book, meta.chapterIndex),
        pageLabel: page ? `Page ${page.pageIndex + 1}` : 'Page --',
      })
    }
    return items.toSorted((a, b) => {
      const aMeta = sentenceMeta.byId.get(a.id)
      const bMeta = sentenceMeta.byId.get(b.id)
      return (aMeta?.bookSentenceIndex ?? 0) - (bMeta?.bookSentenceIndex ?? 0)
    })
  }, [book, bookmarkPages, bookmarksByBook, sentenceIndexById, sentenceMeta, sentences])

  const scrollProgressInfo = useMemo<ScrollProgressInfo | null>(() => {
    const anchorId = locationSentenceId ?? currentSentenceId ?? chapter?.paragraphs[0]?.sentences[0]?.id
    const meta = anchorId ? sentenceMeta.byId.get(anchorId) : null
    if (!book || !meta || sentences.length === 0) return null
    return {
      chapterIndex: meta.chapterIndex,
      chapterTotal: book.chapters.length,
      chapterSentenceIndex: meta.chapterSentenceIndex,
      chapterSentenceTotal: sentenceMeta.chapterSentenceCounts[meta.chapterIndex] ?? 0,
      bookSentenceIndex: meta.bookSentenceIndex,
      bookSentenceTotal: sentences.length,
    }
  }, [book, chapter, currentSentenceId, locationSentenceId, sentenceMeta, sentences.length])

  useClampReadingPosition({
    book,
    sentences,
    onChapterIndexChange: setChapterIndex,
    onCurrentSentenceIdChange: setCurrentSentenceId,
    onLocationSentenceIdChange: setLocationSentenceId,
  })

  useEffect(() => {
    writeJson(SETTINGS_STORAGE_KEY, { mode, theme, fontSize, lineHeight, measure, speed })
    try {
      window.localStorage.setItem(PLAYBACK_SPEED_STORAGE_KEY, String(speed))
    } catch {
      // Ignore storage failures; settings persistence is best-effort.
    }
  }, [mode, theme, fontSize, lineHeight, measure, speed])

  useEffect(() => {
    if (!book) return
    const progress = { chapterIndex, currentSentenceId, locationSentenceId, counterMode }
    writeJson(PROGRESS_STORAGE_KEY, progress)
    writeJson(PROGRESS_BY_BOOK_STORAGE_KEY, { ...readProgressByBook(), [book.id]: progress })
  }, [book, chapterIndex, currentSentenceId, locationSentenceId, counterMode])

  useLoadLibraryFromDb({
    activeBookStorageKey: ACTIVE_BOOK_STORAGE_KEY,
    markLoadedRef: hasLoadedLibraryDbRef,
    readProgressByBook,
    onLibraryChange: setLibrary,
    onActiveBookIdChange: setActiveBookId,
    onBookChange: setBook,
    onChapterIndexChange: setChapterIndex,
    onCurrentSentenceIdChange: setCurrentSentenceId,
    onLocationSentenceIdChange: setLocationSentenceId,
    onCounterModeChange: setCounterMode,
  })

  useEffect(() => {
    if (!hasLoadedLibraryDbRef.current) return
    void writeLibraryToDb(library).catch((error) => console.warn('Could not save library to browser database.', error))
    try {
      window.localStorage.setItem(
        LIBRARY_STORAGE_KEY,
        JSON.stringify(library.filter((storedBook) => storedBook.id !== REMOVED_SAMPLE_BOOK_ID)),
      )
    } catch {
      // IndexedDB is the durable storage for uploaded EPUBs; localStorage is just a legacy fallback.
    }
  }, [library])

  useEffect(() => {
    writeJson(BOOKMARKS_BY_BOOK_STORAGE_KEY, bookmarksByBook)
  }, [bookmarksByBook])

  useEffect(() => {
    try {
      if (activeBookId) window.localStorage.setItem(ACTIVE_BOOK_STORAGE_KEY, activeBookId)
      else window.localStorage.removeItem(ACTIVE_BOOK_STORAGE_KEY)
    } catch {
      // Ignore storage failures; the in-memory active book still updates.
    }
  }, [activeBookId])

  const recordNavigationTarget = (targetId: string) => {
    const originId = locationSentenceId ?? currentSentenceId
    if (!originId || originId === targetId) return
    if (!sentenceMeta.byId.has(originId) || !sentenceMeta.byId.has(targetId)) return

    setNavigationHistory((history) => {
      const entries = history.entries
      const baseEntries = history.index >= 0 ? entries.slice(0, history.index + 1) : [{ sentenceId: originId }]
      const last = baseEntries.at(-1)
      const nextEntries = last?.sentenceId === targetId ? baseEntries : [...baseEntries, { sentenceId: targetId }]

      return { entries: nextEntries, index: nextEntries.length - 1 }
    })
  }

  const selectSentence = (id: string | null, options: { recordHistory?: boolean; scrollOffset?: number } = {}) => {
    if (!book) return
    if (id && options.recordHistory) recordNavigationTarget(id)
    setCurrentSentenceId(id)
    if (!id) return
    setLocationSentenceId(id)
    if (mode === 'scroll') requestScrollToSentence(id, 'auto', 'center', options.scrollOffset)
    const nextChapterIndex = book.chapters.findIndex((ch) =>
      ch.paragraphs.some((p) => p.sentences.some((s) => s.id === id)),
    )
    if (nextChapterIndex >= 0) setChapterIndex(nextChapterIndex)

    if (isPlaying) {
      const nextIndex = sentenceIndexById.get(id)
      if (nextIndex !== undefined) {
        audioRef.current?.pause()
        const runId = ++playbackRunRef.current
        void playSentenceAtIndex(nextIndex, runId).catch((error) => {
          console.error(error)
          if (playbackRunRef.current === runId) setIsPlaying(false)
        })
      }
    }
  }

  const activeSentenceIndex = (() => {
    const anchor = currentSentenceId ?? locationSentenceId
    return anchor ? sentenceIndexById.get(anchor) : undefined
  })()

  const skipSentence = (direction: -1 | 1) => {
    if (activeSentenceIndex === undefined) return
    const nextSentence = sentences[activeSentenceIndex + direction]
    if (!nextSentence) return
    selectSentence(nextSentence.id)
  }

  const selectBookmark = (id: string, offset?: number) => {
    const meta = sentenceMeta.byId.get(id)
    if (meta) setChapterIndex(meta.chapterIndex)
    selectSentence(id, { recordHistory: true, scrollOffset: offset })
  }

  const updateBookmarkPages = useCallback((pages: Record<string, BookmarkPageInfo>) => {
    setBookmarkPages((current) => {
      const currentKeys = Object.keys(current)
      const nextKeys = Object.keys(pages)
      if (
        currentKeys.length === nextKeys.length &&
        nextKeys.every((key) => {
          const currentPage = current[key]
          const nextPage = pages[key]
          return currentPage?.pageIndex === nextPage.pageIndex && currentPage?.totalPages === nextPage.totalPages
        })
      ) {
        return current
      }
      return pages
    })
  }, [])

  const toggleBookmark = (sentenceId: string, offset: number) => {
    if (!book) return
    setBookmarksByBook((current) => {
      const existing = current[book.id] ?? []
      const exists = existing.some((bookmark) => bookmark.sentenceId === sentenceId)
      const nextBookBookmarks = exists
        ? existing.filter((bookmark) => bookmark.sentenceId !== sentenceId)
        : [...existing, { sentenceId, offset }]
      return { ...current, [book.id]: nextBookBookmarks }
    })
  }

  const abortPrefetches = () => {
    prefetchControllersRef.current.forEach((controller) => controller.abort())
    prefetchControllersRef.current = []
  }

  const prefetchUpcomingSentences = (index: number, runId: number) => {
    abortPrefetches()
    const upcoming = sentences.slice(index + 1, index + 1 + PREFETCH_AHEAD_SENTENCES)
    prefetchControllersRef.current = upcoming.map((nextSentence) => {
      const controller = new AbortController()
      Effect.runFork(prefetchSpeech(nextSentence.id, nextSentence.text, defaultTtsConfig, { signal: controller.signal }))
      return controller
    })
    if (playbackRunRef.current !== runId) abortPrefetches()
  }

  const changeChapter = (index: number, edge: 'start' | 'end' = 'start', options: { recordHistory?: boolean } = {}) => {
    if (!book) return
    abortPrefetches()
    const clamped = Math.max(0, Math.min(book.chapters.length - 1, index))
    const targetChapter = book.chapters[clamped]
    const chapterSentences = targetChapter.paragraphs.flatMap((p) => p.sentences)
    const anchor = edge === 'end' ? chapterSentences.at(-1)?.id : chapterSentences[0]?.id
    if (anchor && options.recordHistory !== false) recordNavigationTarget(anchor)
    setChapterIndex(clamped)
    setCurrentSentenceId(null)
    setLocationSentenceId(mode === 'paginated' ? anchor ?? null : null)
    if (mode === 'scroll') requestScrollToChapter(clamped)
  }

  const goBackInNavigationHistory = () => {
    const previousIndex = navigationHistory.index - 1
    const previous = navigationHistory.entries[previousIndex]
    if (!previous) return
    const meta = sentenceMeta.byId.get(previous.sentenceId)
    if (!meta) {
      setNavigationHistory((history) => ({
        entries: history.entries.filter((_, index) => index !== previousIndex),
        index: Math.min(previousIndex, history.entries.length - 2),
      }))
      return
    }
    setNavigationHistory((history) => ({ ...history, index: previousIndex }))
    setChapterIndex(meta.chapterIndex)
    setCurrentSentenceId(previous.sentenceId)
    setLocationSentenceId(previous.sentenceId)
    if (mode === 'scroll') requestScrollToSentence(previous.sentenceId, 'auto', 'center')
  }

  const syncToCurrentSentence = () => {
    if (!currentSentenceId) return
    const meta = sentenceMeta.byId.get(currentSentenceId)
    if (meta) setChapterIndex(meta.chapterIndex)
    setLocationSentenceId(currentSentenceId)
    setSyncKey((key) => key + 1)
    if (mode === 'scroll') requestScrollToSentence(currentSentenceId, 'auto', 'center')
  }

  const seekToProgress = (pct: number) => {
    if (!book) return
    const clampedPct = Math.max(0, Math.min(1, pct))
    if (sentences.length === 0) return

    const sentence = (() => {
      if (mode === 'paginated' && counterMode === 'chapter') {
        const chapterSentences = book.chapters[chapterIndex]?.paragraphs.flatMap((p) => p.sentences) ?? []
        if (chapterSentences.length === 0) return null
        return chapterSentences[Math.round(clampedPct * (chapterSentences.length - 1))]
      }
      return sentences[Math.round(clampedPct * (sentences.length - 1))]
    })()

    if (!sentence) return
    const meta = sentenceMeta.byId.get(sentence.id)
    if (!meta) return

    setChapterIndex(meta.chapterIndex)
    setCurrentSentenceId(null)
    setLocationSentenceId(sentence.id)
    if (mode === 'scroll') requestScrollToSentence(sentence.id)
  }

  useEffect(() => {
    if (mode !== 'scroll') return
    const anchor = currentSentenceId ?? locationSentenceId
    if (anchor) requestScrollToSentence(anchor, 'auto', 'center')
    else requestScrollToChapter(chapterIndex)
  }, [mode])

  const playSentenceAtIndex = async (index: number, runId: number) => {
    const sentence = sentences[index]
    if (!sentence) {
      setIsPlaying(false)
      return
    }

    setCurrentSentenceId(sentence.id)
    setLocationSentenceId(sentence.id)
    setActiveWord(null)
    if (mode === 'scroll') requestScrollToSentence(sentence.id, 'smooth')

    // Generate/cache narration at the natural 1x voice speed.
    // User speed is applied locally via HTMLAudioElement.playbackRate so we don't regenerate audio per speed.
    prefetchUpcomingSentences(index, runId)

    const bufferingTimer = window.setTimeout(() => {
      if (playbackRunRef.current === runId) setIsBuffering(true)
    }, BUFFERING_DELAY_MS)
    let audio: TtsAudio | null = null
    try {
      audio = await getSpeechAudio(sentence.id, sentence.text, defaultTtsConfig).pipe(
        Effect.catchTags({
          TtsHttpError: (error) =>
            Effect.sync(() => {
              setTtsError(ttsErrorMessage(error))
              return null
            }),
          TtsNetworkError: (error) =>
            Effect.sync(() => {
              setTtsError(ttsErrorMessage(error))
              return null
            }),
        }),
        Effect.runPromise,
      )
    } finally {
      window.clearTimeout(bufferingTimer)
      if (playbackRunRef.current === runId) setIsBuffering(false)
    }
    if (playbackRunRef.current !== runId) return
    if (!audio) {
      setIsPlaying(false)
      return
    }

    audioRef.current?.pause()
    const element = new Audio(audio.url)
    audioRef.current = element
    element.playbackRate = speedRef.current
    let wordCursor = 0
    const updateActiveWord = () => {
      if (playbackRunRef.current !== runId || element.paused || element.ended) return
      const currentTime = element.currentTime
      while (
        wordCursor < audio.words.length - 1 &&
        currentTime >= audio.words[wordCursor + 1].start
      ) {
        wordCursor++
      }
      const word = audio.words[wordCursor]
      if (word) {
        const nextWord = audio.words[wordCursor + 1]
        const gapToNext = nextWord ? nextWord.start - word.end : 0
        const isShortPunctuationPause = currentTime > word.end && gapToNext > 0 && gapToNext <= 0.45 && currentTime < nextWord.start
        const shouldHighlight =
          (currentTime >= word.start && currentTime <= word.end + 0.06) ||
          isShortPunctuationPause

        if (shouldHighlight) {
          const wordIndex = wordCursor
          const occurrence = audio.words
            .slice(0, wordIndex + 1)
            .filter((candidate) => normalizeWord(candidate.text) === normalizeWord(word.text)).length - 1
          setActiveWord((current) =>
            current?.sentenceId === sentence.id &&
            current.wordIndex === wordIndex &&
            current.isPunctuationPause === isShortPunctuationPause
              ? current
              : { sentenceId: sentence.id, wordIndex, occurrence, text: word.text, isPunctuationPause: isShortPunctuationPause },
          )
        } else if (currentTime > word.end + 0.12) {
          setActiveWord(null)
        }
      }
      wordFrameRef.current = requestAnimationFrame(updateActiveWord)
    }
    if (wordFrameRef.current) cancelAnimationFrame(wordFrameRef.current)
    wordFrameRef.current = requestAnimationFrame(updateActiveWord)
    element.onended = () => {
      if (playbackRunRef.current !== runId) return
      void playSentenceAtIndex(index + 1, runId)
    }
    element.onerror = () => {
      if (playbackRunRef.current === runId) setIsPlaying(false)
    }
    await element.play()
  }

  const startPlayback = () => {
    const anchor = currentSentenceId ?? locationSentenceId ?? chapter?.paragraphs[0]?.sentences[0]?.id
    const startIndex = anchor ? sentenceIndexById.get(anchor) ?? 0 : 0
    const runId = ++playbackRunRef.current
    setIsPlaying(true)
    void playSentenceAtIndex(startIndex, runId).catch((error) => {
      console.error(error)
      if (playbackRunRef.current === runId) setIsPlaying(false)
    })
  }

  const stopPlayback = () => {
    playbackRunRef.current++
    abortPrefetches()
    setIsBuffering(false)
    if (wordFrameRef.current) cancelAnimationFrame(wordFrameRef.current)
    wordFrameRef.current = 0
    audioRef.current?.pause()
    audioRef.current = null
    setActiveWord(null)
    setIsPlaying(false)
  }

  useEffect(() => {
    speedRef.current = speed
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  useEffect(() => {
    return () => {
      playbackRunRef.current++
      abortPrefetches()
      if (wordFrameRef.current) cancelAnimationFrame(wordFrameRef.current)
      audioRef.current?.pause()
    }
  }, [])

  const handleOpenEpub = async (file: File | undefined) => {
    if (!file) return
    setIsLoadingBook(true)
    closeOverlay('library')
    try {
      const nextBook = await loadEpub(file)
      if (nextBook.chapters.length === 0) {
        window.alert('No readable chapters found in this EPUB.')
        return
      }
      setLibrary((books) => [nextBook, ...books.filter((book) => book.id !== nextBook.id)])
      setActiveBookId(nextBook.id)
      setBook(nextBook)
      setChapterIndex(0)
      setCurrentSentenceId(null)
      setNavigationHistory({ entries: [], index: -1 })
      setLocationSentenceId(nextBook.chapters[0].paragraphs[0]?.sentences[0]?.id ?? null)
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      window.alert(`Could not open this EPUB. ${message}`)
    } finally {
      setIsLoadingBook(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const selectBookFromLibrary = (bookId: string) => {
    const nextBook = library.find((candidate) => candidate.id === bookId)
    if (!nextBook) return
    stopPlayback()
    setActiveBookId(nextBook.id)
    setBook(nextBook)
    setNavigationHistory({ entries: [], index: -1 })

    const progress = readProgressByBook()[nextBook.id]
    const nextChapterIndex = Math.max(0, Math.min(nextBook.chapters.length - 1, progress?.chapterIndex ?? 0))
    const savedLocationId = progress?.locationSentenceId ?? progress?.currentSentenceId ?? null
    const savedLocationExists = savedLocationId
      ? nextBook.chapters.some((chapter) =>
          chapter.paragraphs.some((paragraph) => paragraph.sentences.some((sentence) => sentence.id === savedLocationId)),
        )
      : false
    const fallbackLocationId = nextBook.chapters[nextChapterIndex]?.paragraphs[0]?.sentences[0]?.id ?? null
    const nextLocationId = savedLocationExists ? savedLocationId : fallbackLocationId

    setChapterIndex(nextChapterIndex)
    setCounterMode(progress?.counterMode === 'book' ? 'book' : 'chapter')
    setCurrentSentenceId(progress?.currentSentenceId ?? null)
    setLocationSentenceId(nextLocationId)
    if (mode === 'scroll') {
      if (nextLocationId) requestScrollToSentence(nextLocationId)
      else requestScrollToChapter(nextChapterIndex)
    }
    closeOverlay('library')
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      {!isLoadingBook && book && chapter && (
        <BookHeader
          book={book}
          chapter={chapter}
          mode={mode}
          onModeChange={setMode}
          onOpenLibrary={() => {
            closeOverlay('toc')
            closeOverlay('bookmarks')
            closeOverlay('settings')
            openOverlay('library')
          }}
          onOpenToc={() => {
            closeOverlay('library')
            closeOverlay('bookmarks')
            closeOverlay('settings')
            openOverlay('toc')
          }}
          onOpenBookmarks={() => {
            closeOverlay('library')
            closeOverlay('toc')
            closeOverlay('settings')
            openOverlay('bookmarks')
          }}
          onOpenSettings={() => {
            closeOverlay('library')
            closeOverlay('toc')
            closeOverlay('bookmarks')
            setReaderTypography({ fontSize, lineHeight, measure })
            setSettingsSession((session) => session + 1)
            openOverlay('settings')
          }}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,application/epub+zip"
        className="hidden"
        onChange={(e) => handleOpenEpub(e.currentTarget.files?.[0])}
      />

      {ttsError && (
        <div
          role="alert"
          className="surface-floating fixed inset-x-0 top-20 z-40 mx-auto flex w-fit max-w-[min(24rem,calc(100vw-2rem))] animate-(--animate-toast-in) items-center gap-2 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-200"
          style={{ transformOrigin: 'top center' }}
        >
          <span className="size-1.5 shrink-0 rounded-full bg-red-500/80 dark:bg-red-400/80" />
          {ttsError}
        </div>
      )}

      <main>
        {isLoadingBook ? (
          <BookLoadingView />
        ) : !book ? (
          <EmptyLibraryView onAddBook={() => fileInputRef.current?.click()} />
        ) : (
          <Reader
            book={book}
            chapterIndex={chapterIndex}
            onChapterChange={changeChapter}
            mode={mode}
            fontSize={readerFontSize}
            lineHeight={readerLineHeight}
            measure={readerMeasure}
            currentSentenceId={currentSentenceId}
            locationSentenceId={locationSentenceId}
            activeWord={activeWord}
            bookmarkBySentenceId={bookmarkBySentenceId}
            onSentenceSelect={(id) => selectSentence(id, { recordHistory: true })}
            onBookmarkToggle={toggleBookmark}
            onLocationChange={setLocationSentenceId}
            onPaginationChange={setPaginationInfo}
            onBookmarkPagesChange={updateBookmarkPages}
            scrollRequest={scrollRequest}
            syncKey={syncKey}
            onCurrentSentenceVisibilityChange={setIsCurrentSentenceVisible}
          />
        )}
      </main>

      {!isLoadingBook && book && (
        <PlaybackBar
          playback={{
            state: isPlaying ? 'playing' : 'paused',
            buffering: isBuffering,
            canSkipBackward: activeSentenceIndex !== undefined && activeSentenceIndex > 0,
            canSkipForward: activeSentenceIndex !== undefined && activeSentenceIndex < sentences.length - 1,
            onToggle: () => {
              if (isPlaying) stopPlayback()
              else startPlayback()
            },
            onSkipBackward: () => skipSentence(-1),
            onSkipForward: () => skipSentence(1),
          }}
          navigation={{
            canGoBack: navigationHistory.index > 0,
            onGoBack: goBackInNavigationHistory,
            canSync: !!currentSentenceId && !isCurrentSentenceVisible,
            onSync: syncToCurrentSentence,
          }}
          progress={{
            mode,
            paginationInfo,
            scrollProgressInfo,
            counterMode,
            onToggleCounterMode: () => setCounterMode((m) => (m === 'chapter' ? 'book' : 'chapter')),
            onSeek: seekToProgress,
          }}
        />
      )}

      <BookLibrary
        open={libraryOpen}
        books={library}
        currentBookId={book?.id ?? ''}
        onClose={() => closeOverlay('library')}
        onAddBook={() => fileInputRef.current?.click()}
        onSelectBook={selectBookFromLibrary}
      />

      {book && (
        <TableOfContents
          book={book}
          currentChapterIndex={chapterIndex}
          open={tocOpen}
          onClose={() => closeOverlay('toc')}
          onSelectChapter={(index) => changeChapter(index, 'start', { recordHistory: true })}
        />
      )}

      <BookmarksMenu
        open={bookmarksOpen}
        bookTitle={book?.title ?? 'Bookmarks'}
        items={bookmarkMenuItems}
        onClose={() => closeOverlay('bookmarks')}
        onSelectBookmark={selectBookmark}
      />

      <ReaderSettings
        key={settingsSession}
        open={settingsOpen}
        onClose={() => closeOverlay('settings')}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        lineHeight={lineHeight}
        onLineHeightChange={setLineHeight}
        measure={measure}
        onMeasureChange={setMeasure}
        theme={theme}
        onThemeChange={setTheme}
        mode={mode}
        onModeChange={setMode}
        speed={speed}
        onSpeedChange={setSpeed}
      />
    </div>
  )
}
