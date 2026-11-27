"use client";

import {
  calculateThumbnailDimensions,
  computePosterBudget,
  isSafePosterDataUrl,
  sanitizeVideoDuration,
} from "./video-utils";

export interface ExtractedVideoInfo {
  width?: number;
  height?: number;
  duration?: number;
  poster?: string;
}

interface ExtractOptions {
  maxBase64Chars?: number;
  maxEdge?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 4_500;
const LAZY_CACHE_MAX_ENTRIES = 120;
const LAZY_MAX_CONCURRENT = 2;

const lazyPosterCache = new Map<string, ExtractedVideoInfo | null>();
const lazyInFlight = new Map<string, Promise<ExtractedVideoInfo | null>>();

type QueueJob = {
  url: string;
  signal?: AbortSignal;
  resolve: (value: ExtractedVideoInfo | null) => void;
};

const lazyQueue: QueueJob[] = [];
let activeLazyWorkers = 0;

function isMostlyBlackFrame(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const sampleW = Math.min(width, 16);
    const sampleH = Math.min(height, 16);
    const data = ctx.getImageData(
      Math.max(0, Math.floor((width - sampleW) / 2)),
      Math.max(0, Math.floor((height - sampleH) / 2)),
      sampleW,
      sampleH,
    ).data;
    let brightPixels = 0;
    const total = sampleW * sampleH;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) {
        brightPixels++;
      }
    }
    return brightPixels / Math.max(1, total) < 0.08;
  } catch {
    return false;
  }
}

function encodeCanvasWithinBudget(
  video: HTMLVideoElement,
  naturalW: number,
  naturalH: number,
  initialMaxEdge: number,
  maxBase64Chars: number,
): { poster?: string; isBlack: boolean } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { isBlack: false };

  const edgeSteps = [initialMaxEdge, Math.min(initialMaxEdge, 360), 280, 220];
  const qualitySteps = [0.74, 0.58, 0.44];
  let checkedBlack = false;
  let frameIsBlack = false;

  for (const edge of edgeSteps) {
    const dims = calculateThumbnailDimensions(naturalW, naturalH, edge);
    canvas.width = dims.width;
    canvas.height = dims.height;
    try {
      ctx.drawImage(video, 0, 0, dims.width, dims.height);
    } catch {
      return { isBlack: false };
    }

    if (!checkedBlack) {
      checkedBlack = true;
      frameIsBlack = isMostlyBlackFrame(ctx, dims.width, dims.height);
    }

    for (const mime of ["image/webp", "image/jpeg"] as const) {
      for (const quality of qualitySteps) {
        let dataUrl = "";
        try {
          dataUrl = canvas.toDataURL(mime, quality);
        } catch {
          return { isBlack: frameIsBlack };
        }
        // Safari/older browsers may ignore image/webp and emit image/png.
        if (!dataUrl.startsWith(`data:${mime};base64,`)) {
          break;
        }
        if (isSafePosterDataUrl(dataUrl, maxBase64Chars)) {
          return { poster: dataUrl, isBlack: frameIsBlack };
        }
      }
    }
  }

  return { isBlack: frameIsBlack };
}

function captureFromVideoSrc(
  src: string,
  {
    maxBase64Chars,
    maxEdge,
    timeoutMs,
    crossOrigin,
    signal,
  }: {
    maxBase64Chars: number;
    maxEdge: number;
    timeoutMs: number;
    crossOrigin?: "anonymous";
    signal?: AbortSignal;
  },
): Promise<ExtractedVideoInfo> {
  if (typeof document === "undefined") return Promise.resolve({});
  if (signal?.aborted) return Promise.resolve({});

  return new Promise<ExtractedVideoInfo>((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    if (crossOrigin) {
      video.crossOrigin = crossOrigin;
    }

    let settled = false;
    let triedSecondSeek = false;
    let info: ExtractedVideoInfo = {};

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        // Ignore cleanup errors on detached elements.
      }
    };

    const finish = (result: ExtractedVideoInfo) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onAbort = () => finish({});
    signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => finish(info), timeoutMs);

    const captureCurrentFrame = () => {
      if (settled) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) {
        finish(info);
        return;
      }
      info = {
        ...info,
        width: w,
        height: h,
        duration: sanitizeVideoDuration(video.duration) ?? info.duration,
      };
      const encoded = encodeCanvasWithinBudget(video, w, h, maxEdge, maxBase64Chars);
      if (
        encoded.isBlack &&
        !triedSecondSeek &&
        Number.isFinite(video.duration) &&
        video.duration > 2
      ) {
        triedSecondSeek = true;
        const retryTime = Math.min(video.duration * 0.3, 3.0);
        if (Math.abs(retryTime - video.currentTime) > 0.25) {
          try {
            video.currentTime = retryTime;
            return;
          } catch {
            // Keep first captured poster if second seek fails.
          }
        }
      }
      if (encoded.poster) {
        info.poster = encoded.poster;
      }
      finish(info);
    };

    video.onerror = () => finish(info);

    video.onloadedmetadata = () => {
      if (settled) return;
      const duration = sanitizeVideoDuration(video.duration);
      info = {
        width: video.videoWidth > 0 ? video.videoWidth : undefined,
        height: video.videoHeight > 0 ? video.videoHeight : undefined,
        duration,
      };

      const seekTarget =
        duration && duration > 0.35 ? Math.min(1.0, Math.max(0.1, duration * 0.12)) : 0;

      if (seekTarget > 0) {
        try {
          video.currentTime = seekTarget;
          return;
        } catch {
          // Fall through to capture first decoded frame.
        }
      }
      if (video.readyState >= 2) {
        captureCurrentFrame();
      }
    };

    video.onloadeddata = () => {
      if (settled) return;
      if (!info.poster && video.videoWidth > 0 && video.videoHeight > 0) {
        // Keep a fallback first-frame poster in case seeking is unsupported or slow.
        const fallback = encodeCanvasWithinBudget(
          video,
          video.videoWidth,
          video.videoHeight,
          maxEdge,
          maxBase64Chars,
        );
        if (fallback.poster) {
          info = {
            ...info,
            width: video.videoWidth,
            height: video.videoHeight,
            duration: sanitizeVideoDuration(video.duration) ?? info.duration,
            poster: fallback.poster,
          };
        }
      }
      if (!info.duration || info.duration <= 0.35) {
        captureCurrentFrame();
      }
    };

    video.onseeked = () => {
      captureCurrentFrame();
    };

    video.src = src;
    try {
      video.load();
    } catch {
      finish(info);
    }
  });
}

