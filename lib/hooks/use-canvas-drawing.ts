"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Point = { x: number; y: number };

export interface CanvasImage {
  id: string;
  element: HTMLImageElement;
  src: string;
  centerX: number; // 0..1 normalized center X
  centerY: number; // 0..1 normalized center Y
  widthRatio: number; // fraction of canvas width (e.g. 0.4)
  aspectRatio: number; // naturalWidth / naturalHeight
}

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  size: number;
  mode: "pen" | "highlighter" | "eraser";
}

export type ToolMode = "select" | "pen" | "highlighter" | "eraser";

export type ResizeHandle = "tl" | "tr" | "bl" | "br";

export interface CanvasDimensions {
  width: number;
  height: number;
  dpr: number;
}

export interface UseCanvasDrawingOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  backgroundImage?: HTMLImageElement | null;
  initialColor?: string;
  initialSize?: number;
  initialMode?: ToolMode;
  theme?: "dark" | "light";
  transparentBackground?: boolean;
}

export function paintStrokes(
  context: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
  sizeScale = 1,
) {
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const stroke of strokes) {
    if (!stroke.points.length) continue;

    if (stroke.mode === "highlighter") {
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 0.35;
      context.strokeStyle = stroke.color;
      context.fillStyle = stroke.color;
      context.lineWidth = Math.max(10, stroke.size * sizeScale * 2.6);
    } else if (stroke.mode === "eraser") {
      context.globalCompositeOperation = "destination-out";
      context.globalAlpha = 1;
      context.strokeStyle = stroke.color;
      context.fillStyle = stroke.color;
      context.lineWidth = Math.max(1, stroke.size * sizeScale);
    } else {
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.strokeStyle = stroke.color;
      context.fillStyle = stroke.color;
      context.lineWidth = Math.max(1, stroke.size * sizeScale);
    }

    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      context.beginPath();
      context.arc(
        point.x * width,
        point.y * height,
        (stroke.size * sizeScale) / 2,
        0,
        Math.PI * 2,
      );
      context.fill();
    } else {
      context.beginPath();
      context.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);
      for (let i = 1; i < stroke.points.length; i++) {
        context.lineTo(stroke.points[i].x * width, stroke.points[i].y * height);
      }
      context.stroke();
    }
  }

  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
}

