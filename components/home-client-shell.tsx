"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";
import { createSpace } from "@/lib/actions";

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
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const dragCounterRef = useRef(0);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.types?.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        setIsCreatingSpace(true);
        try {
          // Save files globally for the newly created space to pick up
          (window as any).__pending_dragged_files = Array.from(files);

          // Create new space automatically
          const space = await createSpace();

          // Navigate to the space
          router.push(`/${space.slug}`);
        } catch (err) {
          console.error("Failed to auto-create space on drop:", err);
          setIsCreatingSpace(false);
        }
      }
    },
    [router]
  );

  useEffect(() => {
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  if (!mounted) return null;

  return (
    <>
      {/* Drag overlay component */}
      {isDragging &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm transition-all duration-200">
            <div className="flex flex-col items-center gap-4 p-10 rounded-3xl border-2 border-dashed border-primary/50 bg-primary/5 dark:bg-primary/10 shadow-2xl shadow-primary/10 animate-in fade-in zoom-in-95 duration-200">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                <Upload className="h-8 w-8 text-primary" />
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
          <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/90 backdrop-blur-md transition-all duration-300">
            <div className="flex flex-col items-center gap-6 p-10 max-w-sm text-center">
              <div className="h-20 w-20 rounded-3xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center animate-bounce shadow-xl shadow-primary/10">
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-foreground">
                  Creating Space
                </h3>
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
