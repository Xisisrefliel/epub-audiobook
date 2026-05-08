import { Effect } from 'effect'

type KokoroVoice = 'af_bella' | string
type KokoroFormat = 'mp3' | 'opus' | 'flac' | 'wav' | 'pcm'

export type TtsConfig = {
  model: string
  voice: KokoroVoice
  format: KokoroFormat
  speed: number
  serviceTier?: 'default' | 'priority'
}

type TtsWord = {
  id?: number
  start: number
  end: number
  text: string
}

export type TtsAudio = {
  key: string
  blob: Blob
  url: string
  words: TtsWord[]
}

type CacheEntry =
  | { status: 'ready'; audio: TtsAudio }
  | { status: 'pending'; promise: Promise<TtsAudio> }

const audioCache = new Map<string, CacheEntry>()

export const defaultTtsConfig: TtsConfig = {
  model: 'hexgrad/Kokoro-82M',
  voice: 'af_bella',
  format: 'mp3',
  speed: 1,
  serviceTier: 'default',
}

class TtsHttpError extends Error {
  readonly _tag = 'TtsHttpError'
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

class TtsNetworkError extends Error {
  readonly _tag = 'TtsNetworkError'
}

function makeTtsKey(sentenceId: string, text: string, config: TtsConfig) {
  return [config.model, config.voice, config.format, config.speed, sentenceId, hashText(text)].join(':')
}

export function getSpeechAudio(
  sentenceId: string,
  text: string,
  config: TtsConfig = defaultTtsConfig,
  options: { signal?: AbortSignal } = {},
) {
  const key = makeTtsKey(sentenceId, text, config)
  const cached = audioCache.get(key)
  if (cached?.status === 'ready') return Effect.succeed(cached.audio)
  if (cached?.status === 'pending') return Effect.tryPromise(() => cached.promise)

  const promise = Effect.runPromise(generateSpeech(key, text, config, options.signal))
  audioCache.set(key, { status: 'pending', promise })
  return Effect.tryPromise(() => promise).pipe(
    Effect.tap((audio) => Effect.sync(() => audioCache.set(key, { status: 'ready', audio }))),
    Effect.tapError(() => Effect.sync(() => audioCache.delete(key))),
  )
}

export function prefetchSpeech(
  sentenceId: string,
  text: string,
  config: TtsConfig = defaultTtsConfig,
  options: { signal?: AbortSignal } = {},
) {
  return getSpeechAudio(sentenceId, text, config, options).pipe(Effect.asVoid, Effect.ignore)
}

function generateSpeech(key: string, text: string, config: TtsConfig, signal?: AbortSignal) {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch('/api/tts', {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            output_format: config.format,
            preset_voice: [config.voice],
            speed: config.speed,
            service_tier: config.serviceTier,
            return_timestamps: true,
            stream: false,
          }),
        }),
      catch: (error) => new TtsNetworkError(error instanceof Error ? error.message : 'TTS network error'),
    })

    if (!response.ok) {
      const message = yield* Effect.tryPromise(() => response.text()).pipe(
        Effect.catchAll(() => Effect.succeed(response.statusText)),
      )
      return yield* Effect.fail(new TtsHttpError(response.status, message))
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json() as Promise<{ audio: string; words?: TtsWord[]; output_format?: string }>,
      catch: (error) => new TtsNetworkError(error instanceof Error ? error.message : 'Could not read TTS response'),
    })
    const blob = audioStringToBlob(json.audio, config.format)
    return { key, blob, url: URL.createObjectURL(blob), words: json.words ?? [] }
  })
}

function audioStringToBlob(audio: string, format: KokoroFormat) {
  const base64 = audio.includes(',') ? audio.split(',').at(-1)! : audio
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeTypeForFormat(format) })
}

function mimeTypeForFormat(format: KokoroFormat) {
  switch (format) {
    case 'mp3':
      return 'audio/mpeg'
    case 'opus':
      return 'audio/ogg; codecs=opus'
    case 'flac':
      return 'audio/flac'
    case 'wav':
      return 'audio/wav'
    case 'pcm':
      return 'audio/pcm'
  }
}

function hashText(value: string) {
  let hash = 5381
  for (let i = 0; i < value.length; i++) hash = (hash * 33) ^ value.charCodeAt(i)
  return (hash >>> 0).toString(36)
}