export function useCanvasDrawing({
  canvasRef,
  containerRef,
  backgroundImage = null,
  initialColor,
  initialSize = 4,
  initialMode = "pen",
  theme = "dark",
  transparentBackground = false,
}: UseCanvasDrawingOptions) {
  // Theme default color: crisp white in dark mode, dark slate in light mode
  const defaultStrokeColor = initialColor || (theme === "dark" ? "#ffffff" : "#18181b");

  const [mode, setModeState] = useState<ToolMode>(initialMode);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [images, setImages] = useState<CanvasImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [color, setColor] = useState(defaultStrokeColor);
  const [size, setSize] = useState(initialSize);

  // Undo / Redo history
  const [history, setHistory] = useState<{ strokes: Stroke[]; images: CanvasImage[] }[]>([]);
  const [redoHistory, setRedoHistory] = useState<{ strokes: Stroke[]; images: CanvasImage[] }[]>([]);

  // Refs for high-speed pointer loop without stale closures
  const strokesRef = useRef<Stroke[]>([]);
  const imagesRef = useRef<CanvasImage[]>([]);
  const selectedIdsRef = useRef<Set<string>>(selectedIds);
  const modeRef = useRef<ToolMode>(mode);
  const dimensionsRef = useRef<CanvasDimensions>({ width: 1, height: 1, dpr: 1 });
  const frameRef = useRef<number | null>(null);

  strokesRef.current = strokes;
  imagesRef.current = images;
  selectedIdsRef.current = selectedIds;
  modeRef.current = mode;

  // Active interaction state
  const activePointerIdRef = useRef<number | null>(null);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const marqueeRef = useRef<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const dragTypeRef = useRef<"none" | "draw" | "marquee" | "move" | "resize">("none");
  const dragStartPointRef = useRef<Point>({ x: 0, y: 0 });
  const dragInitialBoundsRef = useRef<
    Map<string, { centerX: number; centerY: number; widthRatio: number; points?: Point[] }>
  >(new Map());
  const resizeHandleRef = useRef<ResizeHandle | null>(null);
  const resizeImageIdRef = useRef<string | null>(null);

  // Record undo state before modification
  const pushHistory = useCallback(() => {
    setHistory((prev) => [
      ...prev.slice(-25),
      { strokes: [...strokesRef.current], images: [...imagesRef.current] },
    ]);
    setRedoHistory([]);
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const { width, height, dpr } = dimensionsRef.current;
    context.clearRect(0, 0, width * dpr, height * dpr);

    context.save();
    context.scale(dpr, dpr);

    // 1. Sleek Figma-style background (skip when transparentBackground is active)
    if (!transparentBackground) {
      const isDark = theme === "dark";
      context.fillStyle = isDark ? "#121214" : "#f8fafc";
      context.fillRect(0, 0, width, height);

      // 2. Figma dot-grid pattern
      const dotSpacing = 24;
      context.fillStyle = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.07)";
      const cols = Math.ceil(width / dotSpacing);
      const rows = Math.ceil(height / dotSpacing);
      for (let c = 0; c <= cols; c++) {
        for (let r = 0; r <= rows; r++) {
          context.beginPath();
          context.arc(c * dotSpacing, r * dotSpacing, 1, 0, Math.PI * 2);
          context.fill();
        }
      }
    }

    // 3. Fixed background image (if provided via ImageMarkupEditor)
    if (backgroundImage) {
      context.drawImage(backgroundImage, 0, 0, width, height);
    }

    // 4. Render Canvas Images
    for (const img of imagesRef.current) {
      const imgW = img.widthRatio * width;
      const imgH = imgW / img.aspectRatio;
      const imgX = img.centerX * width - imgW / 2;
      const imgY = img.centerY * height - imgH / 2;

      context.drawImage(img.element, imgX, imgY, imgW, imgH);

      // If selected in select mode: render bounding box and corner resize handles
      if (modeRef.current === "select" && selectedIdsRef.current.has(img.id)) {
        context.save();
        context.strokeStyle = "#3b82f6";
        context.lineWidth = 1.5;
        context.strokeRect(imgX, imgY, imgW, imgH);

        // 4 Corner resize handles (8x8 white square with blue border)
        const handleSize = 8;
        const half = handleSize / 2;
        const corners = [
          { x: imgX, y: imgY },
          { x: imgX + imgW, y: imgY },
          { x: imgX, y: imgY + imgH },
          { x: imgX + imgW, y: imgY + imgH },
        ];

        context.fillStyle = "#ffffff";
        for (const corner of corners) {
          context.fillRect(corner.x - half, corner.y - half, handleSize, handleSize);
          context.strokeRect(corner.x - half, corner.y - half, handleSize, handleSize);
        }
        context.restore();
      }
    }

    // 5. Render Strokes
    const allStrokes = currentStrokeRef.current
      ? [...strokesRef.current, currentStrokeRef.current]
      : strokesRef.current;

    paintStrokes(context, allStrokes, width, height, 1);

    // 6. Stroke selection indicators in select mode
    if (modeRef.current === "select") {
      for (const stroke of strokesRef.current) {
        if (selectedIdsRef.current.has(stroke.id) && stroke.points.length > 0) {
          let minX = 1;
          let minY = 1;
          let maxX = 0;
          let maxY = 0;
          for (const p of stroke.points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
          context.save();
          context.strokeStyle = "rgba(59, 130, 246, 0.75)";
          context.lineWidth = 1;
          context.setLineDash([3, 3]);
          context.strokeRect(
            minX * width - 4,
            minY * height - 4,
            (maxX - minX) * width + 8,
            (maxY - minY) * height + 8,
          );
          context.restore();
        }
      }
    }

    // 7. Marquee selection rectangle
    if (marqueeRef.current) {
      const m = marqueeRef.current;
      const x1 = Math.min(m.startX, m.currentX) * width;
      const y1 = Math.min(m.startY, m.currentY) * height;
      const w = Math.abs(m.currentX - m.startX) * width;
      const h = Math.abs(m.currentY - m.startY) * height;

      context.save();
      context.fillStyle = "rgba(59, 130, 246, 0.12)";
      context.fillRect(x1, y1, w, h);
      context.strokeStyle = "rgba(59, 130, 246, 0.85)";
      context.lineWidth = 1;
      context.setLineDash([4, 4]);
      context.strokeRect(x1, y1, w, h);
      context.restore();
    }

    context.restore();
  }, [canvasRef, backgroundImage, theme, transparentBackground]);

  const scheduleRedraw = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      redraw();
    });
  }, [redraw]);

  const updateDimensions = useCallback(
    (cssWidth: number, cssHeight: number) => {
      const canvas = canvasRef.current;
      if (!canvas || cssWidth <= 0 || cssHeight <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      dimensionsRef.current = { width: cssWidth, height: cssHeight, dpr };
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      redraw();
    },
    [canvasRef, redraw],
  );

  const getPoint = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      };
    },
    [canvasRef],
  );

  // Add an interactive image onto the canvas
  const addImage = useCallback(
    (
      fileOrImg: File | HTMLImageElement,
      atPos?: Point,
      customWidthRatio?: number,
      autoSelect = true,
    ) => {
      const processElement = (img: HTMLImageElement, src: string) => {
        pushHistory();
        const { width, height } = dimensionsRef.current;
        const naturalW = img.naturalWidth || 400;
        const naturalH = img.naturalHeight || 300;
        const aspect = naturalW / naturalH;

        let widthRatio: number;
        if (typeof customWidthRatio === "number" && customWidthRatio > 0) {
          widthRatio = Math.max(0.1, Math.min(0.96, customWidthRatio));
        } else {
          // Default size: fit up to 60% of canvas
          const maxW = width * 0.6;
          const maxH = height * 0.6;
          let initialW = maxW;
          if (initialW / aspect > maxH) {
            initialW = maxH * aspect;
          }
          widthRatio = Math.max(0.15, Math.min(0.85, initialW / Math.max(1, width)));
        }

        const centerX = atPos ? atPos.x : 0.5;
        const centerY = atPos ? atPos.y : 0.5;
        const id = `img-${crypto.randomUUID()}`;

        const newImage: CanvasImage = {
          id,
          element: img,
          src,
          centerX,
          centerY,
          widthRatio,
          aspectRatio: aspect,
        };

        setImages((prev) => [...prev, newImage]);
        if (autoSelect) {
          setSelectedIds(new Set([id]));
          setModeState("select");
        }
        scheduleRedraw();
      };

      if (fileOrImg instanceof HTMLImageElement) {
        processElement(fileOrImg, fileOrImg.src);
      } else {
        const url = URL.createObjectURL(fileOrImg);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => processElement(img, url);
        img.src = url;
      }
    },
    [pushHistory, scheduleRedraw],
  );

  // Hit test helper for corner resize handles
  const hitTestResizeHandle = useCallback(
    (pt: Point): { imageId: string; handle: ResizeHandle } | null => {
      const { width, height } = dimensionsRef.current;
      const pxX = pt.x * width;
      const pxY = pt.y * height;
      const handleRadius = 10; // Clickable radius around corner

      for (const img of imagesRef.current) {
        if (!selectedIdsRef.current.has(img.id)) continue;
        const imgW = img.widthRatio * width;
        const imgH = imgW / img.aspectRatio;
        const left = img.centerX * width - imgW / 2;
        const top = img.centerY * height - imgH / 2;
        const right = left + imgW;
        const bottom = top + imgH;

        const handles: { handle: ResizeHandle; x: number; y: number }[] = [
          { handle: "tl", x: left, y: top },
          { handle: "tr", x: right, y: top },
          { handle: "bl", x: left, y: bottom },
          { handle: "br", x: right, y: bottom },
        ];

        for (const h of handles) {
          const dx = pxX - h.x;
          const dy = pxY - h.y;
          if (dx * dx + dy * dy <= handleRadius * handleRadius) {
            return { imageId: img.id, handle: h.handle };
          }
        }
      }
      return null;
    },
    [],
  );

  // Hit test helper for images
  const hitTestImage = useCallback((pt: Point): string | null => {
    const { width, height } = dimensionsRef.current;
    const pxX = pt.x * width;
    const pxY = pt.y * height;

    // Check in reverse order so top-most image is picked first
    for (let i = imagesRef.current.length - 1; i >= 0; i--) {
      const img = imagesRef.current[i];
      const imgW = img.widthRatio * width;
      const imgH = imgW / img.aspectRatio;
      const left = img.centerX * width - imgW / 2;
      const top = img.centerY * height - imgH / 2;

      if (pxX >= left && pxX <= left + imgW && pxY >= top && pxY <= top + imgH) {
        return img.id;
      }
    }
    return null;
  }, []);

  // Hit test helper for strokes
  const hitTestStroke = useCallback((pt: Point, thresholdPx = 8): string | null => {
    const { width, height } = dimensionsRef.current;
    const pxX = pt.x * width;
    const pxY = pt.y * height;

    for (let i = strokesRef.current.length - 1; i >= 0; i--) {
      const s = strokesRef.current[i];
      for (const p of s.points) {
        const dx = p.x * width - pxX;
        const dy = p.y * height - pxY;
        const thresh = Math.max(thresholdPx, s.size * 1.5);
        if (dx * dx + dy * dy <= thresh * thresh) {
          return s.id;
        }
      }
    }
    return null;
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (activePointerIdRef.current !== null) return;
      const pt = getPoint(event);
      if (!pt) return;

      activePointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStartPointRef.current = pt;

      const currentMode = modeRef.current;

      if (currentMode === "select") {
        // Check 1: Hit test resize handle on a selected image
        const handleHit = hitTestResizeHandle(pt);
        if (handleHit) {
          pushHistory();
          dragTypeRef.current = "resize";
          resizeImageIdRef.current = handleHit.imageId;
          resizeHandleRef.current = handleHit.handle;
          const targetImg = imagesRef.current.find((img) => img.id === handleHit.imageId);
          if (targetImg) {
            dragInitialBoundsRef.current.set(targetImg.id, {
              centerX: targetImg.centerX,
              centerY: targetImg.centerY,
              widthRatio: targetImg.widthRatio,
            });
          }
          return;
        }

        // Check 2: Hit test image
        const imageHitId = hitTestImage(pt);
        if (imageHitId) {
          pushHistory();
          dragTypeRef.current = "move";
          const newSelected = selectedIdsRef.current.has(imageHitId)
            ? new Set(selectedIdsRef.current)
            : new Set([imageHitId]);
          setSelectedIds(newSelected);
          selectedIdsRef.current = newSelected;

          // Record initial positions for smooth dragging
          dragInitialBoundsRef.current.clear();
          for (const img of imagesRef.current) {
            if (newSelected.has(img.id)) {
              dragInitialBoundsRef.current.set(img.id, {
                centerX: img.centerX,
                centerY: img.centerY,
                widthRatio: img.widthRatio,
              });
            }
          }
          scheduleRedraw();
          return;
        }

        // Check 3: Hit test stroke
        const strokeHitId = hitTestStroke(pt);
        if (strokeHitId) {
          pushHistory();
          dragTypeRef.current = "move";
          const newSelected = selectedIdsRef.current.has(strokeHitId)
            ? new Set(selectedIdsRef.current)
            : new Set([strokeHitId]);
          setSelectedIds(newSelected);
          selectedIdsRef.current = newSelected;

          dragInitialBoundsRef.current.clear();
          for (const s of strokesRef.current) {
            if (newSelected.has(s.id)) {
              dragInitialBoundsRef.current.set(s.id, {
                centerX: 0,
                centerY: 0,
                widthRatio: 0,
                points: s.points.map((p) => ({ ...p })),
              });
            }
          }
          scheduleRedraw();
          return;
        }

        // Clicked on empty canvas -> Marquee selection
        dragTypeRef.current = "marquee";
        setSelectedIds(new Set());
        selectedIdsRef.current = new Set();
        marqueeRef.current = {
          startX: pt.x,
          startY: pt.y,
          currentX: pt.x,
          currentY: pt.y,
        };
        scheduleRedraw();
        return;
      }

      if (currentMode === "eraser") {
        // Instant erase on click
        const strokeHit = hitTestStroke(pt, 12);
        if (strokeHit) {
          pushHistory();
          setStrokes((prev) => prev.filter((s) => s.id !== strokeHit));
        }
        dragTypeRef.current = "draw";
        scheduleRedraw();
        return;
      }

      // Pen or Highlighter drawing
      dragTypeRef.current = "draw";
      currentStrokeRef.current = {
        id: `stroke-${crypto.randomUUID()}`,
        points: [pt],
        color,
        size,
        mode: currentMode,
      };
      scheduleRedraw();
    },
    [
      color,
      getPoint,
      hitTestImage,
      hitTestResizeHandle,
      hitTestStroke,
      pushHistory,
      scheduleRedraw,
      size,
    ],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      const pt = getPoint(event);
      if (!pt) return;

      const { width, height } = dimensionsRef.current;
      const dragType = dragTypeRef.current;

      if (dragType === "resize" && resizeImageIdRef.current && resizeHandleRef.current) {
        const imgId = resizeImageIdRef.current;
        const initial = dragInitialBoundsRef.current.get(imgId);
        const handle = resizeHandleRef.current;
        if (!initial) return;

        setImages((prev) =>
          prev.map((img) => {
            if (img.id !== imgId) return img;
            const initW = initial.widthRatio * width;
            const initH = initW / img.aspectRatio;
            const initLeft = initial.centerX * width - initW / 2;
            const initTop = initial.centerY * height - initH / 2;
            const initRight = initLeft + initW;
            const initBottom = initTop + initH;

            const curPxX = pt.x * width;
            let newW = initW;

            if (handle === "br") {
              newW = Math.max(40, curPxX - initLeft);
              const newH = newW / img.aspectRatio;
              return {
                ...img,
                widthRatio: newW / width,
                centerX: (initLeft + newW / 2) / width,
                centerY: (initTop + newH / 2) / height,
              };
            } else if (handle === "bl") {
              newW = Math.max(40, initRight - curPxX);
              const newH = newW / img.aspectRatio;
              return {
                ...img,
                widthRatio: newW / width,
                centerX: (initRight - newW / 2) / width,
                centerY: (initTop + newH / 2) / height,
              };
            } else if (handle === "tr") {
              newW = Math.max(40, curPxX - initLeft);
              const newH = newW / img.aspectRatio;
              return {
                ...img,
                widthRatio: newW / width,
                centerX: (initLeft + newW / 2) / width,
                centerY: (initBottom - newH / 2) / height,
              };
            } else if (handle === "tl") {
              newW = Math.max(40, initRight - curPxX);
              const newH = newW / img.aspectRatio;
              return {
                ...img,
                widthRatio: newW / width,
                centerX: (initRight - newW / 2) / width,
                centerY: (initBottom - newH / 2) / height,
              };
            }
            return img;
          }),
        );
        scheduleRedraw();
        return;
      }

      if (dragType === "move") {
        const dx = pt.x - dragStartPointRef.current.x;
        const dy = pt.y - dragStartPointRef.current.y;

        // Move selected images
        setImages((prev) =>
          prev.map((img) => {
            if (!selectedIdsRef.current.has(img.id)) return img;
            const init = dragInitialBoundsRef.current.get(img.id);
            if (!init) return img;
            return {
              ...img,
              centerX: Math.max(0, Math.min(1, init.centerX + dx)),
              centerY: Math.max(0, Math.min(1, init.centerY + dy)),
            };
          }),
        );

        // Move selected strokes
        setStrokes((prev) =>
          prev.map((s) => {
            if (!selectedIdsRef.current.has(s.id)) return s;
            const init = dragInitialBoundsRef.current.get(s.id);
            if (!init?.points) return s;
            return {
              ...s,
              points: init.points.map((p) => ({
                x: Math.max(0, Math.min(1, p.x + dx)),
                y: Math.max(0, Math.min(1, p.y + dy)),
              })),
            };
          }),
        );
        scheduleRedraw();
        return;
      }

      if (dragType === "marquee" && marqueeRef.current) {
        marqueeRef.current.currentX = pt.x;
        marqueeRef.current.currentY = pt.y;

        const m = marqueeRef.current;
        const minX = Math.min(m.startX, m.currentX);
        const maxX = Math.max(m.startX, m.currentX);
        const minY = Math.min(m.startY, m.currentY);
        const maxY = Math.max(m.startY, m.currentY);

        const newSelected = new Set<string>();

        // Check images intersecting marquee
        for (const img of imagesRef.current) {
          const imgW = img.widthRatio;
          const imgH = (img.widthRatio * width) / img.aspectRatio / height;
          const imgMinX = img.centerX - imgW / 2;
          const imgMaxX = img.centerX + imgW / 2;
          const imgMinY = img.centerY - imgH / 2;
          const imgMaxY = img.centerY + imgH / 2;

          const overlaps =
            minX <= imgMaxX && maxX >= imgMinX && minY <= imgMaxY && maxY >= imgMinY;
          if (overlaps) {
            newSelected.add(img.id);
          }
        }

        // Check strokes intersecting marquee
        for (const s of strokesRef.current) {
          const inBounds = s.points.some(
            (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY,
          );
          if (inBounds) {
            newSelected.add(s.id);
          }
        }

        setSelectedIds(newSelected);
        selectedIdsRef.current = newSelected;
        scheduleRedraw();
        return;
      }

      if (modeRef.current === "eraser") {
        const hit = hitTestStroke(pt, 12);
        if (hit) {
          setStrokes((prev) => prev.filter((s) => s.id !== hit));
          scheduleRedraw();
        }
        return;
      }

      // Drawing stroke
      if (currentStrokeRef.current) {
        const pts = currentStrokeRef.current.points;
        const last = pts[pts.length - 1];
        if (last) {
          const dx = (pt.x - last.x) * width;
          const dy = (pt.y - last.y) * height;
          if (dx * dx + dy * dy < 4) return;
        }
        pts.push(pt);
        scheduleRedraw();
      }
    },
    [getPoint, hitTestStroke, scheduleRedraw],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      activePointerIdRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignored if capture already lost
      }

      if (currentStrokeRef.current && currentStrokeRef.current.points.length > 0) {
        pushHistory();
        const stroke = currentStrokeRef.current;
        currentStrokeRef.current = null;
        setStrokes((prev) => [...prev, stroke]);
      } else {
        currentStrokeRef.current = null;
      }

      marqueeRef.current = null;
      dragTypeRef.current = "none";
      resizeHandleRef.current = null;
      resizeImageIdRef.current = null;
      scheduleRedraw();
    },
    [pushHistory, scheduleRedraw],
  );

  // Delete all selected items (strokes and images)
  const deleteSelected = useCallback(() => {
    if (selectedIdsRef.current.size === 0) return;
    pushHistory();
    const toDelete = selectedIdsRef.current;
    setImages((prev) => prev.filter((img) => !toDelete.has(img.id)));
    setStrokes((prev) => prev.filter((s) => !toDelete.has(s.id)));
    setSelectedIds(new Set());
    selectedIdsRef.current = new Set();
    scheduleRedraw();
  }, [pushHistory, scheduleRedraw]);

  // Select all items
  const selectAll = useCallback(() => {
    const allIds = new Set<string>();
    for (const img of imagesRef.current) allIds.add(img.id);
    for (const s of strokesRef.current) allIds.add(s.id);
    setSelectedIds(allIds);
    selectedIdsRef.current = allIds;
    setModeState("select");
    scheduleRedraw();
  }, [scheduleRedraw]);

  // Undo / Redo
  const undo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoHistory((r) => [
      ...r,
      { strokes: [...strokesRef.current], images: [...imagesRef.current] },
    ]);
    setHistory((h) => h.slice(0, -1));
    setStrokes(previous.strokes);
    setImages(previous.images);
    setSelectedIds(new Set());
    selectedIdsRef.current = new Set();
    scheduleRedraw();
  }, [history, scheduleRedraw]);

  const redo = useCallback(() => {
    if (redoHistory.length === 0) return;
    const next = redoHistory[redoHistory.length - 1];
    setHistory((h) => [
      ...h,
      { strokes: [...strokesRef.current], images: [...imagesRef.current] },
    ]);
    setRedoHistory((r) => r.slice(0, -1));
    setStrokes(next.strokes);
    setImages(next.images);
    setSelectedIds(new Set());
    selectedIdsRef.current = new Set();
    scheduleRedraw();
  }, [redoHistory, scheduleRedraw]);

  const clear = useCallback(() => {
    if (!strokesRef.current.length && !imagesRef.current.length) return;
    pushHistory();
    setStrokes([]);
    setImages([]);
    setSelectedIds(new Set());
    selectedIdsRef.current = new Set();
    currentStrokeRef.current = null;
    scheduleRedraw();
  }, [pushHistory, scheduleRedraw]);

  // High-res offscreen composite exporter for "Send to Space" and "Export PNG"
  const exportBlob = useCallback(
    async (
      exportWidth?: number,
      exportHeight?: number,
      type = "image/png",
      quality = 0.95,
    ): Promise<Blob | null> => {
      const { width: currentW, height: currentH } = dimensionsRef.current;
      const outW = exportWidth || currentW * 2;
      const outH = exportHeight || currentH * 2;
      if (outW <= 0 || outH <= 0) return null;

      const offscreen = document.createElement("canvas");
      offscreen.width = outW;
      offscreen.height = outH;
      const ctx = offscreen.getContext("2d");
      if (!ctx) return null;

      // 1. Background fill
      const isDark = theme === "dark";
      ctx.fillStyle = isDark ? "#141416" : "#ffffff";
      ctx.fillRect(0, 0, outW, outH);

      // 2. Fixed background (ImageMarkupEditor)
      if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0, outW, outH);
      }

      // 3. Images in z-order
      for (const img of imagesRef.current) {
        const imgW = img.widthRatio * outW;
        const imgH = imgW / img.aspectRatio;
        const imgX = img.centerX * outW - imgW / 2;
        const imgY = img.centerY * outH - imgH / 2;
        ctx.drawImage(img.element, imgX, imgY, imgW, imgH);
      }

      // 4. Strokes on top of images
      paintStrokes(ctx, strokesRef.current, outW, outH, outW / currentW);

      return new Promise<Blob | null>((resolve) => {
        offscreen.toBlob(resolve, type, quality);
      });
    },
    [backgroundImage, theme],
  );

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIdsRef.current.size > 0) {
          e.preventDefault();
          deleteSelected();
        }
      } else if (e.key === "Escape") {
        setSelectedIds(new Set());
        selectedIdsRef.current = new Set();
        scheduleRedraw();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key.toLowerCase() === "v") setModeState("select");
        else if (e.key.toLowerCase() === "p") setModeState("pen");
        else if (e.key.toLowerCase() === "h") setModeState("highlighter");
        else if (e.key.toLowerCase() === "e") setModeState("eraser");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteSelected, redo, selectAll, scheduleRedraw, undo]);

  // Sync theme changes to default stroke color if user hasn't explicitly changed it
  useEffect(() => {
    if (!initialColor) {
      setColor(theme === "dark" ? "#ffffff" : "#18181b");
    }
    scheduleRedraw();
  }, [theme, initialColor, scheduleRedraw]);

  // Redraw when state updates
  useEffect(() => {
    scheduleRedraw();
  }, [strokes, images, selectedIds, mode, scheduleRedraw]);

  return {
    mode,
    setMode: setModeState,
    strokes,
    images,
    selectedIds,
    setSelectedIds,
    color,
    setColor,
    size,
    setSize,
    // Backwards compatibility for ImageMarkupEditor
    eraser: mode === "eraser",
    setEraser: (isEraser: boolean) => setModeState(isEraser ? "eraser" : "pen"),
    addImage,
    deleteSelected,
    selectAll,
    undo,
    redo,
    clear,
    redraw,
    updateDimensions,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    exportBlob,
    canUndo: history.length > 0,
    canRedo: redoHistory.length > 0,
    redoStack: redoHistory,
    hasContent: strokes.length > 0 || images.length > 0 || Boolean(backgroundImage),
  };
}
