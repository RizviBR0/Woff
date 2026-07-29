"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GlobalVideoViewerProps {
  isOpen: boolean;
  src: string | null;
  title?: string;
  onClose: () => void;
}

export function GlobalVideoViewer({
  isOpen,
  src,
  title = "Video",
  onClose,
}: GlobalVideoViewerProps) {
  const [mounted, setMounted] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  const enterFullscreen = async () => {
    try {
      await playerRef.current?.requestFullscreen();
    } catch {
      // The fixed viewport player remains available when the browser blocks
      // the native fullscreen API.
    }
  };

  if (!mounted || !isOpen || !src) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex h-dvh w-screen items-center justify-center bg-black/95 p-3 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Viewing ${title}`}
      onClick={onClose}
    >
      <div
        ref={playerRef}
        className="relative flex h-full w-full items-center justify-center bg-black"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute right-3 top-3 z-20 flex gap-2">
          <Button
            size="icon"
            variant="secondary"
            className="rounded-full bg-white/90 text-black hover:bg-white"
            onClick={() => void enterFullscreen()}
            title="Enter fullscreen"
            aria-label="Enter fullscreen"
          >
            <Maximize className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="rounded-full bg-white/90 text-black hover:bg-white"
            onClick={onClose}
            title="Close video"
            aria-label="Close video"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <video
          src={src}
          controls
          autoPlay
          playsInline
          className="max-h-full max-w-full"
          aria-label={title}
        >
          Your browser does not support video playback.
        </video>
      </div>
    </div>,
    document.body,
  );
}
