import { Loader2 } from "lucide-react";

export default function NoteLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
      <div className="w-full max-w-sm rounded-3xl border bg-background p-6 text-center shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
        <h1 className="mt-4 text-base font-semibold">Opening your note…</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The editor is loading. Your click worked.
        </p>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-orange-500" />
        </div>
      </div>
    </main>
  );
}