/**
 * Extract dimensions, duration, and a compact WebP/JPEG poster directly from a
 * local `File` before/during upload — zero network cost.
 */
export async function extractVideoMetadataAndPoster(
  file: File,
  options: ExtractOptions = {},
): Promise<ExtractedVideoInfo> {
  if (typeof window === "undefined" || typeof URL === "undefined") {
    return {};
  }
  const maxBase64Chars = options.maxBase64Chars ?? computePosterBudget(1);
  const maxEdge = options.maxEdge ?? (maxBase64Chars < 10_000 ? 340 : 480);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const objectUrl = URL.createObjectURL(file);
  try {
    return await captureFromVideoSrc(objectUrl, {
      maxBase64Chars,
      maxEdge,
      timeoutMs,
      signal: options.signal,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function setCacheEntry(url: string, value: ExtractedVideoInfo | null) {
  if (lazyPosterCache.size >= LAZY_CACHE_MAX_ENTRIES) {
    const oldestKey = lazyPosterCache.keys().next().value;
    if (oldestKey !== undefined) {
      lazyPosterCache.delete(oldestKey);
    }
  }
  lazyPosterCache.set(url, value);
}

function drainLazyQueue() {
  while (activeLazyWorkers < LAZY_MAX_CONCURRENT && lazyQueue.length > 0) {
    const job = lazyQueue.shift()!;
    if (job.signal?.aborted) {
      job.resolve(null);
      continue;
    }

    const cached = lazyPosterCache.get(job.url);
    if (cached !== undefined) {
      job.resolve(cached);
      continue;
    }

    activeLazyWorkers++;
    const run = captureFromVideoSrc(job.url, {
      maxBase64Chars: 20_000,
      maxEdge: 420,
      timeoutMs: 6_000,
      crossOrigin: "anonymous",
      signal: job.signal,
    })
      .then((result) => {
        const hasUsefulData = Boolean(result.poster || result.duration || result.width);
        const value = hasUsefulData ? result : null;
        if (!job.signal?.aborted) {
          setCacheEntry(job.url, value);
        }
        return value;
      })
      .catch(() => null)
      .finally(() => {
        lazyInFlight.delete(job.url);
        activeLazyWorkers--;
        drainLazyQueue();
      });

    lazyInFlight.set(job.url, run);
    void run.then(job.resolve);
  }
}

/** Peek the in-memory cache synchronously to avoid flicker on re-render. */
export function getCachedLazyVideoInfo(url: string): ExtractedVideoInfo | null | undefined {
  return lazyPosterCache.get(url);
}

/**
 * Concurrency-limited lazy poster/duration fallback for legacy videos that were
 * uploaded without a stored thumbnail. Only called once visible in viewport.
 */
export function requestLazyVideoPoster(
  url: string,
  signal?: AbortSignal,
): Promise<ExtractedVideoInfo | null> {
  if (!url || typeof document === "undefined") {
    return Promise.resolve(null);
  }
  const cached = lazyPosterCache.get(url);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  const existing = lazyInFlight.get(url);
  if (existing) {
    return existing;
  }
  if (signal?.aborted) {
    return Promise.resolve(null);
  }

  return new Promise<ExtractedVideoInfo | null>((resolve) => {
    const job: QueueJob = { url, signal, resolve };
    const onAbort = () => {
      const idx = lazyQueue.indexOf(job);
      if (idx !== -1) lazyQueue.splice(idx, 1);
      resolve(null);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    lazyQueue.push({
      url,
      signal,
      resolve: (value) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      },
    });
    drainLazyQueue();
  });
}
