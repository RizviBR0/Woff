export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar skeleton */}
      <div className="fixed top-0 left-0 right-0 z-50 h-16 bg-white/80 dark:bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-zinc-200/60 dark:border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <div className="h-8 w-24 rounded-lg bg-zinc-200/60 dark:bg-white/10 animate-pulse" />
          <div className="hidden md:flex gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-4 w-16 rounded bg-zinc-200/40 dark:bg-white/5 animate-pulse"
              />
            ))}
          </div>
          <div className="h-9 w-9 rounded-full bg-zinc-200/60 dark:bg-white/10 animate-pulse" />
        </div>
      </div>

      {/* Hero skeleton */}
      <div className="pt-16 min-h-screen flex items-center px-4 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[1300px] w-full grid md:grid-cols-2 gap-10 items-center py-10 sm:px-10 lg:px-20">
          {/* Left column */}
          <div className="space-y-6 max-w-[540px]">
            <div className="h-6 w-40 rounded-full bg-zinc-200/60 dark:bg-white/10 animate-pulse" />
            <div className="space-y-3">
              <div className="h-12 w-full rounded-lg bg-zinc-200/60 dark:bg-white/10 animate-pulse" />
              <div className="h-12 w-3/4 rounded-lg bg-zinc-200/60 dark:bg-white/10 animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-zinc-200/40 dark:bg-white/5 animate-pulse" />
              <div className="h-4 w-4/5 rounded bg-zinc-200/40 dark:bg-white/5 animate-pulse" />
            </div>
            <div className="flex gap-3 pt-2">
              <div className="h-12 w-40 rounded-xl bg-[#ff5a00]/20 animate-pulse" />
              <div className="h-12 w-32 rounded-xl bg-zinc-200/60 dark:bg-white/10 animate-pulse" />
            </div>
          </div>

          {/* Right column - Join room card skeleton */}
          <div className="flex justify-center md:justify-end">
            <div className="w-full max-w-[420px] rounded-[24px] border border-zinc-200/60 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] p-8 space-y-6 backdrop-blur-sm">
              <div className="h-5 w-48 mx-auto rounded bg-zinc-200/40 dark:bg-white/5 animate-pulse" />
              <div className="grid grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-xl bg-zinc-100 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.08] animate-pulse"
                  />
                ))}
              </div>
              <div className="h-[52px] w-full rounded-xl bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.06] animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
