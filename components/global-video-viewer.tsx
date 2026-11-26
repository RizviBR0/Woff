"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FastForward,
  Gauge,
  Keyboard,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Rewind,
  RotateCcw,
  RotateCw,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadFileFromUrl, triggerBlobDownload } from "@/lib/download";
import { addArchiveFiles, generateArchive } from "@/lib/archive";
import { formatBytes } from "@/lib/utils";
import {
  buildRecoveryMediaUrl,
  clampSeekTime,
  formatVideoDuration,
  isSafePosterDataUrl,
  PLAYBACK_RATES,
  resolveDoubleTapZone,
  stepPlaybackRate,
  type VideoPlaylistItem,
} from "@/lib/video-utils";

interface GlobalVideoViewerProps {
  isOpen: boolean;
  videos: VideoPlaylistItem[];
  initialIndex?: number;
  onClose: () => void;
}

const SEEK_STEP_SECONDS = 10;
const HUD_IDLE_TIMEOUT_MS = 2_800;
const DOUBLE_TAP_WINDOW_MS = 300;
const SINGLE_TAP_DELAY_MS = 230;
const MAX_URL_RECOVERY_ATTEMPTS = 2;

export function GlobalVideoViewer({
  isOpen,
  videos,
  initialIndex = 0,
  onClose,
}: GlobalVideoViewerProps) {
  const [mounted, setMounted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [recoverySrc, setRecoverySrc] = useState<{
    baseUrl: string;
    src: string;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasLoadedFrame, setHasLoadedFrame] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hoverProgress, setHoverProgress] = useState<{
    percent: number;
    time: number;
  } | null>(null);
  const [seekHud, setSeekHud] = useState<{
    side: "left" | "right";
    delta: number;
    key: number;
  } | null>(null);
  const [centerFlash, setCenterFlash] = useState<{
    kind: "play" | "pause" | "mute" | "unmute" | "rate";
    label?: string;
    key: number;
  } | null>(null);
  const [upNextCountdown, setUpNextCountdown] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubTrackRef = useRef<HTMLDivElement>(null);
  const filmstripRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const prevVolumeRef = useRef(1);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{
    time: number;
    side: "left" | "center" | "right";
    seekCount: number;
  }>({ time: 0, side: "center", seekCount: 0 });
  const recoveryRef = useRef<{
    attempts: number;
    resumeTime: number | null;
    shouldPlay: boolean;
  }>({ attempts: 0, resumeTime: null, shouldPlay: true });

  const safeIndex =
    videos.length > 0
      ? Math.min(Math.max(0, currentIndex), videos.length - 1)
      : 0;
  const currentVideo = videos[safeIndex] ?? null;
  const resolvedSrc = currentVideo
    ? recoverySrc?.baseUrl === currentVideo.url
      ? recoverySrc.src
      : currentVideo.url
    : "";
  const hasMultiple = videos.length > 1;
  const posterUrl =
    currentVideo && isSafePosterDataUrl(currentVideo.poster)
      ? currentVideo.poster
      : undefined;

  useEffect(() => {
    setMounted(true);
    setPipSupported(
      typeof document !== "undefined" &&
        Boolean(document.pictureInPictureEnabled),
    );
  }, []);

  // Sync initial index when opened
  useEffect(() => {
    if (!isOpen) return;
    const clamped =
      videos.length > 0
        ? Math.min(Math.max(0, initialIndex), videos.length - 1)
        : 0;
    setCurrentIndex(clamped);
    setSpeedMenuOpen(false);
    setShortcutsOpen(false);
    setUpNextCountdown(null);
  }, [initialIndex, isOpen, videos.length]);

  // Reset per-video playback state when switching videos
  useEffect(() => {
    if (!isOpen || !currentVideo?.url) return;
    recoveryRef.current = { attempts: 0, resumeTime: null, shouldPlay: true };
    setRecoverySrc(null);
    setIsBuffering(true);
    setHasLoadedFrame(false);
    setVideoError(false);
    setCurrentTime(0);
    setDuration(currentVideo.duration || 0);
    setBufferedEnd(0);
    setIsPlaying(false);
    setUpNextCountdown(null);
    setSpeedMenuOpen(false);
    setControlsVisible(true);

    const thumbBtn = filmstripRefs.current[safeIndex];
    thumbBtn?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [isOpen, currentVideo?.url, currentVideo?.duration, safeIndex]);

  // Clear timers & halt media downloads cleanly on close/unmount
  useEffect(() => {
    if (isOpen) return;
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        // Ignore teardown issues.
      }
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
      if (seekHudTimerRef.current) clearTimeout(seekHudTimerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    };
  }, []);

  // Keep body scroll locked while open
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Track native fullscreen changes
  useEffect(() => {
    if (!isOpen) return;
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [isOpen]);

  // Apply volume, mute, rate, and loop directly onto the active <video>
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
    video.muted = isMuted;
    video.loop = isLooping;
    try {
      video.volume = volume;
    } catch {
      // iOS Safari treats video.volume as read-only.
    }
  }, [playbackRate, volume, isMuted, isLooping, resolvedSrc]);

  // Listen to native Picture-in-Picture events cleanly (React 18 lacks typed PiP props)
  useEffect(() => {
    const video = videoRef.current;
    if (!isOpen || !video) return;
    const onEnterPiP = () => setIsPiP(true);
    const onLeavePiP = () => setIsPiP(false);
    video.addEventListener("enterpictureinpicture", onEnterPiP);
    video.addEventListener("leavepictureinpicture", onLeavePiP);
    return () => {
      video.removeEventListener("enterpictureinpicture", onEnterPiP);
      video.removeEventListener("leavepictureinpicture", onLeavePiP);
    };
  }, [isOpen, resolvedSrc, safeIndex]);

  const scheduleHudHide = useCallback(() => {
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    setControlsVisible(true);
    if (
      !isPlaying ||
      isScrubbing ||
      speedMenuOpen ||
      shortcutsOpen ||
      videoError ||
      upNextCountdown !== null
    ) {
      return;
    }
    hudTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, HUD_IDLE_TIMEOUT_MS);
  }, [
    isPlaying,
    isScrubbing,
    speedMenuOpen,
    shortcutsOpen,
    videoError,
    upNextCountdown,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    scheduleHudHide();
  }, [isOpen, scheduleHudHide]);

  const triggerCenterFlash = useCallback(
    (
      kind: "play" | "pause" | "mute" | "unmute" | "rate",
      label?: string,
    ) => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      setCenterFlash({ kind, label, key: Date.now() });
      flashTimerRef.current = setTimeout(() => setCenterFlash(null), 600);
    },
    [],
  );

  const triggerSeekHud = useCallback(
    (side: "left" | "right", totalDelta: number) => {
      if (seekHudTimerRef.current) clearTimeout(seekHudTimerRef.current);
      setSeekHud({ side, delta: totalDelta, key: Date.now() });
      seekHudTimerRef.current = setTimeout(() => {
        setSeekHud(null);
        lastTapRef.current = { time: 0, side: "center", seekCount: 0 };
      }, 720);
    },
    [],
  );

  const togglePlayPause = useCallback(
    (showFlash = false) => {
      const video = videoRef.current;
      if (!video || videoError) return;
      setUpNextCountdown(null);
      if (video.paused || video.ended) {
        if (video.ended) {
          video.currentTime = 0;
        }
        void video.play().catch(() => undefined);
        if (showFlash) triggerCenterFlash("play");
      } else {
        video.pause();
        if (showFlash) triggerCenterFlash("pause");
      }
      scheduleHudHide();
    },
    [scheduleHudHide, triggerCenterFlash, videoError],
  );

  const seekTo = useCallback(
    (targetSeconds: number) => {
      const video = videoRef.current;
      if (!video) return;
      const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : duration;
      const clamped = clampSeekTime(targetSeconds, total);
      video.currentTime = clamped;
      setCurrentTime(clamped);
      setUpNextCountdown(null);
    },
    [duration],
  );

  const seekBy = useCallback(
    (deltaSeconds: number, showVisualHud = true) => {
      const video = videoRef.current;
      if (!video) return;
      const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : duration;
      const clamped = clampSeekTime(video.currentTime + deltaSeconds, total);
      video.currentTime = clamped;
      setCurrentTime(clamped);
      setUpNextCountdown(null);
      if (showVisualHud) {
        triggerSeekHud(deltaSeconds < 0 ? "left" : "right", Math.abs(deltaSeconds));
      }
      scheduleHudHide();
    },
    [duration, scheduleHudHide, triggerSeekHud],
  );

  const toggleMute = useCallback(
    (showFlash = false) => {
      setIsMuted((prev) => {
        const nextMuted = !prev;
        if (!nextMuted && volume === 0) {
          setVolume(prevVolumeRef.current || 0.8);
        }
        if (showFlash) triggerCenterFlash(nextMuted ? "mute" : "unmute");
        return nextMuted;
      });
      scheduleHudHide();
    },
    [scheduleHudHide, triggerCenterFlash, volume],
  );

  const adjustVolume = useCallback(
    (nextVolume: number) => {
      const clamped = Math.min(1, Math.max(0, Math.round(nextVolume * 100) / 100));
      setVolume(clamped);
      if (clamped > 0) {
        prevVolumeRef.current = clamped;
        setIsMuted(false);
      } else {
        setIsMuted(true);
      }
      scheduleHudHide();
    },
    [scheduleHudHide],
  );

  const changePlaybackRate = useCallback(
    (rate: number, showFlash = false) => {
      setPlaybackRate(rate);
      setSpeedMenuOpen(false);
      if (showFlash) triggerCenterFlash("rate", `${rate}×`);
      scheduleHudHide();
    },
    [scheduleHudHide, triggerCenterFlash],
  );

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const container = playerRef.current;
      if (container?.requestFullscreen) {
        await container.requestFullscreen();
        return;
      }
      const video = videoRef.current as
        | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
        | null;
      if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    } catch {
      // Browser declined fullscreen; fixed theater modal remains active.
    }
  }, []);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      toast.error("Picture-in-Picture is unavailable for this video");
    }
  }, []);

  const goToIndex = useCallback(
    (nextIndex: number) => {
      if (videos.length === 0) return;
      const wrapped =
        ((nextIndex % videos.length) + videos.length) % videos.length;
      setUpNextCountdown(null);
      setCurrentIndex(wrapped);
    },
    [videos.length],
  );

  const goToPrevious = useCallback(() => {
    if (videos.length <= 1) return;
    goToIndex(safeIndex - 1);
  }, [goToIndex, safeIndex, videos.length]);

  const goToNext = useCallback(() => {
    if (videos.length <= 1) return;
    goToIndex(safeIndex + 1);
  }, [goToIndex, safeIndex, videos.length]);

  const handleClose = useCallback(() => {
    if (document.fullscreenElement === playerRef.current) {
      void document.exitFullscreen().catch(() => undefined);
    }
    onClose();
  }, [onClose]);

  // Auto-advance countdown for multi-video messages
  useEffect(() => {
    if (upNextCountdown === null) return;
    if (upNextCountdown <= 0) {
      setUpNextCountdown(null);
      goToNext();
      return;
    }
    const timer = setTimeout(() => {
      setUpNextCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [upNextCountdown, goToNext]);

  // Full keyboard shortcut suite
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key;

      if (key === "Escape") {
        if (shortcutsOpen) {
          event.preventDefault();
          setShortcutsOpen(false);
          return;
        }
        if (speedMenuOpen) {
          event.preventDefault();
          setSpeedMenuOpen(false);
          return;
        }
        if (!document.fullscreenElement) {
          event.preventDefault();
          handleClose();
        }
        return;
      }

      if (key === " " || key === "k" || key === "K") {
        event.preventDefault();
        togglePlayPause(true);
        return;
      }
      if (key === "j" || key === "J") {
        event.preventDefault();
        seekBy(-SEEK_STEP_SECONDS, true);
        return;
      }
      if (key === "l" || key === "L") {
        event.preventDefault();
        seekBy(SEEK_STEP_SECONDS, true);
        return;
      }
      if (key === "ArrowLeft") {
        event.preventDefault();
        if (event.shiftKey && hasMultiple) {
          goToPrevious();
        } else {
          seekBy(-SEEK_STEP_SECONDS, true);
        }
        return;
      }
      if (key === "ArrowRight") {
        event.preventDefault();
        if (event.shiftKey && hasMultiple) {
          goToNext();
        } else {
          seekBy(SEEK_STEP_SECONDS, true);
        }
        return;
      }
      if (key === "[") {
        if (hasMultiple) {
          event.preventDefault();
          goToPrevious();
        }
        return;
      }
      if (key === "]") {
        if (hasMultiple) {
          event.preventDefault();
          goToNext();
        }
        return;
      }
      if (key === "ArrowUp") {
        event.preventDefault();
        adjustVolume((isMuted ? 0 : volume) + 0.1);
        return;
      }
      if (key === "ArrowDown") {
        event.preventDefault();
        adjustVolume((isMuted ? 0 : volume) - 0.1);
        return;
      }
      if (key === "m" || key === "M") {
        event.preventDefault();
        toggleMute(true);
        return;
      }
      if (key === "f" || key === "F") {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (key === "p" || key === "P") {
        if (pipSupported) {
          event.preventDefault();
          void togglePiP();
        }
        return;
      }
      if (key === "<") {
        event.preventDefault();
        const next = stepPlaybackRate(playbackRate, -1);
        changePlaybackRate(next, true);
        return;
      }
      if (key === ">") {
        event.preventDefault();
        const next = stepPlaybackRate(playbackRate, 1);
        changePlaybackRate(next, true);
        return;
      }
      if ((key === "," || key === ".") && !event.shiftKey) {
        const video = videoRef.current;
        if (video && video.paused) {
          event.preventDefault();
          seekTo(video.currentTime + (key === "." ? 1 / 30 : -1 / 30));
        }
        return;
      }
      if (key === "?") {
        event.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }
      if (/^[0-9]$/.test(key) && duration > 0) {
        event.preventDefault();
        seekTo((Number(key) / 10) * duration);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    isOpen,
    shortcutsOpen,
    speedMenuOpen,
    handleClose,
    togglePlayPause,
    seekBy,
    hasMultiple,
    goToPrevious,
    goToNext,
    adjustVolume,
    isMuted,
    volume,
    toggleMute,
    toggleFullscreen,
    pipSupported,
    togglePiP,
    playbackRate,
    changePlaybackRate,
    seekTo,
    duration,
  ]);

  // Gesture stage: handles single tap, double-tap left/right ±10s with accumulation,
  // and center double-click fullscreen.
  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const down = pointerDownRef.current;
    pointerDownRef.current = null;
    if (down) {
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (
        e.pointerType === "touch" &&
        hasMultiple &&
        Math.abs(dx) > 70 &&
        Math.abs(dx) > Math.abs(dy) * 1.8
      ) {
        if (dx < 0) goToNext();
        else goToPrevious();
        return;
      }
      if (Math.hypot(dx, dy) > 14) {
        return;
      }
    }

    if (speedMenuOpen) {
      setSpeedMenuOpen(false);
      return;
    }
    if (shortcutsOpen) {
      setShortcutsOpen(false);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const zone = resolveDoubleTapZone(e.clientX - rect.left, rect.width);
    const now = Date.now();
    const isRapidRepeat =
      now - lastTapRef.current.time < DOUBLE_TAP_WINDOW_MS &&
      lastTapRef.current.side === zone;

    if (isRapidRepeat) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      if (zone === "left" || zone === "right") {
        const nextSeekCount = lastTapRef.current.seekCount + 1;
        lastTapRef.current = { time: now, side: zone, seekCount: nextSeekCount };
        const step = zone === "left" ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS;
        seekBy(step, false);
        triggerSeekHud(zone, nextSeekCount * SEEK_STEP_SECONDS);
      } else {
        lastTapRef.current = { time: 0, side: "center", seekCount: 0 };
        void toggleFullscreen();
      }
      return;
    }

    lastTapRef.current = { time: now, side: zone, seekCount: 0 };
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);

    const isTouch = e.pointerType === "touch";
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      if (isTouch) {
        if (!controlsVisible) {
          scheduleHudHide();
        } else if (isPlaying) {
          if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
          setControlsVisible(false);
        } else {
          togglePlayPause(true);
        }
      } else {
        togglePlayPause(true);
      }
    }, SINGLE_TAP_DELAY_MS);
  };

  // Pointer scrubbing on progress track
  const computeTrackTime = (clientX: number) => {
    const track = scrubTrackRef.current;
    if (!track || duration <= 0) return { percent: 0, time: 0 };
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    return { percent: ratio * 100, time: ratio * duration };
  };

  const handleScrubPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsScrubbing(true);
    const { percent, time } = computeTrackTime(e.clientX);
    setHoverProgress({ percent, time });
    seekTo(time);
  };

  const handleScrubPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { percent, time } = computeTrackTime(e.clientX);
    setHoverProgress({ percent, time });
    if (isScrubbing) {
      seekTo(time);
    }
  };

  const handleScrubPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsScrubbing(false);
    scheduleHudHide();
  };

  // Download single video or ZIP all videos
  const handleDownloadCurrent = async () => {
    if (!currentVideo || isDownloading) return;
    setIsDownloading(true);
    const toastId = toast.loading(`Preparing "${currentVideo.name}" for download…`);
    try {
      await downloadFileFromUrl(currentVideo.url, currentVideo.name || "video.mp4");
      toast.success("Download started", { id: toastId });
    } catch {
      toast.error("Failed to download video", { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadAllZip = async () => {
    if (videos.length < 2 || isZipping) return;
    setIsZipping(true);
    const controller = new AbortController();
    const cancelAction = { label: "Cancel", onClick: () => controller.abort() };
    const toastId = toast.loading(
      `Preparing ZIP archive for ${videos.length} videos…`,
      { action: cancelAction },
    );
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      await addArchiveFiles(
        zip,
        videos.map((v, idx) => ({
          url: v.url,
          name: v.name || `video-${idx + 1}.mp4`,
        })),
        {
          signal: controller.signal,
          onProgress: (done, total) =>
            toast.loading(`Preparing ZIP: ${done}/${total} videos`, {
              id: toastId,
              action: cancelAction,
            }),
        },
      );
      const blob = await generateArchive(zip, { signal: controller.signal });
      triggerBlobDownload(blob, `videos-${Date.now()}.zip`);
      toast.success("ZIP download started", { id: toastId });
    } catch (err) {
      if (controller.signal.aborted) {
        toast.message("ZIP cancelled", { id: toastId });
      } else {
        toast.error(
          err instanceof Error ? err.message : "Failed to create ZIP archive",
          { id: toastId },
        );
      }
    } finally {
      setIsZipping(false);
    }
  };

  // Manual retry on error
  const handleManualRetry = () => {
    if (!currentVideo) return;
    const nextAttempt = recoveryRef.current.attempts + 1;
    recoveryRef.current = {
      attempts: nextAttempt,
      resumeTime: currentTime > 0 ? currentTime : null,
      shouldPlay: true,
    };
    setVideoError(false);
    setIsBuffering(true);
    setRecoverySrc({
      baseUrl: currentVideo.url,
      src: buildRecoveryMediaUrl(currentVideo.url, nextAttempt),
    });
  };

  const playedPercent = useMemo(() => {
    if (!duration || !Number.isFinite(duration)) return 0;
    return Math.min(100, Math.max(0, (currentTime / duration) * 100));
  }, [currentTime, duration]);

  const bufferedPercent = useMemo(() => {
    if (!duration || !Number.isFinite(duration)) return 0;
    return Math.min(100, Math.max(0, (bufferedEnd / duration) * 100));
  }, [bufferedEnd, duration]);

  if (!mounted || !isOpen || !currentVideo) return null;

  const nextVideo =
    hasMultiple && safeIndex < videos.length - 1 ? videos[safeIndex + 1] : null;
  const hideCursor = isPlaying && !controlsVisible && !videoError;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex h-dvh w-screen items-center justify-center bg-black/95 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`Video player: ${currentVideo.name} (${safeIndex + 1} of ${videos.length})`}
      onClick={handleClose}
    >
      <div
        ref={playerRef}
        className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-black ${
          hideCursor ? "cursor-none" : ""
        }`}
        onClick={(e) => e.stopPropagation()}
        onPointerMove={() => {
          if (!isScrubbing) scheduleHudHide();
        }}
      >
        {/* Top bar */}
        <div
          className={`absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 bg-gradient-to-b from-black/85 via-black/45 to-transparent px-4 pb-8 pt-3.5 sm:px-6 transition-opacity duration-200 ${
            controlsVisible || videoError
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white sm:text-[15px]">
                {currentVideo.name}
              </p>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-white/65 tabular-nums">
                {hasMultiple && (
                  <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    {safeIndex + 1} / {videos.length}
                  </span>
                )}
                {typeof currentVideo.size === "number" && currentVideo.size > 0 && (
                  <span>{formatBytes(currentVideo.size)}</span>
                )}
                {playbackRate !== 1 && (
                  <span className="rounded-md bg-[#ff5a00]/25 px-1.5 py-0.5 text-[11px] font-semibold text-orange-300">
                    {playbackRate}×
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {hasMultiple && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isZipping}
                onClick={() => void handleDownloadAllZip()}
                className="inline-flex h-9 rounded-full border border-white/15 bg-white/10 px-2.5 sm:px-3.5 text-xs font-medium text-white backdrop-blur-md hover:bg-white/20"
              >
                {isZipping ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1.5" />
                ) : (
                  <Download className="h-3.5 w-3.5 sm:mr-1.5" />
                )}
                <span className="hidden sm:inline">
                  {isZipping ? "Zipping…" : "All (.zip)"}
                </span>
                <span className="ml-1 sm:hidden">
                  {isZipping ? "…" : "ZIP"}
                </span>
              </Button>
            )}

            <Button
              type="button"
              size="icon"
              variant="secondary"
              disabled={isDownloading}
              onClick={() => void handleDownloadCurrent()}
              title={isDownloading ? "Downloading…" : "Download video"}
              aria-label="Download video"
              className="h-9 w-9 rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-md hover:bg-white/20"
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>

            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={() => setShortcutsOpen((prev) => !prev)}
              title="Keyboard shortcuts (?)"
              aria-label="Keyboard shortcuts"
              className={`hidden h-9 w-9 rounded-full border border-white/15 backdrop-blur-md sm:inline-flex ${
                shortcutsOpen
                  ? "bg-white text-black hover:bg-white/90"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              <Keyboard className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={handleClose}
              title="Close (Esc)"
              aria-label="Close video player"
              className="h-9 w-9 rounded-full border border-white/15 bg-white/15 text-white backdrop-blur-md hover:bg-white/25"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main Video Stage */}
        <div className="relative flex h-full w-full flex-1 items-center justify-center overflow-hidden">
          {/* Instant poster backdrop while first frame loads */}
          {posterUrl && !hasLoadedFrame && !videoError && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={posterUrl}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute max-h-full max-w-full object-contain opacity-65 blur-[1px]"
            />
          )}

          {videoError ? (
            <div className="z-20 mx-4 flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-white/15 bg-zinc-900/90 p-7 text-center text-white shadow-2xl backdrop-blur-md">
              <p className="text-sm font-semibold">Unable to play video</p>
              <p className="text-xs leading-relaxed text-white/70">
                Your browser could not decode this video format or the stream
                timed out. You can retry or download the original file.
              </p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleManualRetry}
                  className="bg-[#ff5a00] text-xs text-white hover:bg-[#e55000]"
                >
                  Retry
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                  onClick={() => void handleDownloadCurrent()}
                >
                  Download video
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-white/80 hover:bg-white/10 hover:text-white"
                  onClick={() =>
                    window.open(currentVideo.url, "_blank", "noopener,noreferrer")
                  }
                >
                  Open in tab
                </Button>
              </div>
            </div>
          ) : (
            <video
              ref={videoRef}
              key={`${safeIndex}-${resolvedSrc}`}
              src={resolvedSrc}
              poster={posterUrl}
              autoPlay
              playsInline
              preload="auto"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (Number.isFinite(v.duration) && v.duration > 0) {
                  setDuration(v.duration);
                }
                v.playbackRate = playbackRate;
                v.muted = isMuted;
                v.loop = isLooping;
                try {
                  v.volume = volume;
                } catch {
                  // Read-only on iOS Safari.
                }
                const pendingResume = recoveryRef.current.resumeTime;
                if (pendingResume !== null) {
                  recoveryRef.current.resumeTime = null;
                  const target = clampSeekTime(pendingResume, v.duration || duration);
                  v.currentTime = target;
                  setCurrentTime(target);
                  if (recoveryRef.current.shouldPlay) {
                    void v.play().catch(() => undefined);
                  }
                }
              }}
              onLoadedData={() => {
                setHasLoadedFrame(true);
                setIsBuffering(false);
              }}
              onCanPlay={() => {
                setHasLoadedFrame(true);
                setIsBuffering(false);
              }}
              onWaiting={() => setIsBuffering(true)}
              onPlaying={() => {
                setIsBuffering(false);
                setIsPlaying(true);
                setHasLoadedFrame(true);
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(e) => {
                if (isScrubbing) return;
                setCurrentTime(e.currentTarget.currentTime);
              }}
              onProgress={(e) => {
                const v = e.currentTarget;
                if (v.buffered.length > 0) {
                  const now = v.currentTime;
                  let end = v.buffered.end(v.buffered.length - 1);
                  for (let i = 0; i < v.buffered.length; i++) {
                    if (v.buffered.start(i) <= now + 0.5 && v.buffered.end(i) >= now) {
                      end = v.buffered.end(i);
                      break;
                    }
                  }
                  setBufferedEnd(end);
                }
              }}
              onEnded={() => {
                setIsPlaying(false);
                setControlsVisible(true);
                if (!isLooping && nextVideo) {
                  setUpNextCountdown(3);
                }
              }}
              onError={(e) => {
                const v = e.currentTarget;
                const canRecover =
                  currentVideo.url.startsWith("/api/files/") &&
                  recoveryRef.current.attempts < MAX_URL_RECOVERY_ATTEMPTS &&
                  (hasLoadedFrame || v.currentTime > 0 || v.error?.code === 2);

                if (canRecover) {
                  const nextAttempt = recoveryRef.current.attempts + 1;
                  recoveryRef.current = {
                    attempts: nextAttempt,
                    resumeTime: v.currentTime > 0 ? v.currentTime : currentTime,
                    shouldPlay: isPlaying || !v.paused,
                  };
                  setIsBuffering(true);
                  setRecoverySrc({
                    baseUrl: currentVideo.url,
                    src: buildRecoveryMediaUrl(currentVideo.url, nextAttempt),
                  });
                  return;
                }

                setIsBuffering(false);
                setVideoError(true);
              }}
              className="max-h-full max-w-full object-contain select-none"
              aria-label={currentVideo.name}
            />
          )}

          {/* Gesture Capture Layer (Double-tap left/right ±10s, single tap play/HUD) */}
          {!videoError && (
            <div
              className="absolute inset-0 z-10 touch-manipulation"
              onPointerDown={handleStagePointerDown}
              onPointerUp={handleStagePointerUp}
            />
          )}

          {/* Double-Tap Seek HUD Arcs */}
          {seekHud && (
            <div
              key={seekHud.key}
              className={`pointer-events-none absolute inset-y-0 z-20 flex w-[42%] max-w-[320px] items-center justify-center animate-in fade-in duration-150 ${
                seekHud.side === "left"
                  ? "left-0 rounded-r-[999px] bg-gradient-to-r from-white/15 to-white/5"
                  : "right-0 rounded-l-[999px] bg-gradient-to-l from-white/15 to-white/5"
              }`}
            >
              <div className="flex flex-col items-center gap-1.5 text-white drop-shadow-lg">
                {seekHud.side === "left" ? (
                  <Rewind className="h-8 w-8 fill-white/90 text-white" />
                ) : (
                  <FastForward className="h-8 w-8 fill-white/90 text-white" />
                )}
                <span className="text-sm font-bold tracking-tight tabular-nums">
                  {seekHud.side === "left" ? `-${seekHud.delta}s` : `+${seekHud.delta}s`}
                </span>
              </div>
            </div>
          )}

          {/* Buffering Spinner */}
          {isBuffering && !videoError && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-black/60 shadow-2xl backdrop-blur-md">
                <Loader2 className="h-7 w-7 animate-spin text-[#ff5a00]" />
              </div>
            </div>
          )}

          {/* Paused Center Play Button (overlaid so pausing never shifts the video) */}
          {!isPlaying && !isBuffering && !videoError && upNextCountdown === null && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlayPause(false);
                }}
                aria-label="Play video"
                className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/30 bg-black/60 text-white shadow-2xl backdrop-blur-md transition-transform hover:scale-110 hover:bg-[#ff5a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <Play className="ml-0.5 h-7 w-7 fill-current" />
              </button>
            </div>
          )}

          {/* Transient Action Flash (Play/Pause/Mute/Rate) */}
          {centerFlash && !seekHud && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <div
                key={centerFlash.key}
                className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-sm font-semibold text-white shadow-2xl backdrop-blur-md animate-in zoom-in-90 fade-in duration-150"
              >
                {centerFlash.kind === "play" && <Play className="h-4 w-4 fill-current" />}
                {centerFlash.kind === "pause" && <Pause className="h-4 w-4 fill-current" />}
                {centerFlash.kind === "mute" && <VolumeX className="h-4 w-4" />}
                {centerFlash.kind === "unmute" && <Volume2 className="h-4 w-4" />}
                {centerFlash.kind === "rate" && <Gauge className="h-4 w-4 text-[#ff5a00]" />}
                {centerFlash.label && (
                  <span className="tabular-nums">{centerFlash.label}</span>
                )}
              </div>
            </div>
          )}

          {/* Up Next Auto-Advance Pill for multi-video messages */}
          {upNextCountdown !== null && nextVideo && (
            <div className="pointer-events-none absolute inset-x-0 bottom-28 z-30 flex justify-center px-4">
              <div
                className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/15 bg-zinc-950/90 px-4 py-3 text-white shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="min-w-0 max-w-[200px] sm:max-w-[260px]">
                  <p className="text-[11px] font-medium text-white/65 tabular-nums">
                    Up next in {upNextCountdown}s
                  </p>
                  <p className="truncate text-xs font-semibold text-white">
                    {nextVideo.name}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={goToNext}
                  className="h-8 rounded-lg bg-[#ff5a00] px-3 text-xs font-semibold text-white hover:bg-[#e55000]"
                >
                  Play now
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setUpNextCountdown(null)}
                  className="h-8 rounded-lg px-2 text-xs text-white/75 hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Multi-video Prev / Next Edge Arrows */}
          {hasMultiple && (
            <>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  goToPrevious();
                }}
                aria-label="Previous video"
                title="Previous video (Shift+←)"
                className={`absolute left-3 top-1/2 z-30 h-11 w-11 -translate-y-1/2 rounded-full border border-white/15 bg-black/55 text-white shadow-xl backdrop-blur-md transition-all hover:scale-105 hover:bg-black/80 sm:left-5 ${
                  controlsVisible
                    ? "opacity-100"
                    : "pointer-events-none opacity-0"
                }`}
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  goToNext();
                }}
                aria-label="Next video"
                title="Next video (Shift+→)"
                className={`absolute right-3 top-1/2 z-30 h-11 w-11 -translate-y-1/2 rounded-full border border-white/15 bg-black/55 text-white shadow-xl backdrop-blur-md transition-all hover:scale-105 hover:bg-black/80 sm:right-5 ${
                  controlsVisible
                    ? "opacity-100"
                    : "pointer-events-none opacity-0"
                }`}
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </>
          )}

          {/* Keyboard Shortcuts Reference Overlay */}
          {shortcutsOpen && (
            <div
              className="absolute right-4 top-16 z-40 w-72 rounded-2xl border border-white/15 bg-zinc-950/95 p-4 text-xs text-white shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2.5 flex items-center justify-between">
                <span className="font-semibold text-white">Shortcuts</span>
                <button
                  type="button"
                  onClick={() => setShortcutsOpen(false)}
                  className="rounded p-0.5 text-white/60 hover:bg-white/10 hover:text-white"
                  aria-label="Close shortcuts"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <dl className="space-y-1.5 text-white/80">
                {[
                  ["Play / Pause", "Space / K"],
                  ["Skip ±10s", "J / L or ← / →"],
                  ["Double-tap sides", "Skip ±10s"],
                  ["Speed", "< / >"],
                  ["Volume / Mute", "↑ / ↓ / M"],
                  ["Fullscreen / PiP", "F / P"],
                  ["Frame step (paused)", ", / ."],
                  ["Jump to 0%–90%", "0 – 9"],
                  ...(hasMultiple ? [["Prev / Next video", "[ / ]"]] : []),
                ].map(([label, keys]) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <dt className="text-white/65">{label}</dt>
                    <dd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">
                      {keys}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>

        {/* Bottom Controls Dock */}
        <div
          className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-3 pb-3 pt-10 pb-safe sm:px-6 sm:pb-5 transition-opacity duration-200 ${
            controlsVisible || isScrubbing || speedMenuOpen
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Custom Progress / Scrub Track */}
          <div className="relative mb-2 flex items-center">
            <div
              ref={scrubTrackRef}
              role="slider"
              tabIndex={0}
              aria-label="Seek video timeline"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(currentTime)}
              aria-valuetext={`${formatVideoDuration(currentTime) || "0:00"} of ${formatVideoDuration(duration) || "0:00"}`}
              onPointerDown={handleScrubPointerDown}
              onPointerMove={handleScrubPointerMove}
              onPointerUp={handleScrubPointerUp}
              onPointerCancel={handleScrubPointerUp}
              onPointerLeave={() => {
                if (!isScrubbing) setHoverProgress(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  seekBy(-5, false);
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  seekBy(5, false);
                }
              }}
              className="group/scrub relative flex h-6 w-full cursor-pointer items-center touch-none focus-visible:outline-none"
            >
              {/* Hover / scrub time bubble */}
              {hoverProgress && duration > 0 && (
                <div
                  className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md border border-white/15 bg-black/90 px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums shadow-lg"
                  style={{
                    left: `${Math.min(96, Math.max(4, hoverProgress.percent))}%`,
                  }}
                >
                  {formatVideoDuration(hoverProgress.time) || "0:00"}
                </div>
              )}

              {/* Background rail */}
              <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-all group-hover/scrub:h-1.5">
                {/* Buffered range */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-white/35 transition-[width] duration-150"
                  style={{ width: `${bufferedPercent}%` }}
                />
                {/* Played fill */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-[#ff5a00]"
                  style={{ width: `${playedPercent}%` }}
                />
              </div>

              {/* Scrubber thumb */}
              <div
                className={`pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff5a00] ring-2 ring-white shadow-md transition-transform ${
                  isScrubbing
                    ? "scale-125 opacity-100"
                    : "scale-75 opacity-0 group-hover/scrub:scale-100 group-hover/scrub:opacity-100"
                }`}
                style={{ left: `${playedPercent}%` }}
              />
            </div>
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between gap-2 text-white">
            {/* Left controls: Play, ±10s, Volume, Time */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              <button
                type="button"
                onClick={() => togglePlayPause(false)}
                aria-label={isPlaying ? "Pause" : "Play"}
                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 fill-current" />
                ) : (
                  <Play className="ml-0.5 h-5 w-5 fill-current" />
                )}
              </button>

              <button
                type="button"
                onClick={() => seekBy(-SEEK_STEP_SECONDS, true)}
                aria-label="Skip back 10 seconds"
                title="Back 10s (J)"
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="pointer-events-none absolute text-[8px] font-bold tabular-nums">
                  10
                </span>
              </button>

              <button
                type="button"
                onClick={() => seekBy(SEEK_STEP_SECONDS, true)}
                aria-label="Skip forward 10 seconds"
                title="Forward 10s (L)"
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <RotateCw className="h-4 w-4" />
                <span className="pointer-events-none absolute text-[8px] font-bold tabular-nums">
                  10
                </span>
              </button>

              {/* Volume cluster */}
              <div className="group/vol flex items-center">
                <button
                  type="button"
                  onClick={() => toggleMute(false)}
                  aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
                  title={isMuted || volume === 0 ? "Unmute (M)" : "Mute (M)"}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-[18px] w-[18px]" />
                  ) : volume < 0.5 ? (
                    <Volume1 className="h-[18px] w-[18px]" />
                  ) : (
                    <Volume2 className="h-[18px] w-[18px]" />
                  )}
                </button>

                <div className="hidden w-0 overflow-hidden transition-all duration-200 group-hover/vol:ml-1 group-hover/vol:w-20 group-focus-within/vol:ml-1 group-focus-within/vol:w-20 sm:flex sm:items-center">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => adjustVolume(Number(e.target.value))}
                    aria-label="Volume"
                    className="h-1 w-20 cursor-pointer accent-[#ff5a00]"
                  />
                </div>
              </div>

              {/* Time display */}
              <div className="ml-1 text-xs font-medium text-white/90 tabular-nums select-none">
                <span>{formatVideoDuration(currentTime) || "0:00"}</span>
                <span className="mx-1 text-white/45">/</span>
                <span className="text-white/65">
                  {formatVideoDuration(duration) || "0:00"}
                </span>
              </div>
            </div>

            {/* Right controls: Speed, Loop, PiP, Fullscreen */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              {/* Inline Playback Speed Menu (stays inside playerRef so it works in native Fullscreen!) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSpeedMenuOpen((prev) => !prev)}
                  aria-label="Playback speed"
                  aria-expanded={speedMenuOpen}
                  title="Playback speed (< / >)"
                  className={`flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-semibold tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                    playbackRate !== 1 || speedMenuOpen
                      ? "bg-[#ff5a00]/25 text-orange-300 hover:bg-[#ff5a00]/35"
                      : "text-white/90 hover:bg-white/15 hover:text-white"
                  }`}
                >
                  <span>{playbackRate}×</span>
                </button>

                {speedMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Choose playback speed"
                    className="absolute bottom-12 right-0 z-50 w-32 rounded-xl border border-white/15 bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
                  >
                    <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                      Speed
                    </p>
                    {PLAYBACK_RATES.map((rate) => {
                      const active = rate === playbackRate;
                      return (
                        <button
                          key={rate}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => changePlaybackRate(rate, true)}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium tabular-nums transition ${
                            active
                              ? "bg-[#ff5a00] text-white"
                              : "text-white/85 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <span>{rate === 1 ? "Normal (1×)" : `${rate}×`}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsLooping((prev) => !prev);
                  scheduleHudHide();
                }}
                aria-label={isLooping ? "Disable loop" : "Loop video"}
                aria-pressed={isLooping}
                title={isLooping ? "Loop on" : "Loop off"}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                  isLooping
                    ? "bg-[#ff5a00]/25 text-orange-300 hover:bg-[#ff5a00]/35"
                    : "text-white/85 hover:bg-white/15 hover:text-white"
                }`}
              >
                <Repeat className="h-4 w-4" />
              </button>

              {pipSupported && (
                <button
                  type="button"
                  onClick={() => void togglePiP()}
                  aria-label={
                    isPiP ? "Exit Picture-in-Picture" : "Picture-in-Picture"
                  }
                  title="Picture-in-Picture (P)"
                  className={`hidden h-9 w-9 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 sm:flex ${
                    isPiP
                      ? "bg-[#ff5a00]/25 text-orange-300"
                      : "text-white/85 hover:bg-white/15 hover:text-white"
                  }`}
                >
                  <PictureInPicture2 className="h-4 w-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                aria-label={
                  isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
                }
                title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                {isFullscreen ? (
                  <Minimize className="h-4 w-4" />
                ) : (
                  <Maximize className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Multi-Video Filmstrip Switcher */}
          {hasMultiple && (
            <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 hover-scrollbar">
              {videos.map((vid, idx) => {
                const isActive = idx === safeIndex;
                const thumb = isSafePosterDataUrl(vid.poster)
                  ? vid.poster
                  : undefined;
                const dur = formatVideoDuration(vid.duration);
                return (
                  <button
                    key={`${vid.url}-${idx}`}
                    ref={(el) => {
                      filmstripRefs.current[idx] = el;
                    }}
                    type="button"
                    onClick={() => goToIndex(idx)}
                    aria-label={`Watch video ${idx + 1}: ${vid.name}`}
                    aria-current={isActive ? "true" : undefined}
                    className={`relative h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-900 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                      isActive
                        ? "ring-2 ring-[#ff5a00] opacity-100 scale-[1.03]"
                        : "ring-1 ring-white/15 opacity-60 hover:opacity-95"
                    }`}
                  >
                    {thumb ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={thumb}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-white/60">
                        #{idx + 1}
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[9px] font-semibold text-white tabular-nums">
                      {dur || `${idx + 1}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
