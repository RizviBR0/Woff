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

export function getEntryCategory(entry: Entry): EntryCategory {
  if (entry.meta?.type === "note" || entry.text?.startsWith("NOTE:")) {
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
    entry.text !== null &&
    (entry.text.startsWith("PHOTO:") ||
      entry.text.startsWith("PHOTOS:") ||
      entry.text.startsWith("DRAWING:"));

  if (isMediaPresentation || isMediaText) {
    return "media";
  }

  if (entry.kind === "file" || entry.meta?.type === "files") {
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
