"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import {
  Check,
  Download,
  Eraser,
  Highlighter,
  ImagePlus,
  Loader2,
  MousePointer2,
  Pen,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCanvasDrawing, type ToolMode } from "@/lib/hooks/use-canvas-drawing";
import { triggerBlobDownload } from "@/lib/download";

interface DrawingCanvasProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (blob: Blob) => Promise<void>;
  initialImageUrl?: string | null;
  title?: string;
  saveButtonLabel?: string;
}

// Curated high-contrast palette for dark and light modes
const PALETTE = [
  { label: "White", value: "#ffffff" },
  { label: "Dark", value: "#18181b" },
  { label: "Orange", value: "#ff5a00" },
  { label: "Red", value: "#ef4444" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Green", value: "#10b981" },
  { label: "Purple", value: "#8b5cf6" },
  { label: "Yellow", value: "#f59e0b" },
];

const STROKE_SIZES = [
  { label: "Fine", value: 2, dotSize: "h-1.5 w-1.5" },
  { label: "Medium", value: 5, dotSize: "h-2.5 w-2.5" },
  { label: "Bold", value: 12, dotSize: "h-4 w-4" },
];

export function DrawingCanvas({
  isOpen,
  onClose,
  onSave,
  initialImageUrl,
  title = "Canvas",
  saveButtonLabel = "Send to Space",
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { resolvedTheme } = useTheme();
  const theme = (resolvedTheme === "dark" ? "dark" : "light") as "dark" | "light";

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const isSendingRef = useRef(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);

  const {
    mode,
    setMode,
    strokes,
    images,
    selectedIds,
    color,
    setColor,
    size,
    setSize,
    addImage,
    deleteSelected,
    undo,
    redo,
    clear,
    updateDimensions,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    exportBlob,
    canUndo,
    canRedo,
    hasContent,
  } = useCanvasDrawing({
    canvasRef,
    containerRef,
    theme,
  });

  // Load an image file onto the canvas as an interactive moveable/resizable element
  const handleLoadImage = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Please provide an image file (PNG, JPG, WebP)");
        return;
      }
      addImage(file);
      toast.success("Image placed on canvas. Drag handles to resize or draw on top.");
    },
    [addImage],
  );

  const loadedUrlRef = useRef<string | null>(null);
  const addImageRef = useRef(addImage);
  const clearRef = useRef(clear);
  const setModeRef = useRef(setMode);

  useEffect(() => {
    addImageRef.current = addImage;
    clearRef.current = clear;
    setModeRef.current = setMode;
  });

  // Load initial image if provided (for image editing / markup mode)
  useEffect(() => {
    if (!isOpen) {
      loadedUrlRef.current = null;
      setIsLoadingImage(false);
      setImageLoadError(null);
      return;
    }

    if (!initialImageUrl) {
      setIsLoadingImage(false);
      setImageLoadError(null);
      return;
    }

    // If already loaded this specific URL for this modal session, do not reload
    if (loadedUrlRef.current === initialImageUrl) {
      return;
    }

    let active = true;
    const controller = new AbortController();
    setIsLoadingImage(true);
    setImageLoadError(null);
    clearRef.current();

    const load = async () => {
      let objectUrl = initialImageUrl;
      let shouldRevoke = false;

      try {
        if (
          !initialImageUrl.startsWith("data:") &&
          !initialImageUrl.startsWith("blob:")
        ) {
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          try {
            const res = await fetch(initialImageUrl, {
              cache: "no-cache",
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (res.ok) {
              const blob = await res.blob();
              objectUrl = URL.createObjectURL(blob);
              shouldRevoke = true;
            } else {
              // Fall back to direct URL
              objectUrl = initialImageUrl;
            }
          } catch {
            clearTimeout(timeoutId);
            // If fetch failed or was aborted, fallback to direct image source
            objectUrl = initialImageUrl;
          }
        }

        const img = new window.Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Unable to decode image"));
          img.src = objectUrl;
          if (img.complete && img.naturalWidth > 0) {
            resolve();
          }
        });

        if (!active) {
          if (shouldRevoke) URL.revokeObjectURL(objectUrl);
          return;
        }

        loadedUrlRef.current = initialImageUrl;

        const container = containerRef.current;
        const viewW = container?.clientWidth || window.innerWidth;
        const viewH = container?.clientHeight || (window.innerHeight - 48);
        const naturalW = img.naturalWidth || 800;
        const naturalH = img.naturalHeight || 600;
        const aspect = naturalW / naturalH;

        // Size to fit nicely in full screen viewport with margin
        const maxW = viewW * 0.82;
        const maxH = viewH * 0.76;
        let initW = maxW;
        if (initW / aspect > maxH) {
          initW = maxH * aspect;
        }
        const widthRatio = Math.max(0.2, Math.min(0.92, initW / Math.max(1, viewW)));

        addImageRef.current(img, { x: 0.5, y: 0.5 }, widthRatio, false);
        setModeRef.current("pen");
        setIsLoadingImage(false);
      } catch (err) {
        if (!active) return;
        setIsLoadingImage(false);
        setImageLoadError(
          err instanceof Error ? err.message : "Failed to load image for editing",
        );
      }
    };

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [isOpen, initialImageUrl]);

  // Track container resize to update canvas resolution and DPR
  useEffect(() => {
    if (!isOpen) return;
    const updateSize = () => {
      const container = containerRef.current;
      if (!container) return;
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      updateDimensions(width, height);
    };

    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) observer.observe(containerRef.current);
    updateSize();

    return () => observer.disconnect();
  }, [isOpen, updateDimensions]);

  // Capture-phase event listeners to intercept paste & drop so they NEVER leak to the background room
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      e.stopPropagation();
      e.stopImmediatePropagation();

      const items = Array.from(e.clipboardData?.items || []);
      const item = items.find((it) => it.type.startsWith("image/"));
      if (!item) return;

      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        handleLoadImage(file);
      }
    };

    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setIsDraggingOver(true);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        setIsDraggingOver(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.relatedTarget === null) {
        setIsDraggingOver(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      setIsDraggingOver(false);

      const files = Array.from(e.dataTransfer?.files || []);
      const imgFile = files.find((f) => f.type.startsWith("image/"));
      if (imgFile) {
        handleLoadImage(imgFile);
      }
    };

    window.addEventListener("paste", handlePaste, true);
    window.addEventListener("dragenter", handleDragEnter, true);
    window.addEventListener("dragover", handleDragOver, true);
    window.addEventListener("dragleave", handleDragLeave, true);
    window.addEventListener("drop", handleDrop, true);

    return () => {
      window.removeEventListener("paste", handlePaste, true);
      window.removeEventListener("dragenter", handleDragEnter, true);
      window.removeEventListener("dragover", handleDragOver, true);
      window.removeEventListener("dragleave", handleDragLeave, true);
      window.removeEventListener("drop", handleDrop, true);
    };
  }, [isOpen, handleLoadImage]);

  // Send the composite canvas (images + strokes) as a high-res entry into the room
  const save = async () => {
    if (!hasContent || isSending || isSendingRef.current) return;
    isSendingRef.current = true;
    setIsSending(true);
    try {
      const blob = await exportBlob(undefined, undefined, "image/png");
      if (!blob) throw new Error("Unable to prepare drawing");
      await onSave(blob);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send drawing");
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  };

  // Download local PNG file
  const download = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading("Preparing PNG export...");
    try {
      const blob = await exportBlob(undefined, undefined, "image/png");
      if (!blob) throw new Error("Could not export canvas image");
      triggerBlobDownload(blob, `canvas-${Date.now()}.png`);
      toast.success("PNG download started", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export PNG", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  const cursorClass =
    mode === "select"
      ? "cursor-default"
      : mode === "pen" || mode === "highlighter"
        ? "cursor-crosshair"
        : "cursor-cell";

  return createPortal(
    <div
      data-woff-canvas="true"
      className="fixed inset-0 z-[9999] flex h-dvh w-screen flex-col overflow-hidden bg-background select-none font-sans"
    >
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/80 bg-background/90 px-3 sm:px-5 backdrop-blur-md z-20">
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isSending}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close canvas"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              {title}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isExporting}
            className="h-8 gap-1.5 text-xs font-medium"
            onClick={download}
            title={isExporting ? "Exporting PNG…" : "Download PNG to device"}
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {isExporting ? "Exporting…" : "Export PNG"}
            </span>
          </Button>

          <Button
            size="sm"
            className="h-8 gap-1.5 bg-[#ff5a00] hover:bg-[#e04f00] text-white text-xs font-medium shadow-sm transition-all"
            disabled={!hasContent || isSending || isLoadingImage}
            onClick={() => void save()}
            title={saveButtonLabel}
          >
            {isSending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {isSending ? "Sending…" : saveButtonLabel}
          </Button>
        </div>
      </header>

      {/* Canvas Area */}
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden bg-muted/20">
        {/* Blur Shimmer Loading State when opening image markup mode */}
        {isLoadingImage && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative flex flex-col items-center gap-4 p-8 rounded-3xl border bg-card/70 shadow-2xl backdrop-blur-xl max-w-md w-full mx-4 overflow-hidden">
              <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent pointer-events-none" />
              <div className="h-14 w-14 rounded-2xl bg-muted/80 flex items-center justify-center shadow-inner border border-white/10">
                <Loader2 className="h-7 w-7 animate-spin text-orange-500" />
              </div>
              <div className="text-center space-y-1 z-10">
                <p className="text-sm font-semibold text-foreground">Preparing image canvas…</p>
                <p className="text-xs text-muted-foreground">Setting up full-screen markup workspace</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 text-xs text-muted-foreground hover:text-foreground z-10"
                onClick={onClose}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Image loading error overlay */}
        {imageLoadError && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-in fade-in">
            <div className="max-w-sm rounded-2xl border bg-card p-6 text-center shadow-2xl space-y-3">
              <p className="font-semibold text-foreground">Could not open image for editing</p>
              <p className="text-xs text-muted-foreground">{imageLoadError}</p>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className={`absolute inset-0 touch-none ${cursorClass}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        {/* Drag over canvas overlay */}
        {isDraggingOver && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="rounded-3xl border-2 border-dashed border-orange-500 bg-card px-10 py-8 text-center shadow-2xl">
              <ImagePlus className="mx-auto h-10 w-10 text-orange-500 mb-3 animate-bounce" />
              <p className="text-lg font-semibold text-foreground">Drop Image to Canvas</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Move, resize, and draw directly over it
              </p>
            </div>
          </div>
        )}

        {/* Hidden image picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleLoadImage(file);
            e.target.value = "";
          }}
        />

        {/* Minimized Figma-style Floating Animated Dock */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 sm:gap-1.5 rounded-2xl border border-zinc-200/90 dark:border-white/10 bg-white/95 dark:bg-[#18181b]/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          {/* Tool Segment */}
          <div className="flex items-center gap-1">
            <ToolbarButton
              active={mode === "select"}
              onClick={() => setMode("select")}
              title="Select & Marquee Box (V)"
            >
              <MousePointer2 className="h-4 w-4" />
            </ToolbarButton>

            <ToolbarButton
              active={mode === "pen"}
              onClick={() => setMode("pen")}
              title="Pen (P)"
            >
              <Pen className="h-4 w-4" />
            </ToolbarButton>

            <ToolbarButton
              active={mode === "highlighter"}
              onClick={() => setMode("highlighter")}
              title="Highlighter (H)"
            >
              <Highlighter className="h-4 w-4" />
            </ToolbarButton>

            <ToolbarButton
              active={mode === "eraser"}
              onClick={() => setMode("eraser")}
              title="Eraser (E)"
            >
              <Eraser className="h-4 w-4" />
            </ToolbarButton>

            <ToolbarButton
              onClick={() => fileInputRef.current?.click()}
              title="Add Image / Screenshot"
            >
              <ImagePlus className="h-4 w-4" />
            </ToolbarButton>
          </div>

          <span className="mx-0.5 h-5 w-[1px] bg-border/80 shrink-0" />

          {/* Color Picker Swatch & Popup */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColorPicker((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-xl hover:bg-muted transition-transform active:scale-95"
              title="Pick color"
              aria-label="Pick color"
            >
              <span
                className="h-5 w-5 rounded-full border border-black/20 dark:border-white/30 shadow-inner"
                style={{ backgroundColor: color }}
              />
            </button>

            {showColorPicker && (
              <div className="absolute bottom-11 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-white/95 dark:bg-[#1c1c20]/95 shadow-xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 z-50">
                {PALETTE.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      setColor(p.value);
                      if (mode === "eraser") setMode("pen");
                      setShowColorPicker(false);
                    }}
                    title={p.label}
                    className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${
                      color === p.value
                        ? "scale-110 ring-2 ring-[#ff5a00] ring-offset-2 ring-offset-background"
                        : "border-black/10 dark:border-white/20"
                    }`}
                    style={{ backgroundColor: p.value }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Stroke Width Selector */}
          <div className="flex items-center gap-1 px-1">
            {STROKE_SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSize(s.value)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                  size === s.value
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
                title={`${s.label} Stroke (${s.value}px)`}
              >
                <span
                  className={`rounded-full ${s.dotSize}`}
                  style={{ backgroundColor: color }}
                />
              </button>
            ))}
          </div>

          <span className="mx-0.5 h-5 w-[1px] bg-border/80 shrink-0" />

          {/* Quick Actions Segment */}
          <div className="flex items-center gap-1">
            <ToolbarButton
              disabled={!canUndo}
              onClick={undo}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </ToolbarButton>

            <ToolbarButton
              disabled={!canRedo}
              onClick={redo}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="h-4 w-4" />
            </ToolbarButton>

            {/* Delete Selected (Active whenever items selected) */}
            <Button
              variant="ghost"
              size="icon"
              type="button"
              disabled={selectedIds.size === 0}
              onClick={deleteSelected}
              className={`relative flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                selectedIds.size > 0
                  ? "bg-red-500/15 text-red-600 dark:text-red-400 hover:bg-red-500/25 active:scale-95"
                  : "text-muted-foreground/30 cursor-not-allowed"
              }`}
              title={
                selectedIds.size > 0
                  ? `Delete ${selectedIds.size} selected (Del)`
                  : "Select items to delete"
              }
            >
              <Trash2 className="h-4 w-4" />
              {selectedIds.size > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white shadow">
                  {selectedIds.size}
                </span>
              )}
            </Button>

            {/* Clear Canvas */}
            <ToolbarButton
              disabled={!hasContent}
              onClick={clear}
              title="Clear Canvas"
              danger
            >
              <RotateCcw className="h-4 w-4" />
            </ToolbarButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ToolbarButton({
  active,
  disabled,
  danger,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`h-8 w-8 rounded-xl text-xs font-medium transition-all active:scale-95 ${
        active
          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-sm hover:bg-zinc-900 dark:hover:bg-white"
          : danger
            ? "text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
      } disabled:opacity-25 disabled:pointer-events-none`}
    >
      {children}
    </Button>
  );
}

