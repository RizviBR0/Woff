import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { extractRoomSlug } from "@/lib/room-slug";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// New rooms have no deadline. Only legacy inactivity rooms use the old fallback.
export function roomExpiryTimestamp(room: {
  expires_at?: string | null;
  expiry_mode?: "none" | "fixed" | "inactivity";
  last_activity_at?: string;
}): string | null {
  if (room.expiry_mode === "none") return null;
  if (room.expires_at) return room.expires_at;
  if ((room.expiry_mode === "inactivity" || room.expiry_mode === undefined) && room.last_activity_at) {
    const activity = Date.parse(room.last_activity_at);
    return Number.isFinite(activity) ? new Date(activity + 172800000).toISOString() : null;
  }
  return null;
}

export function getHoursUntilExpiry(value: string, isExpiryTimestamp = false): number {
  const date = new Date(value);
  const expiryDate = isExpiryTimestamp
    ? date
    : new Date(date.getTime() + 48 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (60 * 60 * 1000)));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function extractRoomCode(input: string): string {
  return extractRoomSlug(input);
}
