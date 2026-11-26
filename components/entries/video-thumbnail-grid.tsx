"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Film, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";
import {
  getCachedLazyVideoInfo,
  requestLazyVideoPoster,
  type ExtractedVideoInfo,
} from "@/lib/video-thumbnail";
import {
  formatVideoDuration,
  isSafePosterDataUrl,
  type VideoPlaylistItem,
} from "@/lib/video-utils";

interface VideoThumbnailGridProps {
  videos: VideoPlaylistItem[];
  onPlay: (index: number) => void;
  onDownload?: (video: VideoPlaylistItem, index: number) => void;
  downloadingIndex?: number | null;
  disabled?: boolean;
}

interface VideoTileProps {
  video: VideoPlaylistItem;
  index: number;
  isSingle: boolean;
  isHeroInTriple: boolean;
  overflowCount: number;
  isDownloading: boolean;
  disabled?: boolean;
  onPlay: () => void;
  onDownload?: () => void;
}

function VideoTile({
  video,
  index,
  isSingle,
  isHeroInTriple,
  overflowCount,
  isDownloading,
  disabled = false,
  onPlay,
  onDownload,
}: VideoTileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const storedPoster = isSafePosterDataUrl(video.poster) ? video.poster : undefined;
  const cachedInfo = !storedPoster && video.url ? getCachedLazyVideoInfo(video.url) : undefined;

  const [lazyInfo, setLazyInfo] = useState<ExtractedVideoInfo | null>(
    cachedInfo ?? null,
  );
  const [imgLoaded, setImgLoaded] = useState(Boolean(storedPoster || cachedInfo?.poster));
  const [imgError, setImgError] = useState(false);

  const resolvedPoster = storedPoster || lazyInfo?.poster;
  const resolvedDuration = video.duration ?? lazyInfo?.duration;
  const resolvedWidth = video.width ?? lazyInfo?.width;
  const resolvedHeight = video.height ?? lazyInfo?.height;
  const durationLabel = formatVideoDuration(resolvedDuration);

  useEffect(() => {
    setImgError(false);
    if (storedPoster) {
      setImgLoaded(true);
      return;
    }
    const cached = video.url ? getCachedLazyVideoInfo(video.url) : undefined;
    if (cached !== undefined) {
      setLazyInfo(cached);
      return;
    }
    if (disabled || !video.url || !video.url.startsWith("/api/files/")) return;

    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const controller = new AbortController();
    let requested = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (requested) return;
        if (entries.some((entry) => entry.isIntersecting)) {
          requested = true;
          observer.disconnect();
          void requestLazyVideoPoster(video.url, controller.signal).then((info) => {
            if (!controller.signal.aborted && info) {
              setLazyInfo(info);
            }
          });
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [storedPoster, video.url, disabled]);

  const singleAspectStyle = (() => {
    if (!isSingle) return undefined;
    if (resolvedWidth && resolvedHeight && resolvedWidth > 0 && resolvedHeight > 0) {
      const clamped = Math.min(1.85, Math.max(0.68, resolvedWidth / resolvedHeight));
      return { aspectRatio: `${clamped}` };
    }
    return { aspectRatio: "16 / 9" };
  })();

  const isPortraitSingle =
    isSingle &&
    Boolean(resolvedWidth && resolvedHeight && resolvedHeight > resolvedWidth * 1.1);

  return (
    <div
      ref={containerRef}
      className={`group/video relative overflow-hidden bg-zinc-950 select-none ${
        isSingle
          ? `${isPortraitSingle ? "max-w-[300px]" : "w-full max-w-lg"} max-h-[420px] rounded-2xl border border-border/70 shadow-sm`
          : `w-full ${isHeroInTriple ? "col-span-2 aspect-video" : "aspect-video"} rounded-xl border border-border/50`
      }`}
      style={singleAspectStyle}
    >
      {/* Main clickable play trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={onPlay}
        aria-label={
          overflowCount > 0
            ? `Play ${video.name || `video ${index + 1}`} and view ${overflowCount} more videos`
            : `Play video ${video.name || `${index + 1}`}`
        }
        className="relative block h-full w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-default"
      >
        {/* Poster image or sleek fallback backdrop */}
        {resolvedPoster && !imgError ? (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 bg-zinc-900 overflow-hidden">
                <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolvedPoster}
              alt={`Thumbnail for ${video.name || `video ${index + 1}`}`}
              loading="lazy"
              decoding="async"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              className={`h-full w-full object-cover transition-transform duration-300 group-hover/video:scale-[1.03] ${
                imgLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 text-white/40">
            <Film className={isSingle ? "h-10 w-10 mb-1 opacity-40" : "h-7 w-7 opacity-40"} />
          </div>
        )}

        {/* Subtle legibility gradient */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/25 transition-opacity duration-200 group-hover/video:from-black/80" />

        {/* Centered Play Button or +N overflow overlay */}
        {overflowCount > 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px] text-white transition-colors group-hover/video:bg-black/50">
            <span className="text-2xl font-bold tracking-tight tabular-nums">
              +{overflowCount}
            </span>
            <span className="mt-0.5 text-[11px] font-medium text-white/80">
              more {overflowCount === 1 ? "video" : "videos"}
            </span>
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`flex items-center justify-center rounded-full bg-black/55 text-white shadow-xl ring-1 ring-white/30 backdrop-blur-md transition-all duration-200 group-hover/video:scale-110 group-hover/video:bg-[#ff5a00] group-hover/video:ring-white/50 ${
                isSingle ? "h-14 w-14" : "h-10 w-10"
              }`}
            >
              <Play
                className={`${isSingle ? "h-6 w-6 ml-0.5" : "h-4 w-4 ml-0.5"} fill-current`}
                aria-hidden="true"
              />
            </div>
          </div>
        )}

        {/* Bottom metadata bar */}
        {overflowCount === 0 && (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 ${
              isSingle ? "px-3.5 py-2.5" : "px-2 py-1.5"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p
                className={`truncate font-medium text-white drop-shadow ${
                  isSingle ? "text-xs sm:text-[13px]" : "text-[11px]"
                }`}
              >
                {video.name}
              </p>
              {isSingle && typeof video.size === "number" && video.size > 0 && (
                <p className="text-[11px] text-white/75 tabular-nums">
                  {formatBytes(video.size)}
                </p>
              )}
            </div>
            {durationLabel && (
              <span
                className={`shrink-0 rounded-md bg-black/70 font-semibold text-white tabular-nums backdrop-blur-sm ${
                  isSingle ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[10px]"
                }`}
              >
                {durationLabel}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Top-right direct download action */}
      {onDownload && !disabled && overflowCount === 0 && (
        <div className="absolute right-2 top-2 z-10 opacity-90 transition-opacity sm:opacity-0 sm:group-hover/video:opacity-100 sm:focus-within:opacity-100">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            disabled={isDownloading}
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            aria-label={`Download ${video.name}`}
            title={isDownloading ? "Downloading…" : `Download ${video.name}`}
            className={`${
              isSingle ? "h-8 w-8" : "h-7 w-7"
            } rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-md hover:bg-black/80 hover:text-white`}
          >
            {isDownloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export function VideoThumbnailGrid({
  videos,
  onPlay,
  onDownload,
  downloadingIndex = null,
  disabled = false,
}: VideoThumbnailGridProps) {
  if (videos.length === 0) return null;

  if (videos.length === 1) {
    return (
      <VideoTile
        video={videos[0]}
        index={0}
        isSingle
        isHeroInTriple={false}
        overflowCount={0}
        isDownloading={downloadingIndex === 0}
        disabled={disabled}
        onPlay={() => onPlay(0)}
        onDownload={onDownload ? () => onDownload(videos[0], 0) : undefined}
      />
    );
  }

  const visibleVideos = videos.slice(0, 6);
  const gridClass =
    videos.length === 2 || videos.length === 3 || videos.length === 4
      ? "grid-cols-2"
      : "grid-cols-2 sm:grid-cols-3";

  return (
    <div className={`grid w-full max-w-xl gap-1.5 ${gridClass}`}>
      {visibleVideos.map((video, idx) => {
        const overflowCount =
          idx === 5 && videos.length > 6 ? videos.length - 6 : 0;
        const isHeroInTriple = videos.length === 3 && idx === 0;
        return (
          <VideoTile
            key={`${video.url || video.name}-${idx}`}
            video={video}
            index={idx}
            isSingle={false}
            isHeroInTriple={isHeroInTriple}
            overflowCount={overflowCount}
            isDownloading={downloadingIndex === idx}
            disabled={disabled}
            onPlay={() => onPlay(idx)}
            onDownload={onDownload ? () => onDownload(video, idx) : undefined}
          />
        );
      })}
    </div>
  );
}
