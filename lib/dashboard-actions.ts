"use server";

import { requireVerifiedSender } from "@/lib/account";
import type { Space } from "@/lib/actions";
import { isValidRoomSlug, normalizeRoomSlug } from "@/lib/room-slug";

export interface HandoffTemplate {
  name: string;
  welcome_text: string;
  delivery_mode: "collaborative" | "read_only";
  retention_days: 7 | 30;
}
export interface SenderDashboard {
  plan: "free" | "pro";
  is_pro: boolean;
  storage_used_bytes: number;
  reserved_bytes: number;
  storage_limit_bytes: number;
  active_room_count: number;
  active_room_limit: number;
  rooms: Space[];
  template: Partial<HandoffTemplate>;
}

async function senderClient() {
  const { supabase } = await requireVerifiedSender();
  return supabase;
}

export async function getSenderDashboard(): Promise<SenderDashboard> {
  const supabase = await senderClient();
  const { error: ensureError } = await supabase.rpc("ensure_sender_account");
  if (ensureError)
    throw new Error(
      "Sender dashboard setup is pending. Please try again later.",
    );
  const { data, error } = await supabase.rpc("get_sender_dashboard");
  if (error || !data)
    throw new Error("Unable to load your dashboard. Please try again.");
  return data;
}

export async function updateHandoffRoom(
  spaceId: string,
  settings: HandoffTemplate,
): Promise<Space> {
  const supabase = await senderClient();
  const { data, error } = await supabase.rpc("update_room_settings", {
    p_space_id: spaceId,
    p_name: settings.name,
    p_welcome_text: settings.welcome_text,
    p_delivery_mode: settings.delivery_mode,
    p_retention_days: settings.retention_days,
  });
  if (error || !data?.space)
    throw new Error(error?.message || "Unable to update room");
  return data.space;
}

export type RoomIdentityResult = { ok: true; space: Space } | { ok: false; error: string };

export async function updateRoomIdentity(
  spaceId: string,
  name: string,
  slug?: string,
): Promise<RoomIdentityResult> {
  const cleanName = name.trim();
  const cleanSlug = slug === undefined ? undefined : normalizeRoomSlug(slug);
  if (!cleanName || Array.from(cleanName).length > 120)
    return { ok: false, error: "Enter a room name, up to 120 characters." };
  if (cleanSlug !== undefined && !isValidRoomSlug(cleanSlug))
    return { ok: false, error: "Choose a 3–40 character room URL with at least one English letter. Numbers and single hyphens are allowed." };
  try {
    const supabase = await senderClient();
    const { data, error } = await supabase.rpc("update_room_identity", {
      p_space_id: spaceId,
      p_name: cleanName,
      p_slug: cleanSlug ?? null,
    });
    if (error || !data?.space) {
      const message = error?.message || "";
      return { ok: false, error: /already in use/i.test(message)
        ? "That room URL is already in use. Choose another."
        : /Pro is required/i.test(message)
          ? "Pro is required to change room names and custom URLs."
          : /Room owner required/i.test(message)
            ? "You can only change active rooms you own."
            : /Too many/i.test(message)
              ? "Too many room changes. Please try again later."
              : "Unable to save the room. Please try again." };
    }
    return { ok: true, space: data.space };
  } catch {
    return { ok: false, error: "Unable to save the room. Check your sign-in and connection, then try again." };
  }
}

export async function saveHandoffTemplate(
  settings: HandoffTemplate,
): Promise<HandoffTemplate> {
  const supabase = await senderClient();
  const { data, error } = await supabase.rpc("save_sender_template", {
    p_template: settings,
  });
  if (error || !data)
    throw new Error(error?.message || "Unable to save template");
  return data;
}
