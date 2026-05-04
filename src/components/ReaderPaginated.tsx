import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ActiveWord, Book, Chapter, PaginationInfo } from "../types";
import {
  measureParagraphLines,
  walkParagraphLineParts,
  type TextPart,
} from "../utils/pretextLayout";
import { SentenceHighlight } from "./SentenceHighlight";
import { WordHighlight } from "./WordHighlight";

const PARAGRAPH_GAP_LINES = 1;
const SERIF_STACK = 'Georgia, Cambria, "Times New Roman", Times, serif';
const COL_GAP_PX = 64;
const MAX_COLS = 2;
const DESKTOP_VIEWPORT_CHROME_PX = 280;
const MOBILE_VIEWPORT_CHROME_PX = 340;
const MOBILE_BREAKPOINT_PX = 640;
const SWIPE_THRESHOLD_PX = 44;

type LineFragment = {
  paragraphId: string;
  parts: TextPart[];
  startsParagraph: boolean;
  endsParagraph: boolean;
};
type Column = { lines: LineFragment[] };
type Page = {
  columns: Column[];
  sentenceIds: Set<string>;
  firstSentenceId: string | null;
};

type Props = {
  book: Book;
  chapterIndex: number;
  onChapterChange: (index: number, edge?: "start" | "end") => void;
  fontSize: number;
  lineHeight: number;
  measure: number;
  currentSentenceId: string | null;
  locationSentenceId: string | null;
  activeWord: ActiveWord | null;
  onSentenceSelect: (id: string | null) => void;
  onLocationChange: (id: string | null) => void;
  onPaginationChange: (info: PaginationInfo | null) => void;
  syncKey: number;
  onCurrentSentenceVisibilityChange: (visible: boolean) => void;
};

