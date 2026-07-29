"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Eraser,
  Loader2,
  Minus,
  Pen,
  Plus,
  Redo2,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface ImageMarkupEditorProps {
  imageUrl: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSend: (blob: Blob) => Promise<void>;
}

type Point = { x: number; y: number };
type Stroke = {
  points: Point[];
  color: string;
  size: number;
  mode: "pen" | "eraser";
};

const COLORS = [
  "#111827",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
  "#ffffff",
];

function paintStrokes(
  context: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
  sizeScale = 1,
) {
  context.lineCap = "round";
  context.lineJoin = "round";
  strokes.forEach((stroke) => {
    if (!stroke.points.length) return;
    context.globalCompositeOperation =
      stroke.mode === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = stroke.color;
    context.fillStyle = stroke.color;
    context.lineWidth = stroke.size * sizeScale;
    if (stroke.points.length === 1) {
      context.beginPath();
      context.arc(
        stroke.points[0].x * width,
        stroke.points[0].y * height,
        (stroke.size * sizeScale) / 2,
        0,
        Math.PI * 2,
      );
      context.fill();
      return;
    }
    context.beginPath();
    context.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);
    for (let index = 1; index < stroke.points.length; index += 1) {
      const previous = stroke.points[index - 1];
      const point = stroke.points[index];
      context.quadraticCurveTo(
        previous.x * width,
        previous.y * height,
        ((previous.x + point.x) / 2) * width,
        ((previous.y + point.y) / 2) * height,
      );
    }
    context.stroke();
  });
  context.globalCompositeOperation = "source-over";
}

