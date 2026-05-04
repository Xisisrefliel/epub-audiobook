import { useEffect, useMemo, useRef, useState } from 'react'
import { Effect } from 'effect'
import { BookHeader } from './components/BookHeader'
import { Reader } from './components/Reader'
import { PlaybackBar } from './components/PlaybackBar'
import { ReaderSettings } from './components/ReaderSettings'
import { TableOfContents } from './components/TableOfContents'
import { BookLibrary } from './components/BookLibrary'
import { sampleBook } from './data/sampleChapter'
import { loadEpub } from './epub/loadEpub'
import { defaultTtsConfig, getSpeechAudio, prefetchSpeech } from './tts/kokoroTts'
import type { TtsAudio } from './tts/kokoroTts'
import type { ActiveWord, Book, CounterMode, PaginationInfo, ReaderMode, ScrollProgressInfo, ScrollRequest, Theme } from './types'

const STORAGE_PREFIX = 'audiobook-ui.'
const PLAYBACK_SPEED_STORAGE_KEY = `${STORAGE_PREFIX}playbackSpeed`
const BOOK_STORAGE_KEY = `${STORAGE_PREFIX}book`
const LIBRARY_STORAGE_KEY = `${STORAGE_PREFIX}library`
const ACTIVE_BOOK_STORAGE_KEY = `${STORAGE_PREFIX}activeBookId`
const PROGRESS_STORAGE_KEY = `${STORAGE_PREFIX}progress`
const PROGRESS_BY_BOOK_STORAGE_KEY = `${STORAGE_PREFIX}progressByBook`
const SETTINGS_STORAGE_KEY = `${STORAGE_PREFIX}settings`
const PREFETCH_AHEAD_SENTENCES = 4
const BUFFERING_DELAY_MS = 350

