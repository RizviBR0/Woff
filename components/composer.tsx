"use client";

import { useState, useRef } from "react";
import { Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createEntry } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { type Entry } from "./entry-card";
import { DrawingCanvas } from "./drawing-canvas";

interface ComposerProps {
  spaceId: string;
  onNewEntry: (entry: Entry) => void;
  centered: boolean;
}

export function Composer({ spaceId, onNewEntry, centered }: ComposerProps) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const entry = await createEntry(spaceId, "text", text.trim());
      onNewEntry(entry);
      setText("");

      // Reset textarea height after clearing text
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = "32px";
      }
    } catch (error) {
      console.error("Failed to create entry:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleDrawing = () => {
    setPopoverOpen(false);
    setDrawingOpen(true);
  };

  const handleDrawingSave = async (dataUrl: string) => {
    try {
      setIsSubmitting(true);
      // Store the drawing as a text entry with the data URL
      // In a real app, you'd upload the image to storage and create an image entry
      const entry = await createEntry(spaceId, "text", `DRAWING:${dataUrl}`);
      onNewEntry(entry);
      setDrawingOpen(false);
    } catch (error) {
      console.error("Failed to save drawing:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCamera = () => {
    setPopoverOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleNewNote = async () => {
    setPopoverOpen(false);
    try {
      setIsSubmitting(true);
      // Generate a random note slug and public code
      const noteSlug = Math.random().toString(36).substring(2, 8);
      const publicCode = Math.random()
        .toString(36)
        .substring(2, 7)
        .toUpperCase();

      // Create a chat entry for the note
      const entry = await createEntry(
        spaceId,
        "text",
        `NOTE:${noteSlug}:${publicCode}:Untitled Note`
      );
      onNewEntry(entry);

      // Navigate to the note editor
      window.location.href = `/n/${noteSlug}`;
    } catch (error) {
      console.error("Failed to create note entry:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageCapture = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if it's an image file
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    try {
      setIsSubmitting(true);

      // Convert image file to data URL
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          try {
            // Store the image as a text entry with the data URL (similar to drawings)
            const entry = await createEntry(
              spaceId,
              "text",
              `PHOTO:${dataUrl}`
            );
            onNewEntry(entry);
          } catch (error) {
            console.error("Failed to save photo:", error);
          }
        }
        setIsSubmitting(false);
      };

      reader.onerror = () => {
        console.error("Failed to read image file");
        setIsSubmitting(false);
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Failed to process image:", error);
      setIsSubmitting(false);
    }

    // Reset the input
    event.target.value = "";
  };

  if (centered) {
    // Large centered composer for first post
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write something..."
            className="min-h-[120px] resize-none rounded-2xl border border-input bg-background p-6 text-lg shadow-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            disabled={isSubmitting}
          />

          {/* Plus button */}
          <div className="absolute right-4 top-4">
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2">
                <div className="space-y-1">
                  <button
                    onClick={handleNewNote}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    📝 New Note
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                    �📄 File
                  </button>
                  <button
                    onClick={handleCamera}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    📷 Camera
                  </button>
                  <button
                    onClick={handleDrawing}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    ✏️ Draw
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DrawingCanvas
          isOpen={drawingOpen}
          onClose={() => setDrawingOpen(false)}
          onSave={handleDrawingSave}
        />

        {/* Hidden file input for camera/image capture */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageCapture}
          className="hidden"
        />
      </form>
    );
  }

  // Compact bottom composer with dynamic border radius
  const isExpanded = text.includes("\n") || text.length > 50;

  return (
    <div
      className={`flex items-start gap-2 bg-muted/20 border border-border/40 px-2 py-1.5 shadow-sm backdrop-blur-sm transition-all duration-200 ${
        isExpanded ? "rounded-2xl" : "rounded-full"
      }`}
    >
      {/* Plus button */}
      <div className="flex-shrink-0 pt-0.5">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full hover:bg-accent/60"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2 rounded-xl" side="top">
            <div className="space-y-0.5">
              <button
                onClick={handleNewNote}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent"
              >
                📝 New Note
              </button>
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                �📄 File
              </button>
              <button
                onClick={handleCamera}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent"
              >
                📷 Camera
              </button>
              <button
                onClick={handleDrawing}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent"
              >
                ✏️ Draw
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Input area */}
      <div className="flex-1 min-w-0 relative">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write something..."
          className="min-h-[32px] max-h-24 resize-none border-0 bg-transparent px-3 py-1.5 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
          disabled={isSubmitting}
          rows={1}
          style={{
            height: "auto",
            minHeight: "32px",
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = Math.min(target.scrollHeight, 96) + "px";
          }}
        />
      </div>

      {/* Send button */}
      {text.trim() && (
        <div className="flex-shrink-0 pt-0.5">
          <Button
            type="submit"
            size="icon"
            disabled={isSubmitting}
            className="h-7 w-7 rounded-full bg-primary hover:bg-primary/90 transition-all duration-200"
            onClick={handleSubmit}
          >
            <Send className="h-3 w-3" />
          </Button>
        </div>
      )}

      <DrawingCanvas
        isOpen={drawingOpen}
        onClose={() => setDrawingOpen(false)}
        onSave={handleDrawingSave}
      />

      {/* Hidden file input for camera/image capture */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageCapture}
        className="hidden"
      />
    </div>
  );
}
