export function BookLoadingView() {
  return (
    <section
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center overflow-hidden px-6 py-24 text-zinc-900 dark:text-zinc-100"
    >
      <div className="relative w-full max-w-xl">
        <div
          aria-hidden
          className="absolute -inset-16 rounded-full bg-[radial-gradient(circle_at_50%_35%,rgba(251,191,36,0.16),transparent_58%)] blur-2xl dark:bg-[radial-gradient(circle_at_50%_35%,rgba(251,191,36,0.10),transparent_58%)]"
        />
        <div className="surface-floating relative overflow-hidden px-6 py-8 sm:px-10 sm:py-10">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent dark:via-amber-400/35" />
          <div className="mx-auto mb-7 flex h-24 w-28 items-center justify-center">
            <div className="relative h-20 w-24 rounded-r-[1.4rem] rounded-l-md border border-zinc-200/80 bg-white shadow-[0_18px_45px_rgba(24,24,27,0.10)] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/35">
              <div className="absolute inset-y-2 left-1.5 w-px bg-zinc-200 dark:bg-zinc-800" />
              <div className="absolute inset-y-3 left-4 w-9 rounded-r-xl border border-zinc-200/80 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900" />
              <div className="absolute inset-y-3 right-4 w-9 origin-left animate-[page-turn_1.55s_var(--ease-in-out-strong)_infinite] rounded-r-xl border border-amber-200/70 bg-amber-50 shadow-[8px_0_18px_rgba(251,191,36,0.16)] dark:border-amber-400/20 dark:bg-amber-400/10" />
            </div>
          </div>

          <div className="text-center">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700/80 dark:text-amber-300/70">
              Opening EPUB
            </p>
            <h1 className="text-balance text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
              Building your audiobook
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Large books can take a moment while chapters, sentences, and the table of contents are prepared locally.
            </p>
          </div>

          <div className="mt-8 space-y-3" aria-hidden>
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-2 overflow-hidden rounded-full bg-zinc-200/70 dark:bg-zinc-800/80"
                style={{ width: `${100 - index * 14}%` }}
              >
                <div
                  className="h-full w-1/2 animate-[loading-sweep_1.4s_var(--ease-out-strong)_infinite] rounded-full bg-zinc-900/70 dark:bg-zinc-100/70"
                  style={{ animationDelay: `${index * 120}ms` }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