export function ReaderPaginated({
  book,
  chapterIndex,
  onChapterChange,
  fontSize,
  lineHeight,
  measure,
  currentSentenceId,
  locationSentenceId,
  activeWord,
  onSentenceSelect,
  onLocationChange,
  onPaginationChange,
  syncKey,
  onCurrentSentenceVisibilityChange,
}: Props) {
  const chapter = book.chapters[chapterIndex];
  const containerRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_PX,
  );
  const [pageIndex, setPageIndex] = useState(0);
  const pageFontSize = isMobile ? Math.min(fontSize, 22) : fontSize;
  const pageLineHeight = isMobile ? Math.max(lineHeight, 1.55) : lineHeight;
  const suppressNextAnchorSyncRef = useRef(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const cs = window.getComputedStyle(el);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      setContainerWidth(Math.max(0, el.clientWidth - padX));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const update = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT_PX;
      setIsMobile(mobile);
      setPageHeight(
        Math.max(
          360,
          window.innerHeight -
            (mobile ? MOBILE_VIEWPORT_CHROME_PX : DESKTOP_VIEWPORT_CHROME_PX),
        ),
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
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

  const chapterPageCounts = useMemo(() => {
    if (!layoutInfo || !pageHeight) return null;
    return book.chapters.map((ch) =>
      getCachedChapterPageCount(
        ch,
        layoutInfo,
        pageHeight,
        pageFontSize,
        pageLineHeight,
      ),
    );
  }, [book, layoutInfo, pageFontSize, pageHeight, pageLineHeight]);

  const bookPageOffset = chapterPageCounts
    ? chapterPageCounts
        .slice(0, chapterIndex)
        .reduce((sum, count) => sum + count, 0)
    : 0;
  const totalBookPages =
    chapterPageCounts?.reduce((sum, count) => sum + count, 0) ?? 0;

  useEffect(() => {
    onCurrentSentenceVisibilityChange(
      !!currentSentenceId && !!currentPage?.sentenceIds.has(currentSentenceId),
    );
  }, [currentPage, currentSentenceId, onCurrentSentenceVisibilityChange]);

  useEffect(() => {
    if (chapterTotal === 0 || totalBookPages === 0) {
      onPaginationChange(null);
      return;
    }
    onPaginationChange({
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
    onPaginationChange,
  ]);

  useEffect(() => {
    return () => onPaginationChange(null);
  }, [onPaginationChange]);

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
    if (idx >= 0) setPageIndex((prev) => (prev === idx ? prev : idx));
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
    if (chapterTotal > 0 && pageIndex >= chapterTotal)
      setPageIndex(chapterTotal - 1);
  }, [chapterTotal, pageIndex]);

  const touchStartXRef = useRef<number | null>(null);

  const goToPage = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(nextIndex, chapterTotal - 1));
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
    setPageIndex(clamped);
    onSentenceSelect(null);
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
      setPageIndex(Math.max(0, prevTotal - 1));
      onChapterChange(chapterIndex - 1, "end");
    }
  };

  const goNext = () => {
    if (pageIndex < chapterTotal - 1) {
      goToPage(pageIndex + 1);
      return;
    }
    if (chapterIndex < book.chapters.length - 1) {
      setPageIndex(0);
      onChapterChange(chapterIndex + 1, "start");
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onPagePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse") return;
    touchStartXRef.current = event.clientX;
  };

  const onPagePointerUp = (event: PointerEvent<HTMLElement>) => {
    if (touchStartXRef.current === null) return;
    const delta = event.clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    if (delta < 0) goNext();
    else goPrev();
  };

  return (
    <div ref={containerRef} className="px-4 pb-48 pt-20 sm:px-8 sm:pb-28">
      <div
        className="mx-auto"
        style={{ width: layoutInfo?.articleWidth ?? "auto", maxWidth: "100%" }}
      >
        <article
          ref={articleRef}
          onPointerDown={onPagePointerDown}
          onPointerUp={onPagePointerUp}
          onPointerCancel={() => {
            touchStartXRef.current = null;
          }}
          className="relative isolate px-1 text-zinc-700 touch-pan-y sm:px-0 dark:text-zinc-300"
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
            refreshKey={`pages-${pageIndex}-${chapterTotal}-${layoutInfo?.articleWidth ?? 0}-${pageFontSize}-${pageLineHeight}-${measure}`}
          />
          <WordHighlight
            activeKey={
              activeWord
                ? `${activeWord.sentenceId}:${activeWord.wordIndex}:${activeWord.isPunctuationPause ? "pause" : "word"}`
                : null
            }
            articleRef={articleRef}
          />

          {currentPage && layoutInfo && (
            <div
              className="relative z-10 grid h-full"
              style={{
                gridTemplateColumns: `repeat(${layoutInfo.colCount}, minmax(0, 1fr))`,
                gap: `${COL_GAP_PX}px`,
              }}
            >
              {currentPage.columns.map((col, ci) => (
                <div key={ci} className="min-w-0">
                  {col.lines.map((line, li) => (
                    <div
                      key={`${line.paragraphId}-${li}`}
                      className={
                        line.endsParagraph
                          ? "whitespace-nowrap"
                          : "whitespace-nowrap text-justify [text-align-last:justify]"
                      }
                      style={{
                        marginTop:
                          li > 0 && line.startsParagraph
                            ? `${pageFontSize * pageLineHeight * PARAGRAPH_GAP_LINES}px`
                            : undefined,
                      }}
                    >
                      {line.parts.map((part, pi) => {
                        const isActive = part.id === currentSentenceId;
                        return (
                          <span
                            key={`${part.id}-${pi}`}
                            data-sid={part.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              onLocationChange(part.id);
                              onSentenceSelect(part.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onLocationChange(part.id);
                                onSentenceSelect(part.id);
                              }
                            }}
                            className={
                              "cursor-pointer rounded-sm py-1.5 box-decoration-clone transition-colors duration-200 ease-(--ease-out-strong) " +
                              (isActive
                                ? "text-zinc-900 dark:text-zinc-50"
                                : "hoverable:hover:text-zinc-900 dark:hoverable:hover:text-zinc-50")
                            }
                          >
                            {pi > 0 ? " " : null}
                            <HighlightedText
                              part={part}
                              activeWord={activeWord}
                            />
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </article>

        <PageNav
          onPrev={goPrev}
          onNext={goNext}
          pageIndex={pageIndex}
          chapterTotal={chapterTotal}
        />
      </div>
    </div>
  );
}

function HighlightedText({
  part,
  activeWord,
}: {
  part: TextPart;
  activeWord: ActiveWord | null;
}) {
  const match =
    activeWord?.sentenceId === part.id
      ? findActiveWordMatch(part, activeWord)
      : null;
  if (!match) return part.text;
  return (
    <>
      {part.text.slice(0, match.start)}
      <mark
        data-active-word={`${activeWord!.sentenceId}:${activeWord!.wordIndex}:${activeWord!.isPunctuationPause ? "pause" : "word"}`}
        className="rounded-[0.2em] bg-transparent px-0.5 text-inherit"
      >
        {part.text.slice(match.start, match.end)}
      </mark>
      {part.text.slice(match.end)}
    </>
  );
}

function findActiveWordMatch(part: TextPart, activeWord: ActiveWord) {
  const target = normalizeWord(activeWord.text);
  if (!target) return null;
  const matches = Array.from(part.sentenceText.matchAll(/[\p{L}\p{N}]+/gu));
  const sameWordMatches = matches.filter(
    (match) => normalizeWord(match[0]) === target,
  );
  const sentenceMatch = sameWordMatches[activeWord.occurrence];
  if (!sentenceMatch || sentenceMatch.index === undefined) return null;
  const start = sentenceMatch.index - part.sentenceOffset;
  let end = start + sentenceMatch[0].length;
  if (activeWord.isPunctuationPause) {
    const trailing = part.sentenceText
      .slice(sentenceMatch.index + sentenceMatch[0].length)
      .match(/^[\s,;:–—-]+/u);
    end += trailing?.[0]?.length ?? 0;
  }
  if (end <= 0 || start >= part.text.length) return null;
  return { start: Math.max(0, start), end: Math.min(part.text.length, end) };
}

function normalizeWord(value: string) {
  return value.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
}

const paginationCache = new WeakMap<Chapter, Map<string, Page>>();
const pageCountCache = new WeakMap<Chapter, Map<string, number>>();

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
  const lineHeightPx = fontSize * lineHeight;
  const maxLines = Math.max(1, Math.floor(pageHeight / lineHeightPx));
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
      const gap = colUsed > 0 && startsParagraph ? PARAGRAPH_GAP_LINES : 0;
      if (colUsed + gap + 1 > maxLines) advanceColumn();
      colUsed += (colUsed > 0 && startsParagraph ? PARAGRAPH_GAP_LINES : 0) + 1;
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
  const lineHeightPx = fontSize * lineHeight;
  const maxLines = Math.max(1, Math.floor(pageHeight / lineHeightPx));
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
        const gap = colUsed > 0 && startsParagraph ? PARAGRAPH_GAP_LINES : 0;
        if (colUsed + gap + 1 > maxLines) advanceColumn();
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
          (colUsed > 0 && startsParagraph ? PARAGRAPH_GAP_LINES : 0) + 1;
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
  const maxLines = Math.max(
    1,
    Math.floor(pageHeight / (fontSize * lineHeight)),
  );
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
      const gap = colUsed > 0 && startsParagraph ? PARAGRAPH_GAP_LINES : 0;
      if (colUsed + gap + 1 > maxLines) advanceColumn();
      if (parts.some((part) => part.id === sentenceId)) {
        found = pageIndex;
        return false;
      }
      colUsed += (colUsed > 0 && startsParagraph ? PARAGRAPH_GAP_LINES : 0) + 1;
    });
  }
  return found;
}

function PageNav({
  onPrev,
  onNext,
  pageIndex,
  chapterTotal,
}: {
  onPrev: () => void;
  onNext: () => void;
  pageIndex: number;
  chapterTotal: number;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[8rem] z-20 px-2 sm:bottom-24 sm:px-4">
      <div className="surface-floating pointer-events-auto mx-auto flex max-w-3xl items-center gap-2 px-2.5 py-2 sm:gap-3 sm:px-3">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous page"
          className="flex h-10 flex-1 items-center justify-center gap-1 rounded-full bg-zinc-100 px-3 text-sm font-medium text-zinc-700 shadow-[inset_0_1px_1px_rgba(0,0,0,0.04)] transition-[background-color,color,transform] duration-150 ease-(--ease-out-strong) active:scale-[0.97] hoverable:hover:text-zinc-900 dark:bg-zinc-800/70 dark:text-zinc-300 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] dark:hoverable:hover:text-zinc-50 sm:flex-none sm:px-4"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          Prev
        </button>

        <div className="flex h-10 min-w-14 shrink-0 items-center justify-center px-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400 sm:flex-1">
          {chapterTotal > 0
            ? `${Math.min(pageIndex + 1, chapterTotal)} / ${chapterTotal}`
            : "—"}
        </div>

        <button
          type="button"
          onClick={onNext}
          aria-label="Next page"
          className="flex h-10 flex-1 items-center justify-center gap-1 rounded-full bg-zinc-900 px-3 text-sm font-medium text-white transition-[background-color,color,transform] duration-150 ease-(--ease-out-strong) active:scale-[0.94] sm:flex-none sm:px-4 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Next
          <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
