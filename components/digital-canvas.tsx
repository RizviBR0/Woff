"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Undo2,
  Redo2,
  RotateCcw,
  Check,
  Eraser,
  Download,
  Minus,
  Plus,
  Pen,
  X,
} from "lucide-react";

interface DrawingCanvasProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

const COLORS = [
  "#1a1a1a",
  "#f44336",
  "#2196F3",
  "#4CAF50",
  "#FF9800",
  "#9C27B0",
  "#00BCD4",
  "#E91E63",
  "#FFFFFF",
];

type Point = {
  x: number;
  y: number;
};

type Stroke = {
  points: Point[];
  color: string;
  size: number;
  mode: "pen" | "eraser";
};

export function DrawingCanvas({ isOpen, onClose, onSave }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState("#1a1a1a");
  const [brushSize, setBrushSize] = useState(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isEraser, setIsEraser] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [canvasHeight, setCanvasHeight] = useState(0);

  // Stop drawing globally when pointer is released anywhere
  useEffect(() => {
    const handlePointerUp = () => {
      setIsDrawing(false);
      if (currentStroke) {
        setStrokes((prev) => [...prev, currentStroke]);
        setCurrentStroke(null);
      }
    };

    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("touchend", handlePointerUp);
    window.addEventListener("touchcancel", handlePointerUp);

    return () => {
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchend", handlePointerUp);
      window.removeEventListener("touchcancel", handlePointerUp);
    };
  }, [currentStroke]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
      if (e.key === "e" || e.key === "E") {
        setIsEraser((v) => !v);
      }
      if (e.key === "Escape") {
        onClose();
      }
      if (e.key === "[") {
        setBrushSize((s) => Math.max(1, s - 2));
      }
      if (e.key === "]") {
        setBrushSize((s) => Math.min(48, s + 2));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Redraw all strokes
  const redraw = useCallback(
    (ctx: CanvasRenderingContext2D, dpr: number, w: number, h: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.imageSmoothingEnabled = true;

      const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

      allStrokes.forEach((stroke) => {
        if (stroke.points.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = stroke.mode === "eraser" ? "#ffffff" : stroke.color;
        ctx.lineWidth = stroke.size;
        for (let i = 0; i < stroke.points.length - 1; i++) {
          const p0 = stroke.points[i];
          const p1 = stroke.points[i + 1];
          const midX = (p0.x + p1.x) / 2;
          const midY = (p0.y + p1.y) / 2;
          if (i === 0) {
            ctx.moveTo(p0.x, p0.y);
          }
          ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
        }
        ctx.stroke();
      });
    },
    [strokes, currentStroke]
  );

  // Setup canvas to fill the entire container
  useEffect(() => {
    const setup = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = Math.max(2, Math.min(4, window.devicePixelRatio || 2));

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      setCanvasWidth(w);
      setCanvasHeight(h);

      redraw(ctx, dpr, w, h);
    };

    if (!isOpen) return;

    // Small delay so portal has mounted and has dimensions
    const timer = setTimeout(setup, 50);
    const ro = new ResizeObserver(() => setup());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [isOpen, redraw]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    const getRelative = (clientX: number, clientY: number) => ({
      x: clientX - rect.left,
      y: clientY - rect.top,
    });

    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return getRelative(touch.clientX, touch.clientY);
    } else {
      return getRelative(e.clientX, e.clientY);
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const mode = isEraser ? "eraser" : "pen";
    const stroke: Stroke = {
      points: [{ x, y }],
      color: currentColor,
      size: brushSize,
      mode,
    };
    setCurrentStroke(stroke);
    setIsDrawing(true);
    setRedoStack([]);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!currentStroke) return;
    e.preventDefault();

    if ("buttons" in e && e.buttons === 0) {
      return;
    }

    const { x, y } = getCoordinates(e);
    setCurrentStroke((prev) =>
      prev ? { ...prev, points: [...prev.points, { x, y }] } : prev
    );
  };

  const stopDrawing = () => {
    if (currentStroke) {
      setStrokes((prev) => [...prev, currentStroke]);
      setCurrentStroke(null);
    }
    setIsDrawing(false);
  };

  const undo = () => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      const last = copy.pop()!;
      setRedoStack((r) => [...r, last]);
      return copy;
    });
  };

  const redo = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      const last = copy.pop()!;
      setStrokes((s) => [...s, last]);
      return copy;
    });
  };

  const clear = () => {
    setStrokes([]);
    setRedoStack([]);
    setCurrentStroke(null);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
    onClose();
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `drawing-${Date.now()}.png`;
    a.click();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-background flex flex-col overflow-hidden"
      style={{ margin: 0, padding: 0, width: '100vw', height: '100vh', top: 0, left: 0 }}
    >
      {/* Top Bar */}
      <div className="h-11 sm:h-12 flex items-center justify-between px-2 sm:px-4 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="h-5 w-px bg-border hidden sm:block" />
          <span className="text-xs sm:text-sm font-semibold text-foreground">
            Digital Canvas
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="h-7 sm:h-8 text-[11px] sm:text-xs gap-1 sm:gap-1.5 px-2 sm:px-3"
          >
            <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Export PNG</span>
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            className="h-7 sm:h-8 text-[11px] sm:text-xs gap-1 sm:gap-1.5 px-2 sm:px-3"
          >
            <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="hidden xs:inline">Send</span>
            <span className="hidden sm:inline"> Drawing</span>
          </Button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 relative overflow-hidden bg-neutral-100 dark:bg-neutral-900">
        {/* Canvas Container */}
        <div
          ref={containerRef}
          className="absolute inset-0"
        >
          <canvas
            ref={canvasRef}
            className="cursor-crosshair bg-white touch-none absolute inset-0"
            style={{
              width: `${canvasWidth}px`,
              height: `${canvasHeight}px`,
            }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={draw}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>

        {/* Floating Bottom Toolbar - Responsive */}
        <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 z-10 w-[calc(100%-1rem)] sm:w-auto max-w-[calc(100%-1rem)]">
          {/* Mobile: two rows stacked. Desktop: single row */}
          <div className="bg-background border border-border rounded-xl shadow-lg px-1.5 sm:px-2 py-1.5 flex flex-col sm:flex-row items-center gap-1.5 sm:gap-1">

            {/* Row 1: Tools + Colors */}
            <div className="flex items-center gap-1 w-full sm:w-auto justify-center">
              {/* Pen / Eraser Toggle */}
              <button
                onClick={() => setIsEraser(false)}
                className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg transition-all shrink-0 ${
                  !isEraser
                    ? "bg-foreground text-background shadow-sm"
                    : "hover:bg-muted text-muted-foreground"
                }`}
                title="Pen (E)"
              >
                <Pen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                onClick={() => setIsEraser(true)}
                className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg transition-all shrink-0 ${
                  isEraser
                    ? "bg-foreground text-background shadow-sm"
                    : "hover:bg-muted text-muted-foreground"
                }`}
                title="Eraser (E)"
              >
                <Eraser className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              <div className="w-px h-5 sm:h-6 bg-border mx-0.5 sm:mx-1 shrink-0" />

              {/* Color Swatches */}
              <div className="flex items-center gap-0.5 sm:gap-1 px-0.5 sm:px-1 overflow-x-auto">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 transition-all shrink-0 ${
                      currentColor === color && !isEraser
                        ? "border-foreground scale-110"
                        : "border-border hover:scale-105"
                    } ${color === "#FFFFFF" ? "ring-1 ring-border ring-inset" : ""}`}
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      setCurrentColor(color);
                      setIsEraser(false);
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={currentColor}
                  onChange={(e) => {
                    setCurrentColor(e.target.value);
                    setIsEraser(false);
                  }}
                  className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-border cursor-pointer appearance-none bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-none shrink-0"
                  aria-label="Custom color"
                />
              </div>
            </div>

            {/* Divider - only visible on desktop single-row */}
            <div className="w-full h-px sm:w-px sm:h-6 bg-border sm:mx-1 shrink-0" />

            {/* Row 2: Brush Size + Actions */}
            <div className="flex items-center gap-1 w-full sm:w-auto justify-center">
              {/* Brush Size */}
              <div className="flex items-center gap-1 sm:gap-1.5 px-0.5 sm:px-1">
                <button
                  onClick={() => setBrushSize((s) => Math.max(1, s - 2))}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground transition-colors shrink-0"
                  title="Decrease size"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <div className="flex items-center justify-center w-8 sm:w-12">
                  <div
                    className="rounded-full bg-foreground transition-all"
                    style={{
                      width: `${Math.max(4, Math.min(brushSize, 24))}px`,
                      height: `${Math.max(4, Math.min(brushSize, 24))}px`,
                    }}
                  />
                </div>
                <button
                  onClick={() => setBrushSize((s) => Math.min(48, s + 2))}
                  className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground transition-colors shrink-0"
                  title="Increase size"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              <div className="w-px h-5 sm:h-6 bg-border mx-0.5 sm:mx-1 shrink-0" />

              {/* Actions */}
              <button
                onClick={undo}
                disabled={strokes.length === 0}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30 transition-all shrink-0"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                onClick={redo}
                disabled={redoStack.length === 0}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30 transition-all shrink-0"
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                onClick={clear}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-500 transition-all shrink-0"
                title="Clear canvas"
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Keyboard shortcut hints — desktop only */}
        <div className="absolute bottom-4 right-4 text-[10px] text-muted-foreground/50 hidden lg:block space-y-0.5 select-none">
          <div><kbd className="font-mono">E</kbd> Toggle eraser</div>
          <div><kbd className="font-mono">[ ]</kbd> Brush size</div>
          <div><kbd className="font-mono">Ctrl+Z</kbd> Undo</div>
          <div><kbd className="font-mono">Esc</kbd> Close</div>
        </div>
      </div>
    </div>,
    document.body
  );
}

