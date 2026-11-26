/**
 * Pure, runtime-agnostic video helpers shared across client UI, upload flows,
 * server actions, and unit tests.
 */

export interface VideoPlaylistItem {
  url: string;
  name: string;
  size?: number;
  type?: string;
  width?: number;
  height?: number;
  duration?: number;
  poster?: string;
}

export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export const MAX_POSTER_CHARS_PER_VIDEO = 24_000;
export const MAX_TOTAL_POSTER_CHARS_PER_ENTRY = 160_000;
export const TARGET_TOTAL_POSTER_CHARS_PER_ENTRY = 140_000;
export const MAX_VIDEO_DURATION_SECONDS = 86_400;

const SAFE_POSTER_DATA_URL_RE =
  /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/=]+$/i;

const VIDEO_EXTENSION_MIME_MAP: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  ogv: "video/ogg",
  mkv: "video/x-matroska",
};

/** Format a video duration in seconds as `M:SS` or `H:MM:SS`. */
export function formatVideoDuration(seconds?: number | null): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return "";
  }
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const paddedSecs = String(secs).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSecs}`;
  }
  return `${minutes}:${paddedSecs}`;
}

/** Validate a compact WebP/JPEG poster data URL with a strict character cap. */
export function isSafePosterDataUrl(
  value: unknown,
  maxChars = MAX_POSTER_CHARS_PER_VIDEO,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxChars &&
    SAFE_POSTER_DATA_URL_RE.test(value)
  );
}

/** Compute per-video base64 character budget so multi-video batches stay compact. */
export function computePosterBudget(videoCount: number): number {
  const count = Math.max(1, Math.floor(Number.isFinite(videoCount) ? videoCount : 1));
  return Math.min(
    18_000,
    Math.max(4_000, Math.floor(TARGET_TOTAL_POSTER_CHARS_PER_ENTRY / count)),
  );
}

/** Calculate aspect-preserving thumbnail dimensions without upscaling. */
export function calculateThumbnailDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(maxEdge) ||
    maxEdge <= 0
  ) {
    return { width: 320, height: 180 };
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Infer a canonical MIME type for video files when OS/browser leaves it empty. */
export function resolveUploadMimeType(fileName: string, reportedType?: string): string {
  const cleanReported = (reportedType || "").trim();
  if (cleanReported && cleanReported !== "application/octet-stream") {
    return cleanReported;
  }
  const dot = fileName.lastIndexOf(".");
  if (dot > 0 && dot < fileName.length - 1) {
    const ext = fileName.slice(dot + 1).toLowerCase();
    if (ext in VIDEO_EXTENSION_MIME_MAP) {
      return VIDEO_EXTENSION_MIME_MAP[ext];
    }
  }
  return cleanReported || "application/octet-stream";
}

/** Clamp a seek time safely within `[0, duration]`. */
export function clampSeekTime(targetSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(targetSeconds)) return 0;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return Math.max(0, targetSeconds);
  }
  return Math.min(durationSeconds, Math.max(0, targetSeconds));
}

/** Step playback rate through `PLAYBACK_RATES` presets. */
export function stepPlaybackRate(currentRate: number, direction: -1 | 1): number {
  let closestIdx = 0;
  let closestDiff = Infinity;
  for (let i = 0; i < PLAYBACK_RATES.length; i++) {
    const diff = Math.abs(PLAYBACK_RATES[i] - currentRate);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestIdx = i;
    }
  }
  const nextIdx = Math.min(
    PLAYBACK_RATES.length - 1,
    Math.max(0, closestIdx + direction),
  );
  return PLAYBACK_RATES[nextIdx];
}

/** Classify a tap/click X position into left seek, center toggle, or right seek zone. */
export function resolveDoubleTapZone(
  relativeX: number,
  width: number,
): "left" | "center" | "right" {
  if (!Number.isFinite(width) || width <= 0) return "center";
  const ratio = relativeX / width;
  if (ratio <= 0.36) return "left";
  if (ratio >= 0.64) return "right";
  return "center";
}

/**
 * Append a cache-busting query token to private `/api/files/` URLs so the
 * browser re-requests a fresh bounded signed Storage URL after expiry.
 */
export function buildRecoveryMediaUrl(src: string, attempt: number, nonce = Date.now()): string {
  if (!src.startsWith("/api/files/")) return src;
  try {
    const url = new URL(src, "https://woff.local");
    url.searchParams.set("_r", `${attempt}-${nonce}`);
    return `${url.pathname}${url.search}`;
  } catch {
    return src;
  }
}

/** Normalize a reported video duration before saving in entry metadata. */
export function sanitizeVideoDuration(value: unknown): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > MAX_VIDEO_DURATION_SECONDS
  ) {
    return undefined;
  }
  return Math.round(value * 10) / 10;
}
