"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Upload, Loader2 } from "lucide-react";
import { useCreateSpace } from "@/lib/hooks/use-create-space";

function hasFilesTransfer(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types || []).includes("Files");
}

/**
 * Client-only shell for the homepage that handles:
 * - Global drag-and-drop to create a space with files
 * - Space creation loader overlay
 *
 * Extracted from page.tsx so the landing page can be a server component
 * for faster first paint.
 */
export function HomeClientShell() {
  const [mounted, setMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { isCreating: isCreatingSpace, createAndNavigate } = useCreateSpace();
  const dragCounterRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const resetDrag = useCallback(() => {
    dragCounterRef.current = 0;
    setIsDragging(false);
  }, []);

  const handleDragEnter = useCallback((e: DragEvent) => {
    if (!hasFilesTransfer(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    if (!hasFilesTransfer(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0 || e.relatedTarget === null) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    if (!hasFilesTransfer(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      if (!hasFilesTransfer(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        // Save files globally for the newly created space to pick up
        (window as unknown as { __pending_dragged_files?: File[] }).__pending_dragged_files =
          Array.from(files);
        const created = await createAndNavigate();
        if (!created) {
          delete (window as unknown as { __pending_dragged_files?: File[] })
            .__pending_dragged_files;
        }
      }
    },
    [createAndNavigate]
  );

  useEffect(() => {
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    window.addEventListener("dragend", resetDrag);
    window.addEventListener("blur", resetDrag);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("dragend", resetDrag);
      window.removeEventListener("blur", resetDrag);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop, resetDrag]);

  if (!mounted) return null;

  return (
    <>
      {/* Drag overlay component */}
      {isDragging &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm transition-all duration-200">
            <div className="flex flex-col items-center gap-4 p-10 rounded-3xl border-2 border-dashed border-primary/50 bg-primary/5 dark:bg-primary/10 shadow-2xl shadow-primary/10 animate-in fade-in zoom-in-95 duration-200">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                <Upload className="h-8 w-8 text-primary" aria-hidden="true" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-foreground">
                  Drop here to share instantly
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create a new secure space and upload files
                </p>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Space creation loader overlay */}
      {isCreatingSpace &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/90 backdrop-blur-md transition-all duration-300"
          >
            <div className="flex flex-col items-center gap-6 p-10 max-w-sm text-center">
              <div className="h-20 w-20 rounded-3xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center animate-bounce shadow-xl shadow-primary/10">
                <Loader2 className="h-10 w-10 text-primary animate-spin" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <p className="text-2xl font-bold text-foreground">
                  Creating Space
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Setting up your secure sharing room and preparing files for
                  upload...
                </p>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
