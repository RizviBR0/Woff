"use client";

import { useState, useEffect } from "react";
import { X, ExternalLink, Copy, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getNote } from "@/lib/actions";

interface NotePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  noteSlug: string;
  publicCode: string;
  noteTitle: string;
}

interface NoteData {
  title: string;
  content: string;
  fontFamily: "system" | "serif" | "mono";
}

export function NotePreview({
  isOpen,
  onClose,
  noteSlug,
  publicCode,
  noteTitle,
}: NotePreviewProps) {
  const [note, setNote] = useState<NoteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Font family options
  const fontFamilies = {
    system: "font-sans",
    serif: "font-serif",
    mono: "font-mono",
  };

  useEffect(() => {
    if (isOpen && !note) {
      const loadNote = async () => {
        setIsLoading(true);
        try {
          const noteData = await getNote(noteSlug);
          
          if (noteData) {
            setNote({
              title: noteData.title,
              content: noteData.content,
              fontFamily: noteData.font_family as "system" | "serif" | "mono",
            });
          }
        } catch (error) {
          console.error("Error loading note:", error);
        } finally {
          setIsLoading(false);
        }
      };

      loadNote();
    }
    
    // Reset note data when modal closes
    if (!isOpen && note) {
      setNote(null);
    }
  }, [isOpen, note, noteSlug]);

  // Handle keyboard events for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  const copyLink = () => {
    navigator.clipboard.writeText(`https://woff.space/v/${publicCode}`);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">{noteTitle}</h2>
              <p className="text-sm text-muted-foreground">Note Preview</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : note ? (
            <div
              className={cn(
                "prose prose-sm max-w-none",
                fontFamilies[note.fontFamily],
                "prose-headings:scroll-mt-4 prose-h1:text-xl prose-h2:text-lg prose-h3:text-base",
                "prose-p:leading-relaxed prose-li:my-0.5",
                "dark:prose-invert"
              )}
              dangerouslySetInnerHTML={{ __html: note.content }}
            />
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                Failed to load note preview
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-muted/30">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyLink}
              className="gap-2"
            >
              <Copy className="h-3 w-3" />
              Copy Link
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/v/${publicCode}`, "_blank")}
              className="gap-2"
            >
              <ExternalLink className="h-3 w-3" />
              Open Note
            </Button>
            <Button
              size="sm"
              onClick={() => window.open(`/n/${noteSlug}`, "_blank")}
              className="gap-2"
            >
              <FileText className="h-3 w-3" />
              Edit Note
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
