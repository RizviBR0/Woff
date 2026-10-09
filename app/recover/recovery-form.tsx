"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { recoverSpace, createRoomInvitation } from "@/lib/actions";
import { rememberSpaceOwnership } from "@/lib/space-recovery";
import { publicCardClass } from "@/components/public-page-shell";
import { isValidRoomSlug, normalizeRoomSlug, ROOM_SLUG_MAX_LENGTH } from "@/lib/room-slug";

export function RecoveryForm() {
  const [code, setCode] = useState(""); const [key, setKey] = useState(""); const [busy, setBusy] = useState(false);
  const roomSlug = normalizeRoomSlug(code);
  const router = useRouter();
  return <form className={`${publicCardClass} mx-auto max-w-lg space-y-5`} onSubmit={async (event) => {
    event.preventDefault();
    if (busy || !isValidRoomSlug(roomSlug)) return;
    setBusy(true);
    try {
      const recovered = await recoverSpace(roomSlug, key);
      if (!recovered) throw new Error("The room or recovery key is invalid, or the room has expired.");
      rememberSpaceOwnership({ ...recovered.space, recovery_key: recovered.recovery_key });
      const invitation = await createRoomInvitation(recovered.space.id).catch(() => null);
      if (invitation) rememberSpaceOwnership({ ...recovered.space, invite_token: invitation.token });
      toast.success("Ownership recovered. Save the replacement recovery key from Settings.");
      router.push(`/${recovered.space.slug}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to recover room"); }
    finally { setBusy(false); }
  }}><label className="block space-y-2 text-sm font-medium">Room code or URL name<Input value={code} maxLength={ROOM_SLUG_MAX_LENGTH} onChange={(event) => setCode(event.target.value.toLowerCase())} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="1234 or your-name" disabled={busy} /></label><label className="block space-y-2 text-sm font-medium">Recovery key<Input type="password" value={key} maxLength={32} onChange={(event) => setKey(event.target.value.trim().toUpperCase())} autoComplete="off" disabled={busy} /></label><p className="text-xs text-muted-foreground">This key grants ownership. Successful recovery replaces it. Keep the new key somewhere private.</p><Button variant="primary" disabled={busy || !isValidRoomSlug(roomSlug) || ![20,32].includes(key.length)} type="submit">{busy ? "Recovering…" : "Recover ownership"}</Button></form>;
}
