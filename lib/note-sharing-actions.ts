"use server";

import { getNote, type Space } from "@/lib/actions";
import { requireAnonymousUser } from "@/lib/supabase";
import { displayNameForDevice } from "@/lib/display-name";
import { noteSharePath } from "@/lib/room-links";

type InvitationRoom = Pick<Space, "id" | "slug" | "access_version">;
type CachedInvitation = { token: string; roomId: string; accessVersion: number };

export async function prepareNoteShare(
  noteSlug: string,
  cached?: CachedInvitation,
): Promise<{ path: string; token: string; room: InvitationRoom; grantsRoomAccess: boolean }> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(noteSlug)) throw new Error("Invalid note");
  const note = await getNote(noteSlug);
  if (!note) throw new Error("Note unavailable or room access revoked");
  if (note.is_locked) throw new Error("Make this note shared before copying a viewing link");

  const { supabase, user } = await requireAnonymousUser();
  const { data: room, error } = await supabase.from("spaces")
    .select("id,slug,access_version,secure_invites,creator_device_id,delivery_mode")
    .eq("id", note.space_id).maybeSingle();
  if (error || !room) throw new Error("Room unavailable or access revoked");

  let token = "";
  if (cached && cached.roomId === room.id && cached.accessVersion === room.access_version
    && /^[a-f0-9]{64}$/.test(cached.token || "")) {
    const { data: joined, error: joinError } = await supabase.rpc("join_room_invitation", {
      p_token: cached.token, p_display_name: displayNameForDevice(user.id),
    });
    if (!joinError && joined?.id === room.id) token = cached.token;
  }
  if (!token && room.secure_invites && room.creator_device_id === user.id) {
    const { data: invitation, error: invitationError } = await supabase.rpc("create_room_invitation", {
      p_space_id: room.id, p_can_write: room.delivery_mode !== "read_only", p_expires_at: null,
    });
    if (invitationError || !/^[a-f0-9]{64}$/.test(invitation?.token || "")) {
      throw new Error("Unable to prepare an invitation. Please try again");
    }
    token = invitation.token;
  }
  return {
    path: noteSharePath(room.slug, note.slug, token), token,
    room: { id: room.id, slug: room.slug, access_version: room.access_version },
    grantsRoomAccess: Boolean(token) || !room.secure_invites,
  };
}
