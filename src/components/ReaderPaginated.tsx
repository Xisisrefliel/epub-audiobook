import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { Bookmark, ChevronLeft, ChevronRight } from "lucide-react";
import type {
  ActiveWord,
  Book,
  BookmarkPageInfo,
  Bookmark as BookmarkAnchor,
  Chapter,
  HighlightTheme,
  PaginationInfo,
} from "../types";
import {
  measureParagraphLines,
  walkParagraphLineParts,
  type TextPart,
} from "../utils/pretextLayout";
import { SentenceHighlight } from "./SentenceHighlight";
import { WordHighlight } from "./WordHighlight";
import { HighlightedText } from "./readerHighlights";

const PARAGRAPH_GAP_LINES = 1;
const SERIF_STACK = 'Georgia, Cambria, "Times New Roman", Times, serif';
const COL_GAP_PX = 64;
const MAX_COLS = 2;
const MOBILE_BREAKPOINT_PX = 640;
const VIEWPORT_CHROME_GAP_PX = 24;
const SENTENCE_VERTICAL_PAD_PX = 12;
const SWIPE_THRESHOLD_PX = 44;
const LONG_PRESS_BOOKMARK_MS = 520;
const LONG_PRESS_FEEDBACK_MS = 140;
const LONG_PRESS_MOVE_THRESHOLD_PX = 10;
const SWIPE_VELOCITY_THRESHOLD_PX_MS = 0.45;
const SWIPE_VELOCITY_MIN_DISTANCE_PX = 24;
const WORD_MATCH_PATTERN = /[\p{L}\p{N}]+(?:['’\-‐‑‒–—][\p{L}\p{N}]+)*/gu;

type LineFragment = {
  paragraphId: string;
  parts: TextPart[];
  startsParagraph: boolean;
  endsParagraph: boolean;
};
type BookmarkTarget = { lineKey: string; sentenceId: string; offset: number };
type Column = { lines: LineFragment[] };
type Page = {
  columns: Column[];
  sentenceIds: Set<string>;
  firstSentenceId: string | null;
};

type ReaderViewport = { top: number; bottom: number; height: number };
type ReaderUiState = {
  containerWidth: number;
  readableViewport: ReaderViewport;
  isMobile: boolean;
  pageIndex: number;
  hoveredBookmarkTarget: BookmarkTarget | null;
};
type ReaderUiAction =
  | { type: "container-width"; width: number }
  | { type: "readable-viewport"; viewport: ReaderViewport }
  | { type: "is-mobile"; isMobile: boolean }
  | { type: "page-index"; pageIndex: number | ((current: number) => number) }
  | { type: "hovered-bookmark-target"; target: BookmarkTarget | null };

function readerUiReducer(state: ReaderUiState, action: ReaderUiAction): ReaderUiState {
  switch (action.type) {
    case "container-width":
      return state.containerWidth === action.width ? state : { ...state, containerWidth: action.width };
    case "readable-viewport":
      return state.readableViewport.top === action.viewport.top &&
        state.readableViewport.bottom === action.viewport.bottom &&
        state.readableViewport.height === action.viewport.height
        ? state
        : { ...state, readableViewport: action.viewport };
    case "is-mobile":
      return state.isMobile === action.isMobile ? state : { ...state, isMobile: action.isMobile };
    case "page-index": {
      const pageIndex = typeof action.pageIndex === "function" ? action.pageIndex(state.pageIndex) : action.pageIndex;
      return state.pageIndex === pageIndex ? state : { ...state, pageIndex };
    }
    case "hovered-bookmark-target":
      return state.hoveredBookmarkTarget === action.target ? state : { ...state, hoveredBookmarkTarget: action.target };
  }
}

type Props = {
  book: Book;
  chapterIndex: number;
  onChapterChange: (index: number, edge?: "start" | "end") => void;
  highlightTheme: HighlightTheme;
  fontSize: number;
  lineHeight: number;
  measure: number;
  currentSentenceId: string | null;
  locationSentenceId: string | null;
  activeWord: ActiveWord | null;
  bookmarkBySentenceId: Map<string, BookmarkAnchor>;
  onSentenceSelect: (id: string | null) => void;
  onBookmarkToggle: (id: string, offset: number) => void;
  onLocationChange: (id: string | null) => void;
  onPaginationChange: (info: PaginationInfo | null) => void;
  onBookmarkPagesChange: (pages: Record<string, BookmarkPageInfo>) => void;
  syncKey: number;
  onCurrentSentenceVisibilityChange: (visible: boolean) => void;
  chromeHidden: boolean;
};

export function ReaderPaginated({
  book,
  chapterIndex,
  highlightTheme,
  onChapterChange,
  fontSize,
  lineHeight,
  measure,
  currentSentenceId,
  locationSentenceId,
  activeWord,
  bookmarkBySentenceId,
  onSentenceSelect,
  onBookmarkToggle,
  onLocationChange,
  onPaginationChange,
  onBookmarkPagesChange,
  syncKey,
  onCurrentSentenceVisibilityChange,
  chromeHidden,
}: Props) {
  const chapter = book.chapters[chapterIndex];
  const containerRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const [{ containerWidth, readableViewport, isMobile, pageIndex, hoveredBookmarkTarget }, dispatchUi] = useReducer(
    readerUiReducer,
    undefined,
    (): ReaderUiState => ({
      containerWidth: 0,
      readableViewport: { top: 96, bottom: 220, height: 360 },
      isMobile: typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_PX,
      pageIndex: 0,
      hoveredBookmarkTarget: null,
    }),
  );
  const chapterIndexBySentenceId = useMemo(() => {
    const map = new Map<string, number>();
    book.chapters.forEach((bookChapter, index) => {
      bookChapter.paragraphs.forEach((paragraph) => {
        paragraph.sentences.forEach((sentence) => map.set(sentence.id, index));
      });
    });
    return map;
  }, [book.chapters]);
  const longPressRef = useRef<{
    timer: number;
    feedbackTimer: number;
    pointerId: number;
    sentenceId: string;
    feedbackEl: HTMLElement | null;
    x: number;
    y: number;
  } | null>(null);
  const suppressNextClickRef = useRef(false);
  const pageHeight = readableViewport.height;
  const pageFontSize = isMobile ? Math.min(fontSize, 22) : fontSize;
  const pageLineHeight = isMobile ? Math.max(lineHeight, 1.55) : lineHeight;
  const suppressNextAnchorSyncRef = useRef(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const cs = window.getComputedStyle(el);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      dispatchUi({ type: "container-width", width: Math.max(0, el.clientWidth - padX) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const update = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT_PX;
      dispatchUi({ type: "is-mobile", isMobile: mobile });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useLayoutEffect(() => {
    let frame = 0;

    const update = () => {
      const topBars = Array.from(
        document.querySelectorAll<HTMLElement>('[data-reader-chrome="top"]'),
      );
      const bottomBars = Array.from(
        document.querySelectorAll<HTMLElement>('[data-reader-chrome="bottom"]'),
      );
      const topEdge = Math.max(
        0,
        ...topBars.map((el) => el.getBoundingClientRect().bottom),
      );
      const bottomEdge = Math.min(
        window.innerHeight,
        ...bottomBars.map((el) => el.getBoundingClientRect().top),
      );
      const top = Math.ceil(topEdge + VIEWPORT_CHROME_GAP_PX);
      const bottom = Math.ceil(
        Math.max(0, window.innerHeight - bottomEdge + VIEWPORT_CHROME_GAP_PX),
      );
      const height = Math.max(
        180,
        Math.floor(bottomEdge - VIEWPORT_CHROME_GAP_PX - top),
      );

      dispatchUi({ type: "readable-viewport", viewport: { top, bottom, height } });
    };

    const scheduleUpdate = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);

    const observed = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reader-chrome]'),
    );
    const ro = new ResizeObserver(scheduleUpdate);
    observed.forEach((el) => ro.observe(el));

    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
    };
  }, []);

  const layoutInfo = useMemo(() => {
    if (!containerWidth) return null;
    const articleInnerPadX = isMobile ? 8 : 0;
    const availableWidth = Math.max(1, containerWidth - articleInnerPadX);
    const targetColPx =
      Math.min(measure, isMobile ? 60 : measure) * pageFontSize * 0.5;
    const fits = Math.floor(
      (availableWidth + COL_GAP_PX) / (targetColPx + COL_GAP_PX),
    );
    const colCount = isMobile ? 1 : Math.max(1, Math.min(MAX_COLS, fits));
    const columnWidth = Math.min(
      targetColPx,
      (availableWidth - COL_GAP_PX * (colCount - 1)) / colCount,
    );
    const articleWidth = columnWidth * colCount + COL_GAP_PX * (colCount - 1);
    return { colCount, columnWidth, articleWidth };
  }, [containerWidth, isMobile, measure, pageFontSize]);

  const chapterTotal = useMemo(() => {
    if (!layoutInfo || !pageHeight) return 0;
    return getCachedChapterPageCount(
      chapter,
      layoutInfo,
      pageHeight,
      pageFontSize,
      pageLineHeight,
    );
  }, [chapter, layoutInfo, pageFontSize, pageHeight, pageLineHeight]);

  const currentPage = useMemo(() => {
    if (!layoutInfo || !pageHeight || chapterTotal === 0) return undefined;
    const clamped = Math.max(0, Math.min(pageIndex, chapterTotal - 1));
    return getCachedChapterPage(
      chapter,
      clamped,
      layoutInfo,
      pageHeight,
      pageFontSize,
      pageLineHeight,
    );
  }, [
    chapter,
    chapterTotal,
    layoutInfo,
    pageFontSize,
    pageHeight,
    pageIndex,
    pageLineHeight,
  ]);

  const [chapterPageCounts, setChapterPageCounts] = useState<number[]>([]);

  useEffect(() => {
    if (!layoutInfo || !pageHeight) return;

    let cancelled = false;

    const build = async () => {
      const counts = new Array<number>(book.chapters.length);
      for (let i = 0; i < book.chapters.length; i++) {
        if (cancelled) return;
        counts[i] = getCachedChapterPageCount(
          book.chapters[i]!,
          layoutInfo,
          pageHeight,
          pageFontSize,
          pageLineHeight,
        );
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      if (!cancelled) setChapterPageCounts(counts);
    };

    void build();
    return () => {
      cancelled = true;
    };
  }, [book, layoutInfo, pageFontSize, pageHeight, pageLineHeight]);

  const bookPageOffset = chapterPageCounts.length
    ? chapterPageCounts
        .slice(0, chapterIndex)
        .reduce((sum: number, count: number) => sum + count, 0)
    : 0;
  const totalBookPages = chapterPageCounts.length
    ? chapterPageCounts.reduce((sum: number, count: number) => sum + count, 0)
    : 0;

  const activeWordPageIndex = useMemo(() => {
    if (
      !activeWord ||
      activeWord.sentenceId !== currentSentenceId ||
      !layoutInfo ||
      !pageHeight
    ) {
      return -1;
    }
    return findPageIndexForActiveWord(
      chapter,
      activeWord,
      layoutInfo,
      pageHeight,
      pageFontSize,
      pageLineHeight,
    );
  }, [
    activeWord,
    chapter,
    currentSentenceId,
    layoutInfo,
    pageFontSize,
    pageHeight,
    pageLineHeight,
  ]);

  const notifyCurrentSentenceVisibility = useEffectEvent(onCurrentSentenceVisibilityChange);

  useEffect(() => {
    notifyCurrentSentenceVisibility(
      !!currentSentenceId &&
        (activeWordPageIndex >= 0
          ? activeWordPageIndex === pageIndex
          : !!currentPage?.sentenceIds.has(currentSentenceId)),
    );
  }, [activeWordPageIndex, currentPage, currentSentenceId, pageIndex]);

  useEffect(() => {
    if (activeWordPageIndex < 0) return;
    const frame = window.requestAnimationFrame(() => {
      dispatchUi({ type: "page-index", pageIndex: (prev) => prev === activeWordPageIndex ? prev : activeWordPageIndex });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeWordPageIndex]);


  const notifyPaginationChange = useEffectEvent(onPaginationChange);
  const notifyBookmarkPagesChange = useEffectEvent(onBookmarkPagesChange);

  useEffect(() => {
    if (chapterTotal === 0 || totalBookPages === 0) {
      notifyPaginationChange(null);
      return;
    }
    notifyPaginationChange({
      pageIndex: bookPageOffset + pageIndex,
      totalPages: totalBookPages,
      chapterPageIndex: pageIndex,
      chapterTotal,
    });
  }, [
    pageIndex,
    chapterTotal,
    bookPageOffset,
    totalBookPages,
  ]);

  useEffect(() => {
    return () => notifyPaginationChange(null);
  }, []);

  useEffect(() => {
    if (!layoutInfo || !pageHeight || chapterPageCounts.length === 0) {
      notifyBookmarkPagesChange({});
      return;
    }

    const pages: Record<string, BookmarkPageInfo> = {};
    for (const sentenceId of bookmarkBySentenceId.keys()) {
      const chapterIndexForBookmark = chapterIndexBySentenceId.get(sentenceId) ?? -1;
      if (chapterIndexForBookmark < 0) continue;
      const pageIndexInChapter = findPageIndexForSentence(
        book.chapters[chapterIndexForBookmark],
        sentenceId,
        layoutInfo,
        pageHeight,
        pageFontSize,
        pageLineHeight,
      );
      if (pageIndexInChapter < 0) continue;
      const bookPageIndex =
        chapterPageCounts
          .slice(0, chapterIndexForBookmark)
          .reduce((sum: number, count: number) => sum + count, 0) + pageIndexInChapter;
      pages[sentenceId] = { pageIndex: bookPageIndex, totalPages: totalBookPages };
    }

    notifyBookmarkPagesChange(pages);
  }, [
    book.chapters,
    bookmarkBySentenceId,
    chapterIndexBySentenceId,
    chapterPageCounts,
    layoutInfo,
    pageFontSize,
    pageHeight,
    pageLineHeight,
    totalBookPages,
  ]);

  useEffect(() => {
    if (suppressNextAnchorSyncRef.current) {
      suppressNextAnchorSyncRef.current = false;
      return;
    }
    const anchorId = currentSentenceId ?? locationSentenceId;
    if (!anchorId || !layoutInfo || !pageHeight || chapterTotal === 0) return;
    const idx = findPageIndexForSentence(
      chapter,
      anchorId,
      layoutInfo,
      pageHeight,
      pageFontSize,
      pageLineHeight,
    );
    if (idx < 0) return;
    const frame = window.requestAnimationFrame(() => {
      dispatchUi({ type: "page-index", pageIndex: (prev) => (prev === idx ? prev : idx) });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    chapter,
    chapterTotal,
    currentSentenceId,
    locationSentenceId,
    layoutInfo,
    pageFontSize,
    pageHeight,
    pageLineHeight,
    syncKey,
  ]);

  useEffect(() => {
    if (chapterTotal <= 0 || pageIndex < chapterTotal) return;
    const frame = window.requestAnimationFrame(() => {
      dispatchUi({ type: "page-index", pageIndex: chapterTotal - 1 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chapterTotal, pageIndex]);

  const touchStartRef = useRef<{ x: number; time: number } | null>(null);

  const cancelLongPress = () => {
    if (!longPressRef.current) return;
    const sentenceId = longPressRef.current.sentenceId;
    window.clearTimeout(longPressRef.current.timer);
    window.clearTimeout(longPressRef.current.feedbackTimer);
    setPressFeedback(sentenceId, false);
    longPressRef.current = null;
  };

  const startBookmarkLongPress = (
    event: PointerEvent<HTMLSpanElement>,
    sentenceId: string,
    offset: number,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancelLongPress();
    const pointerId = event.pointerId;
    const feedbackEl = event.currentTarget.querySelector<HTMLElement>(
      ".sentence-press-feedback",
    );
    longPressRef.current = {
      feedbackTimer: window.setTimeout(() => {
        setPressFeedback(sentenceId, true);
      }, LONG_PRESS_FEEDBACK_MS),
      timer: window.setTimeout(() => {
        suppressNextClickRef.current = true;
        onBookmarkToggle(sentenceId, offset);
        requestAnimationFrame(() => {
          if (longPressRef.current?.sentenceId === sentenceId)
            setPressFeedback(sentenceId, true);
        });
      }, LONG_PRESS_BOOKMARK_MS),
      pointerId,
      sentenceId,
      feedbackEl,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const moveBookmarkLongPress = (event: PointerEvent<HTMLSpanElement>) => {
    const press = longPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (distance > LONG_PRESS_MOVE_THRESHOLD_PX) cancelLongPress();
  };

  useEffect(() => cancelLongPress, []);

  const goToPage = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(nextIndex, chapterTotal - 1));
    if (clamped === pageIndex) return;
    const page =
      layoutInfo && pageHeight
        ? getCachedChapterPage(
            chapter,
            clamped,
            layoutInfo,
            pageHeight,
            pageFontSize,
            pageLineHeight,
          )
        : undefined;
    suppressNextAnchorSyncRef.current = true;
    dispatchUi({ type: "page-index", pageIndex: clamped });
    onLocationChange(page?.firstSentenceId ?? null);
  };

  const goPrev = () => {
    if (pageIndex > 0) {
      goToPage(pageIndex - 1);
      return;
    }
    if (chapterIndex > 0) {
      const prevChapter = book.chapters[chapterIndex - 1];
      const prevTotal =
        layoutInfo && pageHeight
          ? getCachedChapterPageCount(
              prevChapter,
              layoutInfo,
              pageHeight,
              pageFontSize,
              pageLineHeight,
            )
          : 1;
      dispatchUi({ type: "page-index", pageIndex: Math.max(0, prevTotal - 1) });
      onChapterChange(chapterIndex - 1, "end");
    }
  };

  const goNext = () => {
    if (pageIndex < chapterTotal - 1) {
      goToPage(pageIndex + 1);
      return;
    }
    if (chapterIndex < book.chapters.length - 1) {
      dispatchUi({ type: "page-index", pageIndex: 0 });
      onChapterChange(chapterIndex + 1, "start");
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onPagePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse") return;
    touchStartRef.current = { x: event.clientX, time: performance.now() };
  };

  const onPagePointerUp = (event: PointerEvent<HTMLElement>) => {
    if (!touchStartRef.current) return;
    const delta = event.clientX - touchStartRef.current.x;
    const elapsed = Math.max(1, performance.now() - touchStartRef.current.time);
    const velocity = Math.abs(delta) / elapsed;
    touchStartRef.current = null;
    const isCommittedSwipe =
      Math.abs(delta) >= SWIPE_THRESHOLD_PX ||
      (Math.abs(delta) >= SWIPE_VELOCITY_MIN_DISTANCE_PX &&
        velocity >= SWIPE_VELOCITY_THRESHOLD_PX_MS);
    if (!isCommittedSwipe) return;
    if (delta < 0) goNext();
    else goPrev();
  };

  const renderedActiveWord = highlightTheme === "modern" ? activeWord : null;

  const renderPage = (
    page: Page,
    className: string,
    pageKey?: string,
  ) =>
    layoutInfo ? (
      <div
        key={pageKey}
        className={className}
        style={{
          gridTemplateColumns: `repeat(${layoutInfo.colCount}, minmax(0, 1fr))`,
          gap: `${COL_GAP_PX}px`,
        }}
      >
        {page.columns.map((col, ci) => (
          <div key={ci} className="min-w-0">
            {col.lines.map((line, li) => {
              const lineKey = `${ci}-${line.paragraphId}-${li}`;
              const anchoredPart = line.parts.find((part) => {
                const bookmark = bookmarkBySentenceId.get(part.id);
                return bookmark ? partContainsOffset(part, bookmark.offset) : false;
              });
              const anchoredBookmark = anchoredPart
                ? bookmarkBySentenceId.get(anchoredPart.id)
                : undefined;
              const target =
                anchoredPart && anchoredBookmark
                  ? {
                      sentenceId: anchoredPart.id,
                      offset: anchoredBookmark.offset,
                      isBookmarked: true,
                    }
                  : hoveredBookmarkTarget?.lineKey === lineKey
                    ? {
                        sentenceId: hoveredBookmarkTarget.sentenceId,
                        offset: hoveredBookmarkTarget.offset,
                        isBookmarked: false,
                      }
                    : line.parts[0]
                      ? {
                          sentenceId: line.parts[0].id,
                          offset: line.parts[0].sentenceOffset,
                          isBookmarked: false,
                        }
                      : null;

              return (
                <div
                  key={lineKey}
                  className={
                    "group/line relative " +
                    "whitespace-nowrap"
                  }
                  style={{
                    marginTop:
                      li > 0 && line.startsParagraph
                        ? `${pageFontSize * pageLineHeight * PARAGRAPH_GAP_LINES}px`
                        : undefined,
                  }}
                >
                  {target && (
                    <BookmarkButton
                      isBookmarked={target.isBookmarked}
                      sentenceId={target.sentenceId}
                      offset={target.offset}
                      onToggle={onBookmarkToggle}
                    />
                  )}
                  {line.parts.map((part, pi) => {
                    const isActive = part.id === currentSentenceId;
                    const isBookmarked = bookmarkBySentenceId.has(part.id);
                    return (
                      <span
                        key={`${part.id}-${pi}`}
                        data-sid={part.id}
                        data-sentence-offset={part.sentenceOffset}
                        data-sentence-end={part.sentenceOffset + part.text.length}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (suppressNextClickRef.current) {
                            suppressNextClickRef.current = false;
                            return;
                          }
                          onSentenceSelect(part.id);
                        }}
                        onPointerDown={
                          (event) =>
                            // eslint-disable-next-line react-hooks/refs -- Event handler reads refs only when a press starts.
                            startBookmarkLongPress(
                              event,
                              part.id,
                              part.sentenceOffset,
                            )
                        }
                        onPointerMove={moveBookmarkLongPress}
                        onPointerUp={cancelLongPress}
                        onPointerCancel={cancelLongPress}
                        onContextMenu={(event) => {
                          if (suppressNextClickRef.current) event.preventDefault();
                        }}
                        onMouseEnter={() => {
                          dispatchUi({
                            type: "hovered-bookmark-target",
                            target: { lineKey, sentenceId: part.id, offset: part.sentenceOffset },
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSentenceSelect(part.id);
                          }
                        }}
                        className={
                          "inline-block cursor-pointer select-none rounded-sm py-1.5 box-decoration-clone transition-[background-color,color] duration-300 ease-(--ease-out-strong) hoverable:select-text " +
                          (isBookmarked && !isActive
                            ? "text-rose-900 dark:text-rose-100 "
                            : "") +
                          (isActive
                            ? "text-zinc-900 dark:text-zinc-50"
                            : "hoverable:hover:text-zinc-900 dark:hoverable:hover:text-zinc-50")
                        }
                      >
                        {part.leadingText.replace(/ /g, "\u00a0")}
                        <span
                          className={
                            "sentence-press-feedback rounded-sm box-decoration-clone " +
                            (pi === 0 ? "sentence-line-start " : "") +
                            ""
                          }
                        >
                          <HighlightedText part={part} activeWord={renderedActiveWord} isBookmarked={isBookmarked} isActive={isActive} />
                        </span>
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div
      ref={containerRef}
      className="px-4 sm:px-8"
      style={{
        paddingTop: readableViewport.top,
        paddingBottom: readableViewport.bottom,
      }}
    >
      <div
        className="mx-auto"
        style={{ width: layoutInfo?.articleWidth ?? "auto", maxWidth: "100%" }}
      >
        <article
          ref={articleRef}
          onPointerDown={onPagePointerDown}
          onPointerUp={onPagePointerUp}
          onPointerCancel={() => {
            touchStartRef.current = null;
          }}
          data-highlight-theme={highlightTheme}
          className="relative isolate overflow-visible px-1 text-zinc-700 touch-pan-y sm:px-0 dark:text-zinc-300"
          style={{
            fontSize: `${pageFontSize}px`,
            lineHeight: pageLineHeight,
            height: pageHeight || undefined,
            fontFamily: SERIF_STACK,
          }}
        >
          <SentenceHighlight
            activeId={currentSentenceId}
            articleRef={articleRef}
            fontSize={pageFontSize}
            highlightTheme={highlightTheme}
            refreshKey={`pages-${pageIndex}-${chapterTotal}-${layoutInfo?.articleWidth ?? 0}-${pageFontSize}-${pageLineHeight}-${measure}`}
          />
          <WordHighlight
            activeWord={activeWord}
            articleRef={articleRef}
            highlightTheme={highlightTheme}
          />

          {currentPage &&
            renderPage(
              currentPage,
              "page-content-in relative z-10 grid h-full",
              `${chapterIndex}-${pageIndex}`,
            )}
        </article>

        <PageNav
          onPrev={goPrev}
          onNext={goNext}
          pageIndex={pageIndex}
          chapterTotal={chapterTotal}
          chromeHidden={chromeHidden}
        />
      </div>
    </div>
  );
}

function BookmarkButton({
  isBookmarked,
  sentenceId,
  offset,
  onToggle,
}: {
  isBookmarked: boolean;
  sentenceId: string;
  offset: number;
  onToggle: (id: string, offset: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}
      aria-pressed={isBookmarked}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(sentenceId, offset);
      }}
      onKeyDown={(event) => event.stopPropagation()}
      className={
        "absolute -left-7 top-1/2 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full transition-[opacity,color,transform] duration-200 ease-(--ease-out-strong) hoverable:flex hoverable:group-hover/line:opacity-70 hoverable:hover:scale-105 hoverable:hover:opacity-100 " +
        (isBookmarked
          ? "text-rose-900 opacity-90 dark:text-rose-300"
          : "text-zinc-500 opacity-0 dark:text-zinc-500")
      }
    >
      <Bookmark
        className="size-4"
        strokeWidth={1.8}
        fill={isBookmarked ? "currentColor" : "none"}
      />
    </button>
  );
}

function partContainsOffset(part: TextPart, offset: number) {
  return offset >= part.sentenceOffset && offset < part.sentenceOffset + part.text.length;
}

function setPressFeedback(sentenceId: string, pressing: boolean) {
  document
    .querySelectorAll<HTMLElement>(
      `[data-sid="${CSS.escape(sentenceId)}"] .sentence-press-feedback`,
    )
    .forEach((el) => el.classList.toggle("is-pressing", pressing));
}

const paginationCache = new WeakMap<Chapter, Map<string, Page>>();
const pageCountCache = new WeakMap<Chapter, Map<string, number>>();

function getRenderedLineHeight(fontSize: number, lineHeight: number) {
  return fontSize * lineHeight + SENTENCE_VERTICAL_PAD_PX;
}

function getCachedChapterPageCount(
  chapter: Chapter,
  layoutInfo: { colCount: number; columnWidth: number },
  pageHeight: number,
  fontSize: number,
  lineHeight: number,
) {
  const key = `${layoutInfo.colCount}:${Math.round(layoutInfo.columnWidth)}:${Math.round(pageHeight)}:${fontSize}:${lineHeight}`;
  let chapterCache = pageCountCache.get(chapter);
  if (!chapterCache) {
    chapterCache = new Map();
    pageCountCache.set(chapter, chapterCache);
  }
  const cached = chapterCache.get(key);
  if (cached !== undefined) return cached;
  const count = countChapterPages(
    chapter,
    layoutInfo,
    pageHeight,
    fontSize,
    lineHeight,
  );
  chapterCache.set(key, count);
  return count;
}

function getCachedChapterPage(
  chapter: Chapter,
  pageIndex: number,
  layoutInfo: { colCount: number; columnWidth: number },
  pageHeight: number,
  fontSize: number,
  lineHeight: number,
) {
  const key = `${pageIndex}:${layoutInfo.colCount}:${Math.round(layoutInfo.columnWidth)}:${Math.round(pageHeight)}:${fontSize}:${lineHeight}`;
  let chapterCache = paginationCache.get(chapter);
  if (!chapterCache) {
    chapterCache = new Map();
    paginationCache.set(chapter, chapterCache);
  }
  const cached = chapterCache.get(key);
  if (cached) return cached;
  const page = paginateChapterPage(
    chapter,
    pageIndex,
    layoutInfo,
    pageHeight,
    fontSize,
    lineHeight,
  );
  chapterCache.set(key, page);
  return page;
}

function countChapterPages(
  chapter: Chapter,
  layoutInfo: { colCount: number; columnWidth: number },
  pageHeight: number,
  fontSize: number,
  lineHeight: number,
) {
  const { colCount, columnWidth } = layoutInfo;
  const font = `${fontSize}px ${SERIF_STACK}`;
  const renderedLineHeight = getRenderedLineHeight(fontSize, lineHeight);
  const paragraphGapHeight = fontSize * lineHeight * PARAGRAPH_GAP_LINES;
  let pageCount = 0;
  let colIdx = 0;
  let colUsed = 0;
  const advanceColumn = () => {
    colIdx++;
    colUsed = 0;
    if (colIdx >= colCount) {
      pageCount++;
      colIdx = 0;
    }
  };

  for (const para of chapter.paragraphs) {
    const lineCount = measureParagraphLines(para, font, columnWidth);
    for (let i = 0; i < lineCount; i++) {
      const startsParagraph = i === 0;
      const gap = colUsed > 0 && startsParagraph ? paragraphGapHeight : 0;
      const nextHeight = gap + renderedLineHeight;
      if (colUsed > 0 && colUsed + nextHeight > pageHeight) advanceColumn();
      colUsed += (colUsed > 0 && startsParagraph ? paragraphGapHeight : 0) + renderedLineHeight;
    }
  }

  if (colUsed > 0 || colIdx > 0) pageCount++;
  return pageCount;
}

function paginateChapterPage(
  chapter: Chapter,
  targetPageIndex: number,
  layoutInfo: { colCount: number; columnWidth: number },
  pageHeight: number,
  fontSize: number,
  lineHeight: number,
): Page {
  const { colCount, columnWidth } = layoutInfo;
  const font = `${fontSize}px ${SERIF_STACK}`;
  const renderedLineHeight = getRenderedLineHeight(fontSize, lineHeight);
  const paragraphGapHeight = fontSize * lineHeight * PARAGRAPH_GAP_LINES;
  const newPage = (): Page => ({
    columns: Array.from({ length: colCount }, () => ({ lines: [] })),
    sentenceIds: new Set(),
    firstSentenceId: null,
  });
  let page = newPage();
  let pageIndex = 0;
  let colIdx = 0;
  let colUsed = 0;

  const advanceColumn = () => {
    colIdx++;
    colUsed = 0;
    if (colIdx >= colCount) {
      pageIndex++;
      page = pageIndex === targetPageIndex ? newPage() : page;
      colIdx = 0;
    }
  };

  for (const para of chapter.paragraphs) {
    let done = false;
    walkParagraphLineParts(
      para,
      font,
      columnWidth,
      ({ parts, lineIndex, endsParagraph }) => {
        const startsParagraph = lineIndex === 0;
        const gap = colUsed > 0 && startsParagraph ? paragraphGapHeight : 0;
        const nextHeight = gap + renderedLineHeight;
        if (colUsed > 0 && colUsed + nextHeight > pageHeight) advanceColumn();
        if (pageIndex > targetPageIndex) {
          done = true;
          return false;
        }
        if (pageIndex === targetPageIndex) {
          const line = {
            paragraphId: para.id,
            parts,
            startsParagraph,
            endsParagraph,
          };
          page.columns[colIdx].lines.push(line);
          parts.forEach((p) => {
            if (!page.firstSentenceId) page.firstSentenceId = p.id;
            page.sentenceIds.add(p.id);
          });
        }
        colUsed +=
          (colUsed > 0 && startsParagraph ? paragraphGapHeight : 0) +
          renderedLineHeight;
      },
    );
    if (done) break;
  }

  return page;
}

function findPageIndexForSentence(
  chapter: Chapter,
  sentenceId: string,
  layoutInfo: { colCount: number; columnWidth: number },
  pageHeight: number,
  fontSize: number,
  lineHeight: number,
) {
  const { colCount, columnWidth } = layoutInfo;
  const font = `${fontSize}px ${SERIF_STACK}`;
  const renderedLineHeight = getRenderedLineHeight(fontSize, lineHeight);
  const paragraphGapHeight = fontSize * lineHeight * PARAGRAPH_GAP_LINES;
  let pageIndex = 0;
  let colIdx = 0;
  let colUsed = 0;
  let found = -1;
  const advanceColumn = () => {
    colIdx++;
    colUsed = 0;
    if (colIdx >= colCount) {
      pageIndex++;
      colIdx = 0;
    }
  };

  for (const para of chapter.paragraphs) {
    if (found >= 0) break;
    walkParagraphLineParts(para, font, columnWidth, ({ parts, lineIndex }) => {
      if (found >= 0) return false;
      const startsParagraph = lineIndex === 0;
      const gap = colUsed > 0 && startsParagraph ? paragraphGapHeight : 0;
      const nextHeight = gap + renderedLineHeight;
      if (colUsed > 0 && colUsed + nextHeight > pageHeight) advanceColumn();
      if (parts.some((part) => part.id === sentenceId)) {
        found = pageIndex;
        return false;
      }
      colUsed +=
        (colUsed > 0 && startsParagraph ? paragraphGapHeight : 0) +
        renderedLineHeight;
    });
  }
  return found;
}

function findPageIndexForActiveWord(
  chapter: Chapter,
  activeWord: ActiveWord,
  layoutInfo: { colCount: number; columnWidth: number },
  pageHeight: number,
  fontSize: number,
  lineHeight: number,
) {
  const { colCount, columnWidth } = layoutInfo;
  const font = `${fontSize}px ${SERIF_STACK}`;
  const renderedLineHeight = getRenderedLineHeight(fontSize, lineHeight);
  const paragraphGapHeight = fontSize * lineHeight * PARAGRAPH_GAP_LINES;
  let pageIndex = 0;
  let colIdx = 0;
  let colUsed = 0;
  let found = -1;
  let wordOffset: number | null = null;

  const advanceColumn = () => {
    colIdx++;
    colUsed = 0;
    if (colIdx >= colCount) {
      pageIndex++;
      colIdx = 0;
    }
  };

  for (const para of chapter.paragraphs) {
    if (found >= 0) break;
    walkParagraphLineParts(para, font, columnWidth, ({ parts, lineIndex }) => {
      if (found >= 0) return false;
      const startsParagraph = lineIndex === 0;
      const gap = colUsed > 0 && startsParagraph ? paragraphGapHeight : 0;
      const nextHeight = gap + renderedLineHeight;
      if (colUsed > 0 && colUsed + nextHeight > pageHeight) advanceColumn();

      for (const activePart of parts) {
        if (activePart.id !== activeWord.sentenceId) continue;
        wordOffset ??= getActiveWordSentenceOffset(activePart.sentenceText, activeWord);
        if (wordOffset !== null && partContainsOffset(activePart, wordOffset)) {
          found = pageIndex;
          return false;
        }
      }

      colUsed +=
        (colUsed > 0 && startsParagraph ? paragraphGapHeight : 0) +
        renderedLineHeight;
    });
  }

  return found;
}

function getActiveWordSentenceOffset(sentenceText: string, activeWord: ActiveWord) {
  const target = normalizeWord(activeWord.text);
  if (!target) return null;
  const matches = Array.from(sentenceText.matchAll(WORD_MATCH_PATTERN));
  const sameWordMatches = matches.filter(
    (match) => normalizeWord(match[0]) === target,
  );
  const sentenceMatch = sameWordMatches[activeWord.occurrence];
  return sentenceMatch?.index ?? null;
}

function normalizeWord(value: string) {
  return value.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
}

function PageNav({
  onPrev,
  onNext,
  pageIndex,
  chapterTotal,
  chromeHidden,
}: {
  onPrev: () => void;
  onNext: () => void;
  pageIndex: number;
  chapterTotal: number;
  chromeHidden: boolean;
}) {
  const label = chapterTotal > 0
    ? `${Math.min(pageIndex + 1, chapterTotal)} / ${chapterTotal}`
    : "—";

  return (
    <div
      data-reader-chrome={chromeHidden ? undefined : "bottom"}
      data-page-nav="true"
      className="pointer-events-none fixed inset-x-0 z-40 px-3 sm:px-4"
      style={{ bottom: 'calc(var(--playback-bar-height, 5.5rem) + 0.5rem)' }}
    >
      <div
        className={
          "surface-floating pointer-events-auto mx-auto flex transform-gpu items-center transition-[max-width,padding,gap,opacity,transform] duration-[260ms] ease-(--ease-out-strong) " +
          (chromeHidden
            ? "max-w-[9rem] gap-1 px-1 py-1 opacity-55 hoverable:hover:opacity-90"
            : "max-w-sm gap-1.5 px-1.5 py-1 opacity-100 sm:max-w-3xl sm:gap-3 sm:px-3 sm:py-2")
        }
      >
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous page"
          title="Previous page"
          className={
            "flex shrink-0 items-center justify-center rounded-full font-medium text-zinc-700 transition-[background-color,color,transform,width,padding] duration-150 ease-(--ease-out-strong) active:scale-[0.97] hoverable:hover:text-zinc-900 dark:text-zinc-300 dark:hoverable:hover:text-zinc-50 " +
            (chromeHidden
              ? "size-8 bg-transparent px-0"
              : "h-8 flex-1 gap-0.5 bg-zinc-100 px-2 text-xs shadow-[inset_0_1px_1px_rgba(0,0,0,0.04)] dark:bg-zinc-950 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)] sm:h-10 sm:flex-none sm:gap-1 sm:px-4 sm:text-sm")
          }
        >
          <ChevronLeft className="size-3.5 sm:h-4 sm:w-4" strokeWidth={2.25} />
          <span className={chromeHidden ? "sr-only" : ""}>Prev</span>
        </button>

        <div
          className={
            "flex h-8 shrink-0 items-center justify-center tabular-nums text-zinc-500 transition-[min-width,padding,font-size] duration-[260ms] ease-(--ease-out-strong) dark:text-zinc-400 " +
            (chromeHidden
              ? "min-w-11 px-0.5 text-[10px]"
              : "min-w-12 px-1.5 text-[11px] sm:h-10 sm:min-w-14 sm:flex-1 sm:px-2 sm:text-xs")
          }
        >
          {label}
        </div>

        <button
          type="button"
          onClick={onNext}
          aria-label="Next page"
          title="Next page"
          className={
            "flex shrink-0 items-center justify-center rounded-full font-medium transition-[background-color,color,transform,width,padding] duration-150 ease-(--ease-out-strong) active:scale-[0.94] " +
            (chromeHidden
              ? "size-8 bg-transparent px-0 text-zinc-700 hoverable:hover:text-zinc-900 dark:text-zinc-300 dark:hoverable:hover:text-zinc-50"
              : "h-8 flex-1 gap-0.5 bg-zinc-900 px-2 text-xs text-white sm:h-10 sm:flex-none sm:gap-1 sm:px-4 sm:text-sm dark:bg-zinc-50 dark:text-zinc-950")
          }
        >
          <span className={chromeHidden ? "sr-only" : ""}>Next</span>
          <ChevronRight className="size-3.5 sm:h-4 sm:w-4" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