export function ImageMarkupEditor({
  imageUrl,
  isOpen,
  onClose,
  onSend,
}: ImageMarkupEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activePointerRef = useRef<number | null>(null);
  const renderSizeRef = useRef({ width: 1, height: 1, dpr: 1 });
  const frameRef = useRef<number | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [color, setColor] = useState("#ef4444");
  const [size, setSize] = useState(5);
  const [eraser, setEraser] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  const render = useCallback(() => {
    frameRef.current = null;
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const { width, height, dpr } = renderSizeRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const overlay =
      overlayCanvasRef.current || document.createElement("canvas");
    overlayCanvasRef.current = overlay;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (overlay.width !== pixelWidth) overlay.width = pixelWidth;
    if (overlay.height !== pixelHeight) overlay.height = pixelHeight;
    const overlayContext = overlay.getContext("2d");
    if (!overlayContext) return;
    overlayContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    overlayContext.clearRect(0, 0, width, height);
    paintStrokes(
      overlayContext,
      currentStrokeRef.current
        ? [...strokesRef.current, currentStrokeRef.current]
        : strokesRef.current,
      width,
      height,
    );
    context.drawImage(overlay, 0, 0, width, height);
  }, []);

  const requestRender = useCallback(() => {
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(render);
    }
  }, [render]);

  useEffect(() => {
    if (!isOpen || !imageUrl) return;
    setIsLoading(true);
    setStrokes([]);
    setRedoStack([]);
    currentStrokeRef.current = null;
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      imageRef.current = image;
      setIsLoading(false);
      requestRender();
    };
    image.onerror = () => {
      setIsLoading(false);
      toast.error("Unable to load this image for editing");
      onClose();
    };
    image.src = imageUrl;
    return () => {
      imageRef.current = null;
    };
  }, [imageUrl, isOpen, onClose, requestRender]);

  useEffect(() => {
    if (!isOpen) return;
    const resize = () => {
      const host = hostRef.current;
      const surface = surfaceRef.current;
      const canvas = canvasRef.current;
      const image = imageRef.current;
      if (!host || !surface || !canvas || !image) return;
      const maxWidth = Math.max(1, host.clientWidth - 24);
      const maxHeight = Math.max(1, host.clientHeight - 24);
      const scale = Math.min(
        maxWidth / image.naturalWidth,
        maxHeight / image.naturalHeight,
      );
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      renderSizeRef.current = { width, height, dpr };
      surface.style.width = `${width}px`;
      surface.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      requestRender();
    };
    const observer = new ResizeObserver(resize);
    if (hostRef.current) observer.observe(hostRef.current);
    const timer = window.setTimeout(resize, 0);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [isLoading, isOpen, requestRender]);

  useEffect(() => requestRender(), [strokes, requestRender]);

  const normalizedPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== null || isSending) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerRef.current = event.pointerId;
    currentStrokeRef.current = {
      points: [normalizedPoint(event)],
      color,
      size,
      mode: eraser ? "eraser" : "pen",
    };
    setRedoStack([]);
    requestRender();
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      activePointerRef.current !== event.pointerId ||
      !currentStrokeRef.current
    ) {
      return;
    }
    currentStrokeRef.current.points.push(normalizedPoint(event));
    requestRender();
  };

  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    const completed = currentStrokeRef.current;
    activePointerRef.current = null;
    currentStrokeRef.current = null;
    if (completed) {
      setStrokes((existing) => {
        const next = [...existing, completed];
        strokesRef.current = next;
        return next;
      });
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    requestRender();
  };

  const undo = useCallback(() => {
    setStrokes((existing) => {
      const next = [...existing];
      const removed = next.pop();
      if (removed) setRedoStack((items) => [...items, removed]);
      return next;
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((existing) => {
      const next = [...existing];
      const restored = next.pop();
      if (restored) setStrokes((items) => [...items, restored]);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.key === "Escape" && !isSending) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, isSending, onClose, redo, undo]);

  const send = async () => {
    const image = imageRef.current;
    if (!image || !strokesRef.current.length || isSending) return;
    setIsSending(true);
    try {
      const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
      const exportScale = Math.min(1, 4096 / longestSide);
      const width = Math.max(1, Math.round(image.naturalWidth * exportScale));
      const height = Math.max(1, Math.round(image.naturalHeight * exportScale));
      const output = document.createElement("canvas");
      output.width = width;
      output.height = height;
      const context = output.getContext("2d");
      if (!context) throw new Error("Unable to prepare the image editor");
      context.drawImage(image, 0, 0, width, height);

      const overlay = document.createElement("canvas");
      overlay.width = width;
      overlay.height = height;
      const overlayContext = overlay.getContext("2d");
      if (!overlayContext) throw new Error("Unable to prepare the annotations");
      const displayedWidth = renderSizeRef.current.width;
      paintStrokes(
        overlayContext,
        strokesRef.current,
        width,
        height,
        width / displayedWidth,
      );
      context.drawImage(overlay, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => {
        output.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error("Unable to export the edited image"));
        }, "image/png");
      });
      await onSend(blob);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to send edited image",
      );
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen || !imageUrl) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex h-dvh w-screen flex-col overflow-hidden bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Edit image"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-2 sm:px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={isSending}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-50"
            aria-label="Close image editor"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">Mark up image</span>
        </div>
        <Button
          size="sm"
          className="h-8 gap-1.5"
          disabled={!strokes.length || isSending}
          onClick={() => void send()}
        >
          {isSending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {isSending ? "Sending…" : "Send edited"}
        </Button>
      </header>

      <div
        ref={hostRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-neutral-950 pb-20"
      >
        {isLoading && (
          <Loader2 className="h-7 w-7 animate-spin text-white" aria-label="Loading image" />
        )}
        <div
          ref={surfaceRef}
          className="relative overflow-hidden bg-white shadow-2xl"
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 touch-none"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={finish}
          />
        </div>

        <div className="absolute bottom-3 left-1/2 flex w-[calc(100%-1rem)] max-w-2xl -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-2xl border bg-background/95 p-2 shadow-xl backdrop-blur">
          <button
            onClick={() => setEraser(false)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${!eraser ? "bg-foreground text-background" : "hover:bg-muted"}`}
            aria-label="Pen"
          >
            <Pen className="h-4 w-4" />
          </button>
          <button
            onClick={() => setEraser(true)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${eraser ? "bg-foreground text-background" : "hover:bg-muted"}`}
            aria-label="Eraser"
          >
            <Eraser className="h-4 w-4" />
          </button>
          <span className="mx-1 h-6 w-px bg-border" />
          {COLORS.map((item) => (
            <button
              key={item}
              onClick={() => {
                setColor(item);
                setEraser(false);
              }}
              aria-label={`Use ${item}`}
              className={`h-6 w-6 rounded-full border-2 ${color === item && !eraser ? "scale-110 border-foreground" : "border-border"}`}
              style={{ backgroundColor: item }}
            />
          ))}
          <span className="mx-1 h-6 w-px bg-border" />
          <button
            onClick={() => setSize((value) => Math.max(1, value - 2))}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted"
            aria-label="Smaller brush"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-7 text-center text-xs tabular-nums">{size}</span>
          <button
            onClick={() => setSize((value) => Math.min(48, value + 2))}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted"
            aria-label="Larger brush"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <span className="mx-1 h-6 w-px bg-border" />
          <button
            disabled={!strokes.length}
            onClick={undo}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
            aria-label="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            disabled={!redoStack.length}
            onClick={redo}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
            aria-label="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            disabled={!strokes.length}
            onClick={() => {
              setStrokes([]);
              setRedoStack([]);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
            aria-label="Clear annotations"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
