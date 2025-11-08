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
    // Large centered composer for first post - Enhanced Design
    return (
      <div className="w-full max-w-3xl mx-auto">
        {/* Welcome Message */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-3">
            Welcome to your space
          </h2>
          <p className="text-muted-foreground">
            Start by sharing a thought, creating a note, or adding media
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative group">
            {/* Main Input Area */}
            <div className="relative overflow-hidden rounded-3xl border-2 border-border/60 dark:border-border/80 bg-background/80 dark:bg-background/95 backdrop-blur-sm shadow-lg shadow-black/10 dark:shadow-black/40 hover:shadow-xl hover:shadow-black/15 dark:hover:shadow-black/50 transition-all duration-300 group-focus-within:border-primary/50 group-focus-within:shadow-xl group-focus-within:shadow-black/15 dark:group-focus-within:shadow-black/50 ring-1 ring-inset ring-white/5 dark:ring-white/10">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What's on your mind?"
                className="min-h-[140px] resize-none border-0 bg-transparent p-8 text-lg leading-relaxed placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
                disabled={isSubmitting}
              />

              {/* Gradient overlay for visual depth */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between mt-4 px-2">
              {/* Left: Add Content Options */}
              <div className="flex items-center gap-2">
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-10 px-4 rounded-full border border-border/60 dark:border-border/80 bg-background/90 dark:bg-background/95 hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 shadow-sm shadow-black/10 dark:shadow-black/30 hover:shadow-md hover:shadow-black/15 dark:hover:shadow-black/40"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add content
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-56 p-3 rounded-2xl border-2 shadow-xl shadow-black/10 dark:shadow-black/50"
                    side="top"
                  >
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 pb-1">
                        Create
                      </div>
                      <button
                        onClick={handleNewNote}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-accent/80 transition-colors group"
                      >
                        <span className="text-lg">📝</span>
                        <div className="text-left">
                          <div className="font-medium">Rich Text Note</div>
                          <div className="text-xs text-muted-foreground">
                            Create a formatted document
                          </div>
                        </div>
                      </button>
                      <button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-accent/80 transition-colors group">
                        <span className="text-lg">📄</span>
                        <div className="text-left">
                          <div className="font-medium">File Upload</div>
                          <div className="text-xs text-muted-foreground">
                            Share documents & files
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={handleCamera}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-accent/80 transition-colors group"
                      >
                        <span className="text-lg">📷</span>
                        <div className="text-left">
                          <div className="font-medium">Photo</div>
                          <div className="text-xs text-muted-foreground">
                            Capture or upload image
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={handleDrawing}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-accent/80 transition-colors group"
                      >
                        <span className="text-lg">✏️</span>
                        <div className="text-left">
                          <div className="font-medium">Drawing</div>
                          <div className="text-xs text-muted-foreground">
                            Create with digital canvas
                          </div>
                        </div>
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Right: Send Button */}
              {text.trim() && (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-10 px-6 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-black/20 dark:shadow-black/40 hover:shadow-xl hover:shadow-black/25 dark:hover:shadow-black/50 transition-all duration-200 font-medium"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {isSubmitting ? "Posting..." : "Post"}
                </Button>
              )}
            </div>

            {/* Shortcut Badges */}
            <div className="flex items-center justify-center gap-3 mt-8 px-2">
              <button
                onClick={handleNewNote}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 transition-all duration-200 border border-blue-200/60 dark:border-blue-800/60 hover:border-blue-300 dark:hover:border-blue-700 shadow-sm hover:shadow-lg hover:shadow-blue-500/20 hover:-translate-y-1 backdrop-blur-sm"
              >
                <span className="text-base group-hover:scale-110 transition-transform duration-200">
                  📝
                </span>
                <span>Create note</span>
              </button>
              <button
                onClick={handleCamera}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 transition-all duration-200 border border-green-200/60 dark:border-green-800/60 hover:border-green-300 dark:hover:border-green-700 shadow-sm hover:shadow-lg hover:shadow-green-500/20 hover:-translate-y-1 backdrop-blur-sm"
              >
                <span className="text-base group-hover:scale-110 transition-transform duration-200">
                  📷
                </span>
                <span>Add image</span>
              </button>
              <button
                onClick={handleDrawing}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 transition-all duration-200 border border-purple-200/60 dark:border-purple-800/60 hover:border-purple-300 dark:hover:border-purple-700 shadow-sm hover:shadow-lg hover:shadow-purple-500/20 hover:-translate-y-1 backdrop-blur-sm"
              >
                <span className="text-base group-hover:scale-110 transition-transform duration-200">
                  ✏️
                </span>
                <span>Draw</span>
              </button>
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
      </div>
    );
  }

  // Compact bottom composer with dynamic border radius
  const isExpanded = text.includes("\n") || text.length > 50;

  return (
    <div
      className={`flex items-start gap-3 bg-background/85 dark:bg-background/95 border-2 border-border/50 dark:border-border/80 px-3 py-2 shadow-lg shadow-black/10 dark:shadow-black/40 backdrop-blur-md transition-all duration-300 hover:shadow-xl hover:shadow-black/15 dark:hover:shadow-black/50 hover:border-primary/20 ring-1 ring-inset ring-white/5 dark:ring-white/10 ${
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
              className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary transition-all duration-200 border border-transparent hover:border-primary/20"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-52 p-2 rounded-2xl border-2 shadow-xl shadow-black/10 dark:shadow-black/50"
            side="top"
          >
            <div className="space-y-1">
              <button
                onClick={handleNewNote}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-accent/80 transition-colors group"
              >
                <span className="text-base">📝</span>
                <span className="font-medium">Rich Text Note</span>
              </button>
              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-accent/80 transition-colors group">
                <span className="text-base">📄</span>
                <span className="font-medium">File Upload</span>
              </button>
              <button
                onClick={handleCamera}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-accent/80 transition-colors group"
              >
                <span className="text-base">📷</span>
                <span className="font-medium">Photo</span>
              </button>
              <button
                onClick={handleDrawing}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-accent/80 transition-colors group"
              >
                <span className="text-base">✏️</span>
                <span className="font-medium">Draw</span>
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
            className="h-7 w-7 rounded-full bg-primary hover:bg-primary/90 shadow-md shadow-black/20 dark:shadow-black/40 hover:shadow-lg hover:shadow-black/25 dark:hover:shadow-black/50 transition-all duration-200"
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
