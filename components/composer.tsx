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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const lastUploadSignatureRef = useRef<string>("");
  const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per image

  // Upload/compress modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadStage, setUploadStage] = useState<
    "Preparing" | "Compressing" | "Uploading" | "Done" | "Error"
  >("Preparing");
  const [uploadProcessed, setUploadProcessed] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadMessage, setUploadMessage] = useState<string>("");

  // Compress image on client to reduce payload size
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const maxDim = 2000; // max width/height
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              const scale = Math.min(maxDim / width, maxDim / height);
              width = Math.round(width * scale);
              height = Math.round(height * scale);
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              reject(new Error("Canvas not supported"));
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);

            // Export as JPEG to reduce size while keeping good quality
            const quality = 0.85;
            const dataUrl = canvas.toDataURL("image/jpeg", quality);
            resolve(dataUrl);
          } catch (err) {
            reject(err as Error);
          }
        };
        img.onerror = () => reject(new Error("Image load error"));
        img.src = URL.createObjectURL(file);
      } catch (err) {
        reject(err as Error);
      }
    });
  };

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

  const handleImages = () => {
    setPopoverOpen(false);
    if (multiFileInputRef.current) {
      multiFileInputRef.current.click();
    }
  };

  const handlePhoto = () => {
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
    if (isSubmitting) {
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if it's an image file
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      event.target.value = "";
      return;
    }

    // Check size limit
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(2);
      alert(`Image is too large (${mb} MB). Max size is 10 MB.`);
      event.target.value = "";
      return;
    }

    try {
      setIsSubmitting(true);
      setUploadOpen(true);
      setUploadStage("Compressing");
      setUploadTotal(1);
      setUploadProcessed(0);
      setUploadMessage("");

      // Compress image before upload to avoid oversized payloads
      const compressed = await compressImage(file);
      setUploadProcessed(1);

      try {
        setUploadStage("Uploading");
        const entry = await createEntry(spaceId, "text", `PHOTO:${compressed}`);
        onNewEntry(entry);
        setUploadStage("Done");
        setUploadMessage("Photo uploaded successfully");
        setTimeout(() => setUploadOpen(false), 600);
      } catch (error: any) {
        console.error("Failed to save photo:", error);
        setUploadStage("Error");
        setUploadMessage(
          "Could not upload the photo. Try a smaller image or different one."
        );
      } finally {
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error("Failed to process image:", error);
      setUploadStage("Error");
      setUploadMessage("Failed to process image");
      setIsSubmitting(false);
    }

    // Reset the input
    event.target.value = "";
  };

  const handleMultiplePhotos = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (isSubmitting) {
      return;
    }
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const filesArr = Array.from(files);
    const nonImages = filesArr.filter((f) => !f.type.startsWith("image/"));
    const oversize = filesArr.filter(
      (f) => f.type.startsWith("image/") && f.size > MAX_IMAGE_SIZE_BYTES
    );
    const imageFiles = filesArr.filter(
      (f) => f.type.startsWith("image/") && f.size <= MAX_IMAGE_SIZE_BYTES
    );

    if (nonImages.length > 0 && oversize.length > 0) {
      alert(
        `${nonImages.length} non-image file(s) and ${oversize.length} over 10 MB were skipped`
      );
    } else if (nonImages.length > 0) {
      alert(`${nonImages.length} non-image file(s) were skipped`);
    } else if (oversize.length > 0) {
      alert(`${oversize.length} image(s) over 10 MB were skipped`);
    }

    if (imageFiles.length === 0) {
      alert("No valid images under 10 MB were selected");
      event.target.value = "";
      return;
    }

    const signature = imageFiles.map((f) => `${f.name}:${f.size}`).join("|");
    if (signature === lastUploadSignatureRef.current) {
      // Prevent duplicate processing of same file selection
      event.target.value = "";
      return;
    }
    lastUploadSignatureRef.current = signature;

    setIsSubmitting(true);
    setUploadOpen(true);
    setUploadStage("Compressing");
    setUploadTotal(imageFiles.length);
    setUploadProcessed(0);
    setUploadMessage("");

    try {
      // Compress each image sequentially to update progress
      const successes: string[] = [];
      let failedCount = 0;
      for (let i = 0; i < imageFiles.length; i++) {
        const f = imageFiles[i];
        try {
          const dataUrl = await compressImage(f);
          successes.push(dataUrl);
        } catch (e) {
          failedCount++;
        } finally {
          setUploadProcessed(i + 1);
        }
      }

      if (failedCount > 0) {
        setUploadMessage(
          `${failedCount} image(s) failed to process and were skipped`
        );
      }

      if (successes.length === 0) {
        setUploadStage("Error");
        setUploadMessage(
          "No images could be processed. Try smaller or different images."
        );
        return;
      }

      setUploadStage("Uploading");
      if (successes.length === 1) {
        const entry = await createEntry(
          spaceId,
          "text",
          `PHOTO:${successes[0]}`
        );
        onNewEntry(entry);
      } else {
        const entry = await createEntry(
          spaceId,
          "text",
          `PHOTOS:${JSON.stringify(successes)}`
        );
        onNewEntry(entry);
      }
      setUploadStage("Done");
      setUploadMessage(
        successes.length === 1
          ? "Photo uploaded successfully"
          : "Images uploaded successfully"
      );
      setTimeout(() => setUploadOpen(false), 800);
    } catch (error) {
      console.error("Failed to process photos:", error);
      setUploadStage("Error");
      setUploadMessage(
        "We couldn't process your images right now. Please try again."
      );
    } finally {
      setIsSubmitting(false);
      // Reset the file input
      if (multiFileInputRef.current) {
        multiFileInputRef.current.value = "";
      }
    }
  };

  // Shared upload/compression dialog UI
  const uploadDialog = (
    <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {uploadStage === "Compressing" && "Preparing images"}
            {uploadStage === "Uploading" && "Uploading"}
            {uploadStage === "Done" && "All set"}
            {uploadStage === "Error" && "Something went wrong"}
          </DialogTitle>
          <DialogDescription>
            {uploadStage === "Compressing" &&
              (uploadTotal > 1
                ? "We are optimizing your images before upload."
                : "Optimizing your photo before upload.")}
            {uploadStage === "Uploading" && "Sending to your space..."}
            {uploadStage === "Done" && "Upload complete."}
            {uploadStage === "Error" &&
              "Please try again or choose smaller images."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {uploadTotal > 0 && (
              <span>
                {uploadStage === "Compressing" && (
                  <>
                    {uploadProcessed} / {uploadTotal} processed
                  </>
                )}
                {uploadStage !== "Compressing" && uploadTotal > 0 && (
                  <>
                    {uploadTotal} {uploadTotal === 1 ? "item" : "items"}
                  </>
                )}
              </span>
            )}
          </div>

          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-2 rounded-full transition-all",
                uploadStage === "Error"
                  ? "bg-red-500"
                  : uploadStage === "Done"
                  ? "bg-green-500"
                  : "bg-primary"
              )}
              style={{
                width:
                  uploadStage === "Compressing" && uploadTotal > 0
                    ? `${Math.round((uploadProcessed / uploadTotal) * 100)}%`
                    : uploadStage === "Uploading"
                    ? "100%"
                    : uploadStage === "Done"
                    ? "100%"
                    : uploadStage === "Error"
                    ? "100%"
                    : "0%",
              }}
            />
          </div>

          {uploadMessage && (
            <div className="text-xs text-muted-foreground">{uploadMessage}</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

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
                        onClick={handlePhoto}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-accent/80 transition-colors group"
                      >
                        <span className="text-lg">📷</span>
                        <div className="text-left">
                          <div className="font-medium">Photo</div>
                          <div className="text-xs text-muted-foreground">
                            Capture photo instantly
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={handleImages}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-accent/80 transition-colors group"
                      >
                        <span className="text-lg">🖼️</span>
                        <div className="text-left">
                          <div className="font-medium">Images</div>
                          <div className="text-xs text-muted-foreground">
                            Select multiple or single images
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
                onClick={handlePhoto}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 transition-all duration-200 border border-green-200/60 dark:border-green-800/60 hover:border-green-300 dark:hover:border-green-700 shadow-sm hover:shadow-lg hover:shadow-green-500/20 hover:-translate-y-1 backdrop-blur-sm"
              >
                <span className="text-base group-hover:scale-110 transition-transform duration-200">
                  📷
                </span>
                <span>Photo</span>
              </button>
              <button
                onClick={handleImages}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 transition-all duration-200 border border-blue-200/60 dark:border-blue-800/60 hover:border-blue-300 dark:hover:border-blue-700 shadow-sm hover:shadow-lg hover:shadow-blue-500/20 hover:-translate-y-1 backdrop-blur-sm"
              >
                <span className="text-base group-hover:scale-110 transition-transform duration-200">
                  🖼️
                </span>
                <span>Images</span>
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

          {/* Hidden inputs for centered composer (camera + multi images) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageCapture}
            className="hidden"
          />
          <input
            ref={multiFileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleMultiplePhotos}
            className="hidden"
          />
          {uploadDialog}
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
                onClick={handlePhoto}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-accent/80 transition-colors group"
              >
                <span className="text-base">📷</span>
                <span className="font-medium">Photo</span>
              </button>
              <button
                onClick={handleImages}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-accent/80 transition-colors group"
              >
                <span className="text-base">🖼️</span>
                <span className="font-medium">Images</span>
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

      {/* Hidden file input for multiple photos */}
      <input
        ref={multiFileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleMultiplePhotos}
        className="hidden"
      />
      {uploadDialog}
    </div>
  );
}
