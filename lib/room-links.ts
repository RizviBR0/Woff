export function extractInvitationPath(value: string): string | null {
  const raw = value.trim();
  const trimmed = /^(?:(?:www\.)?woff\.space|localhost(?::[0-9]{1,5})?)\//i.test(raw) ? `https://${raw}` : raw;
  try {
    const url = trimmed.startsWith("/") ? null : new URL(trimmed);
    if (url && !["http:", "https:"].includes(url.protocol)) return null;
    const parsed = url || new URL(trimmed, "https://woff.space");
    const path = parsed.pathname;
    if (!/^\/s\/[a-f0-9]{64}$/.test(path)) return null;
    const note = parsed.searchParams.get("note");
    if (note !== null && !/^[a-zA-Z0-9_-]{1,128}$/.test(note)) return null;
    return note ? `${path}?note=${encodeURIComponent(note)}` : path;
  } catch { return null; }
}

export function noteSharePath(slug: string, note: string, token?: string): string {
  if (!isValidRoomSlug(slug) || !/^[a-zA-Z0-9_-]{1,128}$/.test(note)) {
    throw new Error("Invalid note sharing path");
  }
  return token && /^[a-f0-9]{64}$/.test(token)
    ? `${roomSharePath(slug, token)}?note=${encodeURIComponent(note)}`
    : `/${slug}/${encodeURIComponent(note)}`;
}

export function roomSharePath(slug: string, token?: string): string {
  if (!isValidRoomSlug(slug)) throw new Error("Invalid room sharing path");
  return token && /^[a-f0-9]{64}$/.test(token) ? `/s/${token}` : `/${slug}`;
}
import { isValidRoomSlug } from "@/lib/room-slug";

