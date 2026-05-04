# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `bun run dev` — Bun API server plus Vite dev server with HMR
- `bun run build` — `tsc -b` then `vite build`
- `bun run start` — Bun production server for `dist/` plus `/api/tts`
- `bun run lint` — ESLint over the repo
- `bun run preview` — Bun production server for `dist/` plus `/api/tts`

There is no test runner configured.

The Bun server requires `DEEPINFRA_API_KEY` in `.env` (DeepInfra hosts the Kokoro-82M model). The browser calls `/api/tts`; never expose this key with a `VITE_` prefix.

## Architecture

Real-time text-to-speech audiobook reader. Vite + React 19 + TypeScript + Tailwind v4. State lives in `App.tsx`; persistence is `localStorage` under the `audiobook-ui.` prefix.

### Reading pipeline

1. **EPUB ingestion** — `src/epub/loadEpub.ts` unzips with `jszip`, reads `META-INF/container.xml` → OPF → spine, walks each spine doc's block elements, splits text via `splitSentences.ts`, and produces a `Book` (`Chapter[]` → `Paragraph[]` → `Sentence[]`). Also extracts cover and TOC (HTML nav, then NCX, then generated). The bundled `sampleBook` is always pinned to the front of the library.
2. **Layout measurement (pretext)** — `src/utils/pretextLayout.ts` wraps `@chenglou/pretext` to compute line ranges, line counts, and per-line `TextPart`s (sentence id + sub-string offsets). All results are memoized in `WeakMap`s keyed by `Paragraph` (and inner `Map` keyed by font string). **Pretext is used for measurement only** — actual rendering is plain React + Tailwind.
3. **Rendering** — `Reader.tsx` is a thin router selecting `ReaderScroll` or `ReaderPaginated` based on `mode`. Both are first-class; never assume one. Sentences are the atomic playback unit (see `src/types.ts`); word-level highlight overlays via `SentenceHighlight.tsx` using pretext-derived word boxes.
4. **Playback** — `src/tts/kokoroTts.ts` calls the local `/api/tts` endpoint with `return_timestamps: true`; `server.ts` proxies that request to DeepInfra's Kokoro-82M endpoint using the server-only `DEEPINFRA_API_KEY`. Audio is generated at the natural 1× voice speed and cached in an in-memory `Map` keyed by `model:voice:format:speed:sentenceId:hashText`. User speed is applied via `HTMLAudioElement.playbackRate` so changing speed never re-fetches. `App.tsx` owns the play loop: a `playbackRunRef` token cancels stale runs, the next sentence is prefetched while the current plays, and a `requestAnimationFrame` cursor walks `audio.words` to drive `activeWord`.

### State ownership

All cross-component state is in `App.tsx`:
- Reading position is split into `currentSentenceId` (what's playing/selected) and `locationSentenceId` (anchor for scroll restore / pagination), tracked separately because they diverge during scroll-without-play.
- `scrollRequest` is a keyed sentinel (`{ key, type, … }`) the reader watches to imperatively jump — bumping `scrollRequestKeyRef` triggers a single scroll without coupling components.
- Per-book progress is persisted under `audiobook-ui.progressByBook`; the legacy single-book key (`progress`) is still read as a fallback.

### Theming

Class-based dark mode via `@custom-variant dark (&:where(.dark, .dark *));` in `src/index.css`. Theme is `light | dark | system`; `useTheme` in `App.tsx` toggles `.dark` on `<html>` and listens to `prefers-color-scheme` when on `system`.

### Effect

`effect` is used for the TTS layer (`Effect.tryPromise`, tagged errors `TtsConfigError` / `TtsHttpError` / `TtsNetworkError`). The rest of the app is plain async/await — don't propagate Effect into UI code.
