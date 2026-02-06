"use client";

import dynamic from "next/dynamic";
import { ComponentType } from "react";
import { Skeleton } from "./skeleton";

// Loading fallback for note editor
const NoteEditorLoading = () => (
  <div className="min-h-screen bg-background p-4">
    <div className="max-w-4xl mx-auto space-y-4">
      <Skeleton className="h-12 w-3/4" />
      <Skeleton className="h-96 w-full" />
    </div>
  </div>
);

// Loading fallback for drawing canvas
const DrawingCanvasLoading = () => (
  <div className="w-full aspect-video bg-muted/30 rounded-lg flex items-center justify-center">
    <div className="text-muted-foreground text-sm">Loading canvas...</div>
  </div>
);

// Dynamically import heavy components with loading states
export const DynamicNoteEditor = dynamic(
  () => import("@/components/note-editor").then((mod) => mod.NoteEditor),
  {
    loading: NoteEditorLoading,
    ssr: false, // Drawing/canvas components don't need SSR
  },
);

export const DynamicDrawingCanvas = dynamic(
  () => import("@/components/drawing-canvas").then((mod) => mod.DrawingCanvas),
  {
    loading: DrawingCanvasLoading,
    ssr: false,
  },
);

// Dynamic import for JSZip (only when needed)
export const loadJSZip = () => import("jszip");

// Dynamic import for jspdf (only when needed)
export const loadJsPDF = () => import("jspdf");

// Dynamic import for html2canvas (only when needed)
export const loadHtml2Canvas = () => import("html2canvas");
