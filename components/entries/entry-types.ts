export interface Entry {
  id: string;
  space_id: string;
  kind: "text" | "image" | "pdf" | "file";
  text: string | null;
  asset_id?: string;
  meta: any;
  created_by_device_id: string | null;
  created_at: string;
  expires_at?: string | null;
  // Optimistic UI fields
  isLoading?: boolean;
  uploadProgress?: number;
  uploadMessage?: string;
  isError?: boolean;
}

export type EntryCategory = "text" | "note" | "media" | "file";

export interface UploadedFileItem {
  path: string;
  url: string;
  name: string;
  type: string;
  size: number;
  width?: number;
  height?: number;
}

export function isImageFile(type?: string, name?: string): boolean {
  return (
    Boolean(type?.startsWith("image/")) ||
    /\.(jpg|jpeg|png|gif|webp|avif|svg)$/i.test(name || "")
  );
}

export function isVideoFile(type?: string, name?: string): boolean {
  return (
    Boolean(type?.startsWith("video/")) ||
    /\.(mp4|webm|mov|m4v|ogv)$/i.test(name || "")
  );
}

const SAFE_NOTE_SLUG_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const LEGACY_NOTE_TEXT_RE = /^NOTE:([a-zA-Z0-9_-]{4,64})(?::|$)/;
const SAFE_LEGACY_MEDIA_URL_RE =
  /^(?:data:image\/(png|jpeg|jpg|gif|webp|avif);base64,[A-Za-z0-9+/=]+|\/api\/files\/[^\s]+)$/i;

export function isValidNoteSlug(slug: unknown): slug is string {
  return typeof slug === "string" && SAFE_NOTE_SLUG_RE.test(slug);
}

export function isSafeLegacyMediaUrl(url: unknown): url is string {
  return typeof url === "string" && SAFE_LEGACY_MEDIA_URL_RE.test(url.trim());
}

export function parseLegacyPhotosText(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(isSafeLegacyMediaUrl);
      }
    } catch {
      // Fall back to comma-delimited parsing
    }
  }
  return trimmed
    .split(/,(?=(?:data:image\/|\/api\/files\/))/i)
    .map((part) => part.trim())
    .filter(isSafeLegacyMediaUrl);
}

export function extractNoteSlugFromEntry(entry: Entry): string | null {
  if (isValidNoteSlug(entry.meta?.note_slug)) {
    return entry.meta.note_slug;
  }
  if (typeof entry.text === "string") {
    const match = entry.text.match(LEGACY_NOTE_TEXT_RE);
    if (match && isValidNoteSlug(match[1])) return match[1];
  }
  return null;
}

export function getEntryCategory(entry: Entry): EntryCategory {
  if (
    entry.meta?.type === "note" ||
    (typeof entry.text === "string" && LEGACY_NOTE_TEXT_RE.test(entry.text))
  ) {
    return "note";
  }

  const isMediaPresentation =
    entry.kind === "image" ||
    entry.meta?.presentation === "photos" ||
    entry.meta?.presentation === "drawing" ||
    entry.meta?.type === "photos" ||
    entry.meta?.type === "drawing";

  const isMediaText =
    entry.kind === "text" &&
    typeof entry.text === "string" &&
    ((entry.text.startsWith("PHOTO:") &&
      isSafeLegacyMediaUrl(entry.text.slice("PHOTO:".length))) ||
      (entry.text.startsWith("DRAWING:") &&
        isSafeLegacyMediaUrl(entry.text.slice("DRAWING:".length))) ||
      (entry.text.startsWith("PHOTOS:") &&
        parseLegacyPhotosText(entry.text.slice("PHOTOS:".length)).length > 0));

  if (isMediaPresentation || isMediaText) {
    return "media";
  }

  if (entry.kind === "file" || entry.kind === "pdf" || entry.meta?.type === "files") {
    return "file";
  }

  return "text";
}

export const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-sky-500",
  "bg-fuchsia-500",
  "bg-teal-500",
  "bg-purple-500",
  "bg-orange-500",
];

export function getAvatarColorIndex(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
  }
  return Math.abs(hash) % AVATAR_COLORS.length;
}
