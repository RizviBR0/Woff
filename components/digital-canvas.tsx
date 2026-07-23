"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Download,
  Eraser,
  Minus,
  Pen,
  Plus,
  Redo2,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface DrawingCanvasProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

type Point = { x: number; y: number };
type Stroke = {
  points: Point[];
  color: string;
  size: number;
  mode: "pen" | "eraser";
};

const COLORS = [
  "#1a1a1a",
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#a855f7",
  "#06b6d4",
  "#ec4899",
  "#ffffff",
];

export function DrawingCanvas({ isOpen, onClose, onSave }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activePointerRef = useRef<number | null>(null);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const dimensionsRef = useRef({ width: 1, height: 1, dpr: 1 });
  const frameRef = useRef<number | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [color, setColor] = useState("#1a1a1a");
  const [size, setSize] = useState(4);
  const [eraser, setEraser] = useState(false);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  const renderCanvas = useCallback(() => {
    frameRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { width, height, dpr } = dimensionsRef.current;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.lineCap = "round";
    context.lineJoin = "round";

    const all = currentStrokeRef.current
      ? [...strokesRef.current, currentStrokeRef.current]
      : strokesRef.current;
    all.forEach((stroke) => {
      const points = stroke.points;
      if (!points.length) return;
      context.strokeStyle = stroke.mode === "eraser" ? "#ffffff" : stroke.color;
      context.fillStyle = context.strokeStyle;
      context.lineWidth = stroke.size;
      if (points.length === 1) {
        context.beginPath();
        context.arc(
          points[0].x * width,
          points[0].y * height,
          stroke.size / 2,
          0,
          Math.PI * 2,
        );
        context.fill();
        return;
      }
      context.beginPath();
      context.moveTo(points[0].x * width, points[0].y * height);
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const point = points[index];
        context.quadraticCurveTo(
          previous.x * width,
          previous.y * height,
          ((previous.x + point.x) / 2) * width,
          ((previous.y + point.y) / 2) * height,
        );
      }
      context.stroke();
    });
  }, []);

  const requestRender = useCallback(() => {
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(renderCanvas);
    }
  }, [renderCanvas]);

  useEffect(() => {
    if (!isOpen) return;
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      dimensionsRef.current = { width, height, dpr };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      requestRender();
    };
    const observer = new ResizeObserver(resize);
    if (containerRef.current) observer.observe(containerRef.current);
    resize();
    return () => {
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [isOpen, requestRender]);

  useEffect(() => {
    requestRender();
  }, [strokes, requestRender]);

  useEffect(() => {
    if (!isOpen) return;
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const normalizedPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== null) return;
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
    if (completed) setStrokes((existing) => [...existing, completed]);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    requestRender();
  };

  const undo = () => {
    setStrokes((existing) => {
      const next = [...existing];
      const removed = next.pop();
      if (removed) setRedoStack((redoItems) => [...redoItems, removed]);
      return next;
    });
  };

  const redo = () => {
    setRedoStack((existing) => {
      const next = [...existing];
      const restored = next.pop();
      if (restored) setStrokes((items) => [...items, restored]);
      return next;
    });
  };

  const clear = () => {
    setStrokes([]);
    setRedoStack([]);
    currentStrokeRef.current = null;
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || !strokesRef.current.length) return;
    onSave(canvas.toDataURL("image/png"));
    onClose();
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const anchor = document.createElement("a");
    anchor.href = canvas.toDataURL("image/png");
    anchor.download = `drawing-${Date.now()}.png`;
    anchor.click();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex h-dvh w-screen flex-col overflow-hidden bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-2 sm:px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted"
            aria-label="Close drawing canvas"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">Digital Canvas</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={download}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button size="sm" className="h-8 gap-1.5" disabled={!strokes.length} onClick={save}>
            <Check className="h-3.5 w-3.5" />
            Send
          </Button>
        </div>
      </header>

      <div ref={containerRef} className="relative min-h-0 flex-1 bg-neutral-100">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
        />

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
          <button onClick={() => setSize((value) => Math.max(1, value - 2))} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted" aria-label="Smaller brush">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-8 text-center text-xs tabular-nums">{size}</span>
          <button onClick={() => setSize((value) => Math.min(48, value + 2))} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted" aria-label="Larger brush">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <span className="mx-1 h-6 w-px bg-border" />
          <button disabled={!strokes.length} onClick={undo} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30" aria-label="Undo">
            <Undo2 className="h-4 w-4" />
          </button>
          <button disabled={!redoStack.length} onClick={redo} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30" aria-label="Redo">
            <Redo2 className="h-4 w-4" />
          </button>
          <button onClick={clear} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10" aria-label="Clear canvas">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
