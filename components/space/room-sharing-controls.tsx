"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, Check, Clock, Copy, Loader2, RefreshCw, Timer } from "lucide-react";
import { toast } from "sonner";
import type { Space } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const pending = useRef(false);
  const customUrl = !isLegacyRoomSlug(space.slug);
  const canCustomize = isCreator && space.can_customize_identity === true;

  useEffect(() => {
    setNewCode(isLegacyRoomSlug(space.slug) ? space.slug : "");
    setTimeChoice(space.expires_at ? "custom" : "none");
  }, [space.slug, space.expires_at]);

  async function run(name: string, action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(name);
    setError("");
    try {
      await action();
      if (name === "code") setEditingCode(false);
      if (name === "revoke") setConfirmRevoke(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
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
      {canCustomize && <section className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
        {editingIdentity ? <RoomIdentityEditor key={`${space.id}-${space.slug}-${space.name}`} space={space} onCancel={() => setEditingIdentity(false)} onSave={async (name, slug) => {
          if (pending.current) throw new Error("A room update is already in progress.");
          pending.current = true;
          setBusy("identity");
          try { await onIdentityChange(name, slug); setEditingIdentity(false); }
          finally { pending.current = false; setBusy(null); }
        }} /> : <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-xs text-muted-foreground">Room name & URL</p><p className="mt-1 truncate text-sm font-medium">{space.name || space.title || `Room ${space.slug}`}</p></div>
          <Button type="button" size="sm" variant="ghost" disabled={Boolean(busy)} className="h-8 shrink-0 px-2 text-xs" onClick={() => { setEditingCode(false); setEditingIdentity(true); }}>Edit</Button>
        </div>}
      </section>}
      <section className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{customUrl ? "Room address" : "Room code"}</p>
          {isCreator ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void run("access", () => onAccessChange(!codeOpen))}
              role="switch"
              aria-checked={codeOpen}
              aria-label="Allow joining with room code"
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${codeOpen ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-zinc-500/10 text-muted-foreground"}`}
            >
              {codeOpen ? "Open" : "Closed"}
              {busy === "access" ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className={`flex h-3.5 w-6 items-center rounded-full p-0.5 ${codeOpen ? "justify-end bg-emerald-500" : "justify-start bg-zinc-400"}`}><span className="h-2.5 w-2.5 rounded-full bg-white" /></span>}
            </button>
          ) : <span className="text-[11px] text-muted-foreground">{codeOpen ? "Open" : "Closed"}</span>}
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className={customUrl ? "min-w-0 break-all font-mono text-base font-semibold" : "font-mono text-3xl font-semibold tracking-[0.22em]"}>{space.slug}</span>
          <div className="flex shrink-0 items-center gap-1">
            {isCreator && <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingCode(!editingCode); setEditingIdentity(false); setError(""); }} disabled={Boolean(busy)} className="h-8 px-2 text-xs">{customUrl ? "Use code" : "Change"}</Button>}
            <Button
              type="button" variant="outline" size="icon" className="h-8 w-8" disabled={!codeOpen}
              aria-label="Copy room code"
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
        <p className="mt-2 text-xs text-muted-foreground">{codeOpen ? "Anyone with this code can join." : "Code joining is off. Invitation links still work."}</p>
        {editingCode && (
          <form onSubmit={(event) => { event.preventDefault(); void run("code", () => onRotateCode(newCode)); }} className="mt-3 space-y-2.5 border-t pt-3">
            <label htmlFor="new-room-code" className="text-xs font-medium">New code</label>
            <div className="flex gap-2">
              <Input id="new-room-code" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} value={newCode} onChange={(event) => setNewCode(event.target.value.replace(/\D/g, "").slice(0, 4))} className="h-9 min-w-0 font-mono tracking-widest" aria-describedby="new-room-code-help" />
              <Button type="submit" size="sm" disabled={Boolean(busy) || newCode.length !== 4 || newCode === space.slug} className="h-9 bg-orange-500 text-white hover:bg-orange-600">Save</Button>
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" disabled={Boolean(busy)} aria-label="Generate new room code" onClick={() => void run("code", () => onRotateCode())}>{busy === "code" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</Button>
            </div>
            <p id="new-room-code-help" className="text-[11px] text-muted-foreground">4 digits. The old code stops working; members stay.</p>
          </form>
        )}
      </section>

      {isCreator && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-orange-500" />
              Time limit
            </span>
            <span className="text-[11px] text-muted-foreground">Optional</span>
          </div>

          {/* Active Limit Status Banner if set */}
          {space.expires_at && (
            <div className="flex items-center justify-between rounded-xl border border-orange-500/25 bg-orange-500/8 px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2 font-medium text-orange-600 dark:text-orange-400">
                <Timer className="h-4 w-4 shrink-0 animate-pulse" />
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
                className="h-6 px-2 text-[11px] text-muted-foreground hover:bg-orange-500/10 hover:text-destructive transition-colors"
              >
                Remove
              </Button>
            </div>
          )}

          {/* Preset Options Tabs / Segmented Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1 rounded-xl bg-muted/40 border border-border/60 text-xs">
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
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    setTimeChoice(opt.id);
                    setError("");
                  }}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-medium text-xs transition-all ${
                    active
                      ? "bg-white dark:bg-[#1f1f23] text-foreground shadow-sm font-semibold border border-border/40"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  } ${opt.id === "custom" ? "col-span-2 sm:col-span-1" : ""}`}
                >
                  {Icon && <Icon className={`h-3.5 w-3.5 ${active ? "text-orange-500" : ""}`} />}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Content according to choice */}
          {timeChoice === "custom" ? (
            <CustomDateTimePicker
              initialDate={space.expires_at}
              onApply={async (iso) => {
                await run("time", () => onAccessChange(codeOpen, iso));
              }}
              isBusy={busy === "time"}
            />
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-3.5 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                <span>
                  {timeChoice === "none" && "Room stays open until you manually close or delete it."}
                  {timeChoice === "hour" && "Room will close automatically in 1 hour."}
                  {timeChoice === "day" && "Room will close automatically in 24 hours."}
                  {timeChoice === "week" && "Room will close automatically in 7 days."}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={Boolean(busy)}
                onClick={() => void saveDeadline()}
                className="h-8 shrink-0 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 font-medium transition active:scale-95 shadow-sm"
              >
                {busy === "time" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
              </Button>
            </div>
          )}

          {!space.expires_at && timeChoice === "none" && (
            <p className="text-[11px] text-muted-foreground">
              {space.expiry_mode === "inactivity"
                ? "This room still has its previous inactivity limit."
                : "Open until you close or delete it."}
            </p>
          )}
        </section>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {isCreator && (
        <details className="border-t pt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground">Advanced access</summary>
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
            ) : <Button type="button" variant="ghost" size="sm" className="h-8 px-0 text-xs text-red-600 hover:bg-transparent hover:text-red-700 dark:text-red-400" onClick={() => setConfirmRevoke(true)}>Revoke all recipient access</Button>}
          </div>
        </details>
      )}
    </div>
  );
}
