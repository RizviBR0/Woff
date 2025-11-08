"use client";

import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Undo2, RotateCcw, Check, Palette } from "lucide-react";
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

const BRUSH_SIZES = [2, 6, 12];

export function DrawingCanvas({ isOpen, onClose, onSave }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(4);
  const [paths, setPaths] = useState<ImageData[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size - 1:1 aspect ratio, larger size
    canvas.width = 1000;
    canvas.height = 1000;

    // Set initial canvas background to white
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Configure drawing settings
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [isOpen]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    // Get the scale factor between canvas size and display size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ("touches" in e) {
      // Touch event
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    } else {
      // Mouse event
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Save current state for undo
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setPaths((prev) => [...prev, imageData]);

    setIsDrawing(true);
    const { x, y } = getCoordinates(e);

    ctx.strokeStyle = currentColor;
    ctx.lineWidth = brushSize;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const undo = () => {
    const canvas = canvasRef.current;
    if (!canvas || paths.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const lastPath = paths[paths.length - 1];
    ctx.putImageData(lastPath, 0, 0);
    setPaths((prev) => prev.slice(0, -1));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setPaths([]);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
    onClose();
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
          {/* Main Layout: Canvas Left, Controls Right */}
          <div className="flex gap-4 items-start justify-center">
            {/* Drawing Canvas - Left Side */}
            <div className="flex-shrink-0">
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  className="border-2 border-border rounded-xl cursor-crosshair bg-white touch-none shadow-lg transition-all duration-200 hover:shadow-xl"
                  style={{
                    width: "500px",
                    height: "500px",
                  }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
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
                  1000 × 1000px (1:1)
                </div>
              </div>
            </div>

            {/* Compact Controls Panel - Right Side */}
            <div className="w-[180px] flex-shrink-0 space-y-3">
              {/* Color Palette Section */}
              <div className="bg-muted/30 rounded-lg p-2 border border-border/50">
                <div className="flex items-center gap-1 mb-2">
                  <Palette className="h-3 w-3 text-primary" />
                  <span className="font-medium text-xs">Colors</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      className={`w-7 h-7 rounded-md border transition-all ${
                        currentColor === color
                          ? "border-primary scale-105 shadow-md"
                          : "border-border hover:scale-105"
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setCurrentColor(color)}
                    >
                      {currentColor === color && (
                        <div className="w-full h-full rounded-sm bg-white/30" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Brush Size Section */}
              <div className="bg-muted/30 rounded-lg p-2 border border-border/50">
                <div className="flex items-center gap-1 mb-2">
                  <span className="font-medium text-xs">
                    Size ({brushSize}px)
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {BRUSH_SIZES.map((size) => (
                    <button
                      key={size}
                      className={`w-7 h-7 rounded-md border transition-all flex items-center justify-center ${
                        brushSize === size
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => setBrushSize(size)}
                    >
                      <div
                        className="rounded-full bg-foreground"
                        style={{
                          width: Math.min(size * 0.4, 8),
                          height: Math.min(size * 0.4, 8),
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons Section */}
              <div className="bg-muted/30 rounded-lg p-2 border border-border/50">
                <div className="space-y-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={undo}
                    disabled={paths.length === 0}
                    className="w-full h-7 text-xs px-2"
                  >
                    <Undo2 className="h-3 w-3 mr-1" />
                    Undo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clear}
                    className="w-full h-7 text-xs px-2 hover:bg-destructive/10"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                </div>
              </div>

              {/* Save Actions */}
              <div className="bg-gradient-to-b from-primary/5 to-secondary/5 rounded-lg p-3 border border-primary/20">
                <div className="space-y-2">
                  <Button
                    onClick={handleSave}
                    size="sm"
                    className="w-full h-9 text-sm font-medium"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Save Drawing
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onClose}
                    className="w-full h-8 text-xs"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
