"use client";

import { useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Space } from "@/lib/actions";
import { isValidRoomSlug, normalizeRoomSlug, ROOM_SLUG_MAX_LENGTH, suggestRoomSlug } from "@/lib/room-slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RoomIdentityEditor({ space, onSave, onCancel }: {
  space: Pick<Space, "slug" | "name" | "title">;
  onSave: (name: string, slug: string) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(space.name || space.title || "");
  const [slug, setSlug] = useState(space.slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const normalizedSlug = normalizeRoomSlug(slug);
  const suggestion = suggestRoomSlug(name);
  const validName = Boolean(name.trim()) && Array.from(name.trim()).length <= 120;
  const validSlug = isValidRoomSlug(normalizedSlug);
  const changedUrl = normalizedSlug !== space.slug;

  return <form className="min-w-0 space-y-4" onSubmit={async event => {
    event.preventDefault();
    if (pending.current) return;
    if (!validName || !validSlug) {
      setError(!validName ? "Enter a room name, up to 120 characters." : "Use 3–40 characters with at least one English letter. Numbers and single hyphens are allowed. Some addresses are reserved.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try { await onSave(name.trim(), normalizedSlug); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to save the room. Try again."); }
    finally { pending.current = false; setBusy(false); }
  }}>
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <div className="space-y-2">
        <label htmlFor={`${id}-name`} className="text-xs font-medium">Room name</label>
        <Input id={`${id}-name`} value={name} maxLength={120} autoComplete="off" placeholder="Sabbir’s files" onChange={event => setName(event.target.value)} className="text-base sm:text-sm" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={`${id}-slug`} className="text-xs font-medium">Room URL</label>
          <button type="button" disabled={!isValidRoomSlug(suggestion)} onClick={() => { setSlug(suggestion); setError(""); }} className="shrink-0 text-xs font-medium text-orange-600 hover:underline disabled:opacity-40 disabled:no-underline dark:text-orange-400">Use room name</button>
        </div>
        <div className="flex min-w-0 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <span className="shrink-0 pl-3 text-xs text-muted-foreground">woff.space/</span>
          <Input id={`${id}-slug`} value={slug} maxLength={ROOM_SLUG_MAX_LENGTH} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={event => setSlug(event.target.value.toLowerCase())} aria-describedby={`${id}-slug-help`} className="min-w-0 border-0 bg-transparent pl-1 text-base shadow-none focus-visible:ring-0 sm:text-sm" />
        </div>
        <p id={`${id}-slug-help`} className="text-[11px] leading-relaxed text-muted-foreground">3–40 characters, including an English letter. Numbers and single hyphens are allowed. You can also keep a 4-digit code.</p>
        {changedUrl && <p className="text-xs leading-relaxed text-muted-foreground">The old room URL will stop working. Invitation links and joined members stay connected.</p>}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!validName || !validSlug}>{busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{busy ? "Saving…" : "Save room"}</Button>
      </div>
    </fieldset>
  </form>;
}
