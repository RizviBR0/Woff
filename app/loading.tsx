export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border bg-muted/40 text-lg font-black text-foreground">
          W
        </div>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[#ff5a00]" />
        </div>
        <span className="text-xs">Loading Woff…</span>
      </div>
    </div>
  );
}
