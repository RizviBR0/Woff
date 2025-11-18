"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  X,
  Undo2,
  Redo2,
  RotateCcw,
  Check,
  Palette,
  Eraser,
  Download,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DrawingCanvasProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

const COLORS = [
  "#000000", // Black
  "#FF0000", // Red
  "#0000FF", // Blue
  "#00FF00", // Green
  "#FFA500", // Orange
  "#800080", // Purple
];

const BRUSH_SIZES = [2, 4, 8, 12, 20];

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
  const [currentColor, setCurrentColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(6);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isEraser, setIsEraser] = useState(false);
  const [canvasInfo, setCanvasInfo] = useState<{ css: number; px: number }>({
    css: 500,
    px: 1500,
  });

  // Stop drawing globally when pointer is released anywhere,
  // so we can resume cleanly on next press even if it happens
  // outside the canvas.
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

  // Resize and redraw in a vector-like way
  const redraw = useCallback(
    (ctx: CanvasRenderingContext2D, dpr: number, cssSize: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssSize, cssSize);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cssSize, cssSize);
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

  useEffect(() => {
    const setup = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const maxCss = Math.min(800, Math.floor(container.clientWidth || 500));
      const cssSize = Math.max(360, maxCss);
      const dpr = Math.max(2, Math.min(4, window.devicePixelRatio || 2));
      const pxSize = Math.floor(cssSize * dpr);

      canvas.width = pxSize;
      canvas.height = pxSize;
      canvas.style.width = `${cssSize}px`;
      canvas.style.height = `${cssSize}px`;
      setCanvasInfo({ css: cssSize, px: pxSize });

      redraw(ctx, dpr, cssSize);
    };

    // Only initialize when the dialog is open and canvas is mounted
    if (!isOpen) return;

    setup();
    const ro = new ResizeObserver(() => setup());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [isOpen, redraw]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    // Store points in CSS coordinates (0..cssSize) so
    // they line up with what the user sees; we already
    // handle high-DPI via context scaling in redraw.
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

    // For mouse, ignore moves when no button is pressed.
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-auto max-h-[95vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-primary/5 to-secondary/5">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Digital Canvas
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 overflow-auto">
          {/* Main Layout: responsive column on small screens, row on desktop */}
          <div className="flex flex-col md:flex-row gap-4 items-start justify-center">
            {/* Drawing Canvas - Left Side */}
            <div className="flex-shrink-0" ref={containerRef}>
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  className="border-2 border-border rounded-xl cursor-crosshair bg-white touch-none shadow-lg transition-all duration-200 hover:shadow-xl"
                  style={{
                    width: `${canvasInfo.css}px`,
                    height: `${canvasInfo.css}px`,
                  }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={draw}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                {/* Canvas overlay for better visual feedback */}
                <div className="absolute inset-0 rounded-xl pointer-events-none border-2 border-transparent bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 opacity-0 transition-opacity duration-200 hover:opacity-100" />
              </div>
              {/* Canvas Info */}
              <div className="text-center mt-2">
                <div className="text-xs text-muted-foreground">
                  {canvasInfo.px} × {canvasInfo.px}px ({canvasInfo.css}×
                  {canvasInfo.css} CSS)
                </div>
              </div>
            </div>

            {/* Compact Controls Panel - Right/Bottom, simplified */}
            <div className="w-full md:w-[200px] flex-shrink-0 space-y-3 md:max-h-[520px] md:overflow-y-auto">
              <div className="bg-muted/30 rounded-lg p-2 border border-border/50 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <Palette className="h-3 w-3 text-primary" />
                    <span className="font-medium text-xs">Tools</span>
                  </div>
                  <Button
                    variant={isEraser ? "default" : "outline"}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setIsEraser((v) => !v)}
                  >
                    <Eraser className="h-3 w-3" />
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    {COLORS.map((color) => (
                      <button
                        key={color}
                        className={`w-5 h-5 rounded-full border transition-all ${
                          currentColor === color
                            ? "border-primary scale-110 shadow"
                            : "border-border hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          setCurrentColor(color);
                          setIsEraser(false);
                        }}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={currentColor}
                    onChange={(e) => {
                      setCurrentColor(e.target.value);
                      setIsEraser(false);
                    }}
                    className="w-8 h-8 rounded-md border border-border/50 cursor-pointer"
                    aria-label="Pick custom color"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-12">
                    Size
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={32}
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-[11px] tabular-nums w-8 text-right">
                    {brushSize}
                  </span>
                </div>
              </div>

              <div className="bg-muted/30 rounded-lg p-2 border border-border/50">
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={undo}
                    disabled={strokes.length === 0}
                    className="h-8"
                  >
                    <Undo2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={redo}
                    disabled={redoStack.length === 0}
                    className="h-8"
                  >
                    <Redo2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={clear}
                    className="h-8 hover:bg-destructive/10"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="bg-gradient-to-b from-primary/5 to-secondary/5 rounded-lg p-2 border border-primary/20">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <Button
                    onClick={handleSave}
                    size="sm"
                    className="h-8 text-xs font-medium flex-1"
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Send
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onClose}
                    className="h-8 text-xs flex-1"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Close
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="w-full h-8 text-xs"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download PNG
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
