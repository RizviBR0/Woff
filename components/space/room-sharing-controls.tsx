"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, Check, ChevronDown, Clock, Copy, Infinity, Loader2, RefreshCw, ShieldCheck, Timer } from "lucide-react";
import { toast } from "sonner";
import type { Space } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LocalDateTime } from "@/components/local-date-time";
import { CustomDateTimePicker } from "./custom-date-time-picker";
import { RoomIdentityEditor } from "./room-identity-editor";
import { isLegacyRoomSlug } from "@/lib/room-slug";

type TimeChoice = "none" | "hour" | "day" | "week" | "custom";

export function RoomSharingControls({
  space,
  isCreator,
  codeOpen,
  onAccessChange,
  onRotateCode,
  onRevokeAccess,
  onIdentityChange,
}: {
  space: Space;
  isCreator: boolean;
  codeOpen: boolean;
  onAccessChange: (codeEnabled: boolean, expiresAt?: string | null) => Promise<void>;
  onRotateCode: (code?: string) => Promise<void>;
  onRevokeAccess: () => Promise<void>;
  onIdentityChange: (name: string, slug: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [newCode, setNewCode] = useState(isLegacyRoomSlug(space.slug) ? space.slug : "");
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [timeChoice, setTimeChoice] = useState<TimeChoice>(space.expires_at ? "custom" : "none");
  const [customDateOpen, setCustomDateOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const pending = useRef(false);
  const customDateTriggerRef = useRef<HTMLButtonElement>(null);
  const customUrl = !isLegacyRoomSlug(space.slug);
  const canCustomize = isCreator && space.can_customize_identity === true;
  const noLimitActive = !space.expires_at && space.expiry_mode !== "inactivity";

  useEffect(() => {
    setNewCode(isLegacyRoomSlug(space.slug) ? space.slug : "");
    setTimeChoice(space.expires_at ? "custom" : "none");
  }, [space.slug, space.expires_at]);

  async function run(name: string, action: () => Promise<void>) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(name);
    setError("");
    try {
      await action();
      if (name === "code") setEditingCode(false);
      if (name === "revoke") setConfirmRevoke(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      return false;
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  async function saveDeadline(choice: TimeChoice = timeChoice) {
    let expiresAt: string | null = null;
    if (choice === "hour") {
      expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    } else if (choice === "day") {
      expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    } else if (choice === "week") {
      expiresAt = new Date(Date.now() + 604_800_000).toISOString();
    } else if (choice === "none") {
      expiresAt = null;
    }
    await run("time", () => onAccessChange(codeOpen, expiresAt));
  }

  return (
    <div className="min-w-0 space-y-5">
      {canCustomize && <section className="rounded-2xl border border-border/70 bg-muted/20 p-4">
        {editingIdentity ? <RoomIdentityEditor key={`${space.id}-${space.slug}-${space.name}`} space={space} onCancel={() => setEditingIdentity(false)} onSave={async (name, slug) => {
          if (pending.current) throw new Error("A room update is already in progress.");
          pending.current = true;
          setBusy("identity");
          try { await onIdentityChange(name, slug); setEditingIdentity(false); }
          finally { pending.current = false; setBusy(null); }
        }} /> : <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-xs text-muted-foreground">Room name & URL</p><p className="mt-1 truncate text-sm font-medium">{space.name || space.title || `Room ${space.slug}`}</p></div>
          <Button type="button" size="sm" variant="ghost" disabled={Boolean(busy)} className="h-9 shrink-0 rounded-lg bg-transparent px-3 text-xs" onClick={() => { setEditingCode(false); setEditingIdentity(true); }}>Edit</Button>
        </div>}
      </section>}
      <section className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-white/[0.07] dark:bg-white/[0.025]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{customUrl ? "Room address" : "Room code"}</p>
          {isCreator ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void run("access", () => onAccessChange(!codeOpen))}
              role="switch"
              aria-checked={codeOpen}
              aria-label={customUrl ? "Allow joining with room address" : "Allow joining with room code"}
              className={`inline-flex min-h-8 items-center gap-2 rounded-full bg-transparent pl-2 pr-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 disabled:opacity-50 ${codeOpen ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}
            >
              {codeOpen ? "Open" : "Closed"}
              {busy === "access" ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className={`flex h-5 w-8 items-center rounded-full p-0.5 transition-colors ${codeOpen ? "justify-end bg-emerald-500" : "justify-start bg-zinc-300 dark:bg-zinc-600"}`}><span className="h-4 w-4 rounded-full bg-white shadow-sm" /></span>}
            </button>
          ) : <span className="text-[11px] text-muted-foreground">{codeOpen ? "Open" : "Closed"}</span>}
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className={`${customUrl ? "min-w-0 break-all font-mono text-base font-semibold" : "font-mono text-[32px] font-medium leading-none tracking-[0.2em] sm:tracking-[0.26em]"} ${codeOpen ? "text-foreground" : "text-muted-foreground"}`}>{space.slug}</span>
          <div className="flex shrink-0 items-center gap-1">
            {isCreator && <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingCode(!editingCode); setEditingIdentity(false); setError(""); }} disabled={Boolean(busy)} aria-expanded={editingCode} aria-controls="room-code-editor" className="h-9 rounded-lg bg-transparent px-2 text-xs text-muted-foreground hover:text-foreground">{editingCode ? "Cancel" : customUrl ? "Use code" : "Change"}</Button>}
            <Button
              type="button" variant="outline" size="icon" className="h-9 w-9 rounded-lg border-border/80 bg-white shadow-sm dark:bg-white/[0.04]" disabled={!codeOpen}
              aria-label={customUrl ? "Copy room address" : "Copy room code"}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(space.slug);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                } catch { toast.error("Unable to copy room code"); }
              }}
            >{copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}</Button>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{codeOpen ? `Anyone with this ${customUrl ? "address" : "code"} can join.` : `${customUrl ? "Address" : "Code"} joining is off. Invitation links still work.`}</p>
        {editingCode && (
          <form id="room-code-editor" onSubmit={(event) => { event.preventDefault(); void run("code", () => onRotateCode(newCode)); }} className="mt-4 space-y-2.5 border-t border-border/60 pt-4">
            <label htmlFor="new-room-code" className="text-xs font-medium">New code</label>
            <div className="flex gap-2">
              <Input id="new-room-code" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} value={newCode} onChange={(event) => setNewCode(event.target.value.replace(/\D/g, "").slice(0, 4))} className="h-9 min-w-0 rounded-lg font-mono tracking-widest" aria-describedby="new-room-code-help" />
              <Button type="submit" size="sm" disabled={Boolean(busy) || newCode.length !== 4 || newCode === space.slug} className="h-9 bg-orange-500 text-white hover:bg-orange-600">Save</Button>
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" disabled={Boolean(busy)} aria-label="Generate new room code" onClick={() => void run("code", () => onRotateCode())}>{busy === "code" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</Button>
            </div>
            <p id="new-room-code-help" className="text-[11px] text-muted-foreground">4 digits. The old code stops working; members stay.</p>
          </form>
        )}
      </section>

      {isCreator && (
        <section className="space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Time limit
            </span>
            <span className="rounded-md bg-muted/60 px-2 py-1 text-[10px] font-medium text-muted-foreground">Optional</span>
          </div>

          {/* Active Limit Status Banner if set */}
          {space.expires_at && (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-orange-500/[0.07] px-3.5 py-3 text-xs">
              <div className="flex items-center gap-2 font-medium text-orange-600 dark:text-orange-400">
                <Timer className="h-4 w-4 shrink-0" />
                <span>
                  Room closes <LocalDateTime value={space.expires_at} />
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={Boolean(busy)}
                onClick={() => void run("time", () => onAccessChange(codeOpen, null))}
                className="h-8 shrink-0 bg-transparent px-2 text-[11px] text-muted-foreground transition-colors hover:bg-orange-500/10 hover:text-destructive"
              >
                Remove
              </Button>
            </div>
          )}

          {/* Preset Options Tabs / Segmented Pills */}
          <div role="group" aria-label="Room time limit" className="grid grid-cols-5 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-white/[0.04]">
            {[
              { id: "none" as const, label: "No limit" },
              { id: "hour" as const, label: "1 hour" },
              { id: "day" as const, label: "24 hours" },
              { id: "week" as const, label: "7 days" },
              { id: "custom" as const, label: "Custom", icon: Calendar },
            ].map((opt) => {
              const active = timeChoice === opt.id;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  ref={opt.id === "custom" ? customDateTriggerRef : undefined}
                  type="button"
                  disabled={Boolean(busy)}
                  aria-pressed={active}
                  onClick={() => {
                    if (opt.id === "custom") setCustomDateOpen(true);
                    else setTimeChoice(opt.id);
                    setError("");
                  }}
                  className={`flex h-9 items-center justify-center gap-1 rounded-lg px-0.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 disabled:opacity-50 sm:text-xs ${
                    active
                      ? "bg-white text-foreground shadow-sm ring-1 ring-black/[0.04] dark:bg-[#29292d] dark:ring-white/[0.06]"
                      : "bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  {Icon && <Icon className={`hidden h-3 w-3 sm:block ${active ? "text-orange-500" : ""}`} />}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Content according to choice */}
          {timeChoice === "custom" ? (
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => { setError(""); setCustomDateOpen(true); }} className="h-10 w-full gap-2 rounded-xl border-border/70 bg-transparent text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />Edit date & time
            </Button>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3.5 py-3 dark:bg-white/[0.025]">
              <div className="flex items-start gap-2.5 text-xs">
                {timeChoice === "none" ? <Infinity className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />}
                <div>
                  <p className="font-medium">{timeChoice === "none" ? "No automatic closing" : `Close in ${timeChoice === "hour" ? "1 hour" : timeChoice === "day" ? "24 hours" : "7 days"}`}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{timeChoice === "none" ? "Open until you close or delete the room." : "The countdown starts when you apply."}</p>
                </div>
              </div>
              {timeChoice === "none" && noLimitActive ? (
                <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted-foreground"><Check className="h-3 w-3" />Active</span>
              ) : <Button
                type="button"
                size="sm"
                disabled={Boolean(busy)}
                onClick={() => void saveDeadline()}
                className="h-9 shrink-0 rounded-lg bg-[#ff5a00] px-3 text-xs font-medium text-white hover:bg-[#e85100]"
              >
                {busy === "time" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
              </Button>}
            </div>
          )}

          {!space.expires_at && timeChoice === "none" && space.expiry_mode === "inactivity" && (
            <p className="text-[11px] text-muted-foreground">
              This room still has its previous inactivity limit. Apply to remove it.
            </p>
          )}

          <Dialog open={customDateOpen} onOpenChange={setCustomDateOpen}>
            <DialogContent
              onCloseAutoFocus={(event) => { event.preventDefault(); customDateTriggerRef.current?.focus({ preventScroll: true }); }}
              className="flex max-h-[calc(100dvh-2rem)] max-w-[440px] flex-col gap-0 overflow-hidden rounded-3xl border-zinc-200 bg-white p-0 dark:border-white/10 dark:bg-[#141416] [&>button:last-child]:right-4 [&>button:last-child]:top-4 [&>button:last-child]:flex [&>button:last-child]:h-8 [&>button:last-child]:w-8 [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:rounded-full [&>button:last-child]:bg-transparent [&>button:last-child]:hover:bg-muted">
              <DialogHeader className="shrink-0 border-b border-border/50 p-5 pr-12 text-left">
                <DialogTitle className="flex items-center gap-2 text-lg"><Calendar className="h-4 w-4 text-orange-500" />Custom time limit</DialogTitle>
                <DialogDescription className="text-xs">Choose when this room closes, in your local time.</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
                <CustomDateTimePicker
                  initialDate={space.expires_at}
                  onApply={async (iso) => {
                    const saved = await run("time", () => onAccessChange(codeOpen, iso));
                    if (saved) {
                      setTimeChoice("custom");
                      setCustomDateOpen(false);
                    }
                  }}
                  isBusy={Boolean(busy)}
                />
                {error && <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
              </div>
            </DialogContent>
          </Dialog>
        </section>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {isCreator && (
        <details className="group border-t border-border/60 pt-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg bg-transparent py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 [&::-webkit-details-marker]:hidden">
            <ShieldCheck className="h-4 w-4" />Advanced access
            <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3 space-y-2.5">
            {confirmRevoke ? (
              <div className="space-y-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                <p className="text-xs">Remove all other members and replace the invitation link? The room code will also close.</p>
                <p className="text-[11px] text-muted-foreground">Downloaded files remain on recipients&apos; devices.</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="destructive" disabled={Boolean(busy)} onClick={() => void run("revoke", onRevokeAccess)}>{busy === "revoke" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Revoke access</Button>
                  <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => setConfirmRevoke(false)}>Cancel</Button>
                </div>
              </div>
            ) : <Button type="button" variant="ghost" size="sm" className="h-9 bg-transparent px-0 text-xs text-red-600 hover:bg-transparent hover:text-red-700 dark:text-red-400" onClick={() => setConfirmRevoke(true)}>Revoke all recipient access</Button>}
          </div>
        </details>
      )}
    </div>
  );
}