type StoredProgress = {
  chapterIndex?: number
  currentSentenceId?: string | null
  locationSentenceId?: string | null
  counterMode?: CounterMode
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
  const storedLibrary = readJson<Book[]>(LIBRARY_STORAGE_KEY)?.filter((book) => book?.chapters?.length) ?? []
  const legacyBook = readJson<Book>(BOOK_STORAGE_KEY)
  const books = storedLibrary.length ? storedLibrary : legacyBook?.chapters?.length ? [legacyBook] : [sampleBook]
  return books.some((book) => book.id === sampleBook.id) ? books : [sampleBook, ...books]
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
  const storedSettings = useMemo(readStoredSettings, [])
  const progressByBook = useMemo(readProgressByBook, [])
  const fallbackProgress = useMemo(readStoredProgress, [])
  const [mode, setMode] = useState<ReaderMode>(storedSettings.mode === 'paginated' ? 'paginated' : 'scroll')
  const [theme, setTheme] = useState<Theme>(
    storedSettings.theme === 'light' || storedSettings.theme === 'dark' || storedSettings.theme === 'system'
      ? storedSettings.theme
      : 'system',
  )
  const [fontSize, setFontSize] = useState(
    Number.isFinite(storedSettings.fontSize) ? Math.min(28, Math.max(14, storedSettings.fontSize ?? 19)) : 19,
  )
  const [lineHeight, setLineHeight] = useState(
    Number.isFinite(storedSettings.lineHeight) ? Math.min(2.2, Math.max(1.25, storedSettings.lineHeight ?? 1.65)) : 1.65,
  )
  const [measure, setMeasure] = useState(
    Number.isFinite(storedSettings.measure) ? Math.min(84, Math.max(42, storedSettings.measure ?? 62)) : 62,
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(() => readStoredPlaybackSpeed(storedSettings))
  const [library, setLibrary] = useState<Book[]>(readStoredLibrary)
  const [activeBookId, setActiveBookId] = useState(() => window.localStorage.getItem(ACTIVE_BOOK_STORAGE_KEY) ?? library[0]?.id ?? sampleBook.id)
  const [book, setBook] = useState<Book>(() => library.find((candidate) => candidate.id === activeBookId) ?? library[0] ?? sampleBook)
  const initialProgress = progressByBook[book.id] ?? fallbackProgress
  const [chapterIndex, setChapterIndex] = useState(() => Math.max(0, initialProgress.chapterIndex ?? 0))
  const [isLoadingBook, setIsLoadingBook] = useState(false)
  const [paginationInfo, setPaginationInfo] = useState<PaginationInfo | null>(null)
  const [counterMode, setCounterMode] = useState<CounterMode>(initialProgress.counterMode === 'book' ? 'book' : 'chapter')
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(null)
  const [syncKey, setSyncKey] = useState(0)
  const scrollRequestKeyRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playbackRunRef = useRef(0)
  const speedRef = useRef(speed)
  const wordFrameRef = useRef(0)
  const prefetchControllersRef = useRef<AbortController[]>([])
  const [isBuffering, setIsBuffering] = useState(false)
  const [isCurrentSentenceVisible, setIsCurrentSentenceVisible] = useState(false)

  useTheme(theme)

  const requestScrollToSentence = (id: string) => {
    setScrollRequest({ key: ++scrollRequestKeyRef.current, type: 'sentence', id })
  }

  const requestScrollToChapter = (index: number) => {
    setScrollRequest({ key: ++scrollRequestKeyRef.current, type: 'chapter', chapterIndex: index })
  }

  const chapter = book.chapters[chapterIndex] ?? book.chapters[0]

  const sentenceMeta = useMemo(() => {
    const byId = new Map<string, { chapterIndex: number; chapterSentenceIndex: number; bookSentenceIndex: number }>()
    const chapterSentenceCounts = book.chapters.map((ch) =>
      ch.paragraphs.reduce((sum, p) => sum + p.sentences.length, 0),
    )
    const sentences = book.chapters.flatMap((ch, chapterIndex) => {
      let chapterSentenceIndex = 0
      return ch.paragraphs.flatMap((p) =>
        p.sentences.map((sentence) => {
          const bookSentenceIndex = byId.size
          byId.set(sentence.id, { chapterIndex, chapterSentenceIndex, bookSentenceIndex })
          chapterSentenceIndex++
          return sentence
        }),
      )
    })
    return { byId, chapterSentenceCounts, sentences }
  }, [book])

  const sentences = sentenceMeta.sentences
  const sentenceIndexById = useMemo(() => {
    const map = new Map<string, number>()
    sentences.forEach((sentence, index) => map.set(sentence.id, index))
    return map
  }, [sentences])
  const [currentSentenceId, setCurrentSentenceId] = useState<string | null>(initialProgress.currentSentenceId ?? null)
  const [locationSentenceId, setLocationSentenceId] = useState<string | null>(initialProgress.locationSentenceId ?? null)
  const [activeWord, setActiveWord] = useState<ActiveWord | null>(null)

  const scrollProgressInfo = useMemo<ScrollProgressInfo | null>(() => {
    const anchorId = locationSentenceId ?? currentSentenceId ?? chapter?.paragraphs[0]?.sentences[0]?.id
    const meta = anchorId ? sentenceMeta.byId.get(anchorId) : null
    if (!meta || sentences.length === 0) return null
    return {
      chapterIndex: meta.chapterIndex,
      chapterTotal: book.chapters.length,
      chapterSentenceIndex: meta.chapterSentenceIndex,
      chapterSentenceTotal: sentenceMeta.chapterSentenceCounts[meta.chapterIndex] ?? 0,
      bookSentenceIndex: meta.bookSentenceIndex,
      bookSentenceTotal: sentences.length,
    }
  }, [book.chapters.length, chapter, currentSentenceId, locationSentenceId, sentenceMeta, sentences.length])

  useEffect(() => {
    setChapterIndex((index) => Math.max(0, Math.min(book.chapters.length - 1, index)))
    setCurrentSentenceId((id) =>
      id && sentences.some((s) => s.id === id) ? id : null,
    )
    setLocationSentenceId((id) =>
      id && sentences.some((s) => s.id === id) ? id : null,
    )
  }, [book.chapters.length, sentences])

  useEffect(() => {
    writeJson(SETTINGS_STORAGE_KEY, { mode, theme, fontSize, lineHeight, measure, speed })
    try {
      window.localStorage.setItem(PLAYBACK_SPEED_STORAGE_KEY, String(speed))
    } catch {}
  }, [mode, theme, fontSize, lineHeight, measure, speed])

  useEffect(() => {
    const progress = { chapterIndex, currentSentenceId, locationSentenceId, counterMode }
    writeJson(PROGRESS_STORAGE_KEY, progress)
    writeJson(PROGRESS_BY_BOOK_STORAGE_KEY, { ...readProgressByBook(), [book.id]: progress })
  }, [book.id, chapterIndex, currentSentenceId, locationSentenceId, counterMode])

  useEffect(() => {
    writeJson(LIBRARY_STORAGE_KEY, library)
  }, [library])

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_BOOK_STORAGE_KEY, activeBookId)
    } catch {}
  }, [activeBookId])

  const selectSentence = (id: string | null) => {
    setCurrentSentenceId(id)
    if (!id) return
    setLocationSentenceId(id)
    if (mode === 'scroll') requestScrollToSentence(id)
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

  const changeChapter = (index: number, edge: 'start' | 'end' = 'start') => {
    abortPrefetches()
    const clamped = Math.max(0, Math.min(book.chapters.length - 1, index))
    const targetChapter = book.chapters[clamped]
    const chapterSentences = targetChapter.paragraphs.flatMap((p) => p.sentences)
    const anchor = edge === 'end' ? chapterSentences.at(-1)?.id : chapterSentences[0]?.id
    setChapterIndex(clamped)
    setCurrentSentenceId(null)
    setLocationSentenceId(mode === 'paginated' ? anchor ?? null : null)
    if (mode === 'scroll') requestScrollToChapter(clamped)
  }

  const syncToCurrentSentence = () => {
    if (!currentSentenceId) return
    const meta = sentenceMeta.byId.get(currentSentenceId)
    if (meta) setChapterIndex(meta.chapterIndex)
    setLocationSentenceId(currentSentenceId)
    setSyncKey((key) => key + 1)
    if (mode === 'scroll') requestScrollToSentence(currentSentenceId)
  }

  const seekToProgress = (pct: number) => {
    const clampedPct = Math.max(0, Math.min(1, pct))
    if (sentences.length === 0) return

    const sentence = (() => {
      if (counterMode === 'chapter') {
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
    if (anchor) requestScrollToSentence(anchor)
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
    if (mode === 'scroll') requestScrollToSentence(sentence.id)

    // Generate/cache narration at the natural 1x voice speed.
    // User speed is applied locally via HTMLAudioElement.playbackRate so we don't regenerate audio per speed.
    prefetchUpcomingSentences(index, runId)

    const bufferingTimer = window.setTimeout(() => {
      if (playbackRunRef.current === runId) setIsBuffering(true)
    }, BUFFERING_DELAY_MS)
    let audio: TtsAudio
    try {
      audio = await Effect.runPromise(getSpeechAudio(sentence.id, sentence.text, defaultTtsConfig))
    } finally {
      window.clearTimeout(bufferingTimer)
      if (playbackRunRef.current === runId) setIsBuffering(false)
    }
    if (playbackRunRef.current !== runId) return

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
    try {
      const nextBook = await loadEpub(file)
      if (nextBook.chapters.length === 0) {
        window.alert('No readable chapters found in this EPUB.')
        return
      }
      setLibrary((books) => [nextBook, ...books.filter((book) => book.id !== nextBook.id)])
      setActiveBookId(nextBook.id)
      setBook(nextBook)
      setLibraryOpen(false)
      setChapterIndex(0)
      setCurrentSentenceId(null)
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
    setLibraryOpen(false)
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <BookHeader
        book={book}
        chapter={chapter}
        mode={mode}
        onModeChange={setMode}
        onOpenLibrary={() => setLibraryOpen(true)}
        onOpenToc={() => setTocOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,application/epub+zip"
        className="hidden"
        onChange={(e) => handleOpenEpub(e.currentTarget.files?.[0])}
      />

      {isLoadingBook && (
        <div
          role="status"
          className="surface-floating fixed inset-x-0 top-20 z-40 mx-auto flex w-fit animate-(--animate-toast-in) items-center gap-2 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-200"
          style={{ transformOrigin: 'top center' }}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500 dark:bg-zinc-400" />
          Opening EPUB…
        </div>
      )}

      <main>
        <Reader
          book={book}
          chapterIndex={chapterIndex}
          onChapterChange={changeChapter}
          mode={mode}
          fontSize={fontSize}
          lineHeight={lineHeight}
          measure={measure}
          currentSentenceId={currentSentenceId}
          locationSentenceId={locationSentenceId}
          activeWord={activeWord}
          onSentenceSelect={selectSentence}
          onLocationChange={setLocationSentenceId}
          onPaginationChange={setPaginationInfo}
          scrollRequest={scrollRequest}
          syncKey={syncKey}
          onCurrentSentenceVisibilityChange={setIsCurrentSentenceVisible}
        />
      </main>

      <PlaybackBar
        isPlaying={isPlaying}
        onTogglePlay={() => {
          if (isPlaying) stopPlayback()
          else startPlayback()
        }}
        speed={speed}
        onSpeedChange={setSpeed}
        isBuffering={isBuffering}
        canSync={!!currentSentenceId && !isCurrentSentenceVisible}
        onSync={syncToCurrentSentence}
        mode={mode}
        paginationInfo={paginationInfo}
        scrollProgressInfo={scrollProgressInfo}
        counterMode={counterMode}
        onToggleCounterMode={() => setCounterMode((m) => (m === 'chapter' ? 'book' : 'chapter'))}
        onProgressSeek={seekToProgress}
      />

      <BookLibrary
        open={libraryOpen}
        books={library}
        currentBookId={book.id}
        onClose={() => setLibraryOpen(false)}
        onAddBook={() => fileInputRef.current?.click()}
        onSelectBook={selectBookFromLibrary}
      />

      <TableOfContents
        book={book}
        currentChapterIndex={chapterIndex}
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        onSelectChapter={changeChapter}
      />

      <ReaderSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
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
      />
    </div>
  )
}
