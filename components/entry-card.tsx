"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Eye,
  Download,
  X,
  Copy,
  FileText,
  ExternalLink,
  Edit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

export interface Entry {
  id: string;
  space_id: string;
  kind: "text" | "image" | "pdf" | "file";
  text: string | null;
  asset_id?: string;
  meta: any;
  created_by_device_id: string | null;
  created_at: string;
}

interface EntryCardProps {
  entry: Entry;
}

export function EntryCard({ entry }: EntryCardProps) {
  const [showImageModal, setShowImageModal] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string>("");
  const [modalBgColor, setModalBgColor] = useState<string>("bg-black/90");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Handle keyboard events for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showImageModal) {
        setShowImageModal(false);
      }
    };

    if (showImageModal) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden"; // Prevent scrolling
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [showImageModal]);

  const formatTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return "just now";
    }
  };

  const handleDownload = (dataUrl: string, filename: string) => {
    try {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Download failed:", error);
      // Fallback: open in new tab if download fails
      window.open(dataUrl, "_blank");
    }
  };

  const analyzeImageBrightness = (dataUrl: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            resolve(false); // Default to dark background
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          let totalBrightness = 0;
          let pixelCount = 0;

          // Sample every 10th pixel for performance
          for (let i = 0; i < data.length; i += 40) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a > 0) {
              // Only consider non-transparent pixels
              // Calculate brightness using luminance formula
              const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
              totalBrightness += brightness;
              pixelCount++;
            }
          }

          const averageBrightness = totalBrightness / pixelCount;
          resolve(averageBrightness > 128); // Return true if image is bright
        } catch (error) {
          console.error("Error analyzing image brightness:", error);
          resolve(false); // Default to dark background on error
        }
      };

      img.onerror = () => {
        resolve(false); // Default to dark background on error
      };

      img.src = dataUrl;
    });
  };

  const handleView = async (dataUrl: string) => {
    setCurrentImageUrl(dataUrl);
    setIsAnalyzing(true);
    setShowImageModal(true);

    // Analyze image brightness to determine background
    try {
      const isBright = await analyzeImageBrightness(dataUrl);
      setModalBgColor(isBright ? "bg-gray-800/95" : "bg-gray-100/95");
    } catch (error) {
      console.error("Failed to analyze image:", error);
      setModalBgColor("bg-black/90"); // Default fallback
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Optional: Add toast notification here if you have a toast system
    } catch (error) {
      console.error("Failed to copy text:", error);
      // Fallback for older browsers
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      } catch (fallbackError) {
        console.error("Fallback copy failed:", fallbackError);
      }
    }
  };

  if (entry.kind === "text" && entry.text) {
    // Check if this is a drawing
    if (entry.text.startsWith("DRAWING:")) {
      const dataUrl = entry.text.replace("DRAWING:", "");
      return (
        <div className="group relative flex items-start justify-end gap-2 mb-4">
          {/* Action buttons on the left - hidden by default, visible on hover */}
          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 pt-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-9 w-9 p-0 bg-white/90 hover:bg-white dark:bg-gray-800/90 dark:hover:bg-gray-800 border-2 border-primary/20 hover:border-primary/40 shadow-lg hover:shadow-xl transition-all duration-200"
              onClick={() => handleView(dataUrl)}
              title="View image"
            >
              <Eye className="h-4 w-4 text-primary" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-9 w-9 p-0 bg-white/90 hover:bg-white dark:bg-gray-800/90 dark:hover:bg-gray-800 border-2 border-primary/20 hover:border-primary/40 shadow-lg hover:shadow-xl transition-all duration-200"
              onClick={() => handleDownload(dataUrl, `drawing-${entry.id}.png`)}
              title="Download image"
            >
              <Download className="h-4 w-4 text-primary" />
            </Button>
          </div>

          {/* Drawing message bubble */}
          <div className="relative max-w-[85%] sm:max-w-[70%]">
            <div className="relative bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-br-none p-3 shadow-sm hover:shadow-md transition-all duration-200 border border-border/10">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <span>🎨</span>
                  <span>Drawing</span>
                </div>
                <div className="relative">
                  <img
                    src={dataUrl}
                    alt="Hand drawn image"
                    className="max-w-full h-auto rounded-lg border border-border/20 cursor-pointer"
                    style={{ maxHeight: "300px" }}
                    onClick={() => handleView(dataUrl)}
                  />
                </div>
              </div>
              {/* Message tail for drawings */}
              <div className="absolute bottom-0 right-0 w-0 h-0 border-l-[12px] border-l-gray-100 dark:border-l-gray-800 border-b-[12px] border-b-transparent"></div>
            </div>
            {/* Message timestamp */}
            <div className="flex justify-end mt-1 px-1">
              <span className="text-xs text-muted-foreground/70">
                {formatTime(entry.created_at)}
              </span>
            </div>
          </div>

          {/* Image view modal - improved visibility with adaptive background */}
          {showImageModal && currentImageUrl && (
            <div
              className={`fixed inset-0 ${modalBgColor} z-50 flex items-center justify-center p-2 sm:p-4 transition-colors duration-300`}
              onClick={() => setShowImageModal(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setShowImageModal(false);
                }
              }}
              tabIndex={-1}
            >
              <div
                className="relative w-full h-full max-w-7xl max-h-full flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={currentImageUrl}
                  alt="Image - full view"
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                  style={{
                    minWidth: "50vw",
                    minHeight: "50vh",
                    maxWidth: "95vw",
                    maxHeight: "95vh",
                  }}
                />
                {/* Control buttons positioned at top right of viewport - adaptive colors */}
                <div className="fixed top-4 right-4 flex gap-3 z-10">
                  <Button
                    size="icon"
                    variant="secondary"
                    className={`h-12 w-12 shadow-2xl backdrop-blur-md hover:scale-105 transition-all duration-300 ${
                      modalBgColor.includes("gray-100")
                        ? "bg-black/80 hover:bg-black/90 text-white border border-black/30"
                        : "bg-white/80 hover:bg-white/90 text-black border border-white/30"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const filename = entry.text?.startsWith("DRAWING:")
                        ? `drawing-${entry.id}.png`
                        : `image-${entry.id}.png`;
                      handleDownload(currentImageUrl, filename);
                    }}
                    title="Download image"
                  >
                    <Download className="h-6 w-6" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className={`h-12 w-12 shadow-2xl backdrop-blur-md hover:scale-105 transition-all duration-300 ${
                      modalBgColor.includes("gray-100")
                        ? "bg-black/80 hover:bg-black/90 text-white border border-black/30"
                        : "bg-white/80 hover:bg-white/90 text-black border border-white/30"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowImageModal(false);
                    }}
                    title="Close (Esc)"
                  >
                    <X className="h-6 w-6" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Check if this is a photo
    if (entry.text.startsWith("PHOTO:")) {
      const dataUrl = entry.text.replace("PHOTO:", "");
      return (
        <div className="group relative flex items-start justify-end gap-2 mb-4">
          {/* Action buttons on the left - hidden by default, visible on hover */}
          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 pt-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-9 w-9 p-0 bg-white/90 hover:bg-white dark:bg-gray-800/90 dark:hover:bg-gray-800 border-2 border-primary/20 hover:border-primary/40 shadow-lg hover:shadow-xl transition-all duration-200"
              onClick={() => handleView(dataUrl)}
              title="View image"
            >
              <Eye className="h-4 w-4 text-primary" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-9 w-9 p-0 bg-white/90 hover:bg-white dark:bg-gray-800/90 dark:hover:bg-gray-800 border-2 border-primary/20 hover:border-primary/40 shadow-lg hover:shadow-xl transition-all duration-200"
              onClick={() => handleDownload(dataUrl, `photo-${entry.id}.jpg`)}
              title="Download image"
            >
              <Download className="h-4 w-4 text-primary" />
            </Button>
          </div>

          {/* Photo message bubble */}
          <div className="relative max-w-[85%] sm:max-w-[70%]">
            <div className="relative bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-br-none p-3 shadow-sm hover:shadow-md transition-all duration-200 border border-border/10">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <span>📷</span>
                  <span>Photo</span>
                </div>
                <div className="relative">
                  <img
                    src={dataUrl}
                    alt="Photo"
                    className="max-w-full h-auto rounded-lg border border-border/20 cursor-pointer"
                    style={{ maxHeight: "300px" }}
                    onClick={() => handleView(dataUrl)}
                  />
                </div>
              </div>
              {/* Message tail for photos */}
              <div className="absolute bottom-0 right-0 w-0 h-0 border-l-[12px] border-l-gray-100 dark:border-l-gray-800 border-b-[12px] border-b-transparent"></div>
            </div>
            {/* Message timestamp */}
            <div className="flex justify-end mt-1 px-1">
              <span className="text-xs text-muted-foreground/70">
                {formatTime(entry.created_at)}
              </span>
            </div>
          </div>

          {/* Image view modal - shared with drawings */}
          {showImageModal && currentImageUrl && (
            <div
              className={`fixed inset-0 ${modalBgColor} z-50 flex items-center justify-center p-2 sm:p-4 transition-colors duration-300`}
              onClick={() => setShowImageModal(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setShowImageModal(false);
                }
              }}
              tabIndex={-1}
            >
              <div
                className="relative w-full h-full max-w-7xl max-h-full flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={currentImageUrl}
                  alt="Image - full view"
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                  style={{
                    minWidth: "50vw",
                    minHeight: "50vh",
                    maxWidth: "95vw",
                    maxHeight: "95vh",
                  }}
                />
                {/* Control buttons positioned at top right of viewport - adaptive colors */}
                <div className="fixed top-4 right-4 flex gap-3 z-10">
                  <Button
                    size="icon"
                    variant="secondary"
                    className={`h-12 w-12 shadow-2xl backdrop-blur-md hover:scale-105 transition-all duration-300 ${
                      modalBgColor.includes("gray-100")
                        ? "bg-black/80 hover:bg-black/90 text-white border border-black/30"
                        : "bg-white/80 hover:bg-white/90 text-black border border-white/30"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const filename = entry.text?.startsWith("DRAWING:")
                        ? `drawing-${entry.id}.png`
                        : entry.text?.startsWith("PHOTO:")
                        ? `photo-${entry.id}.jpg`
                        : `image-${entry.id}.png`;
                      handleDownload(currentImageUrl, filename);
                    }}
                    title="Download image"
                  >
                    <Download className="h-6 w-6" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className={`h-12 w-12 shadow-2xl backdrop-blur-md hover:scale-105 transition-all duration-300 ${
                      modalBgColor.includes("gray-100")
                        ? "bg-black/80 hover:bg-black/90 text-white border border-black/30"
                        : "bg-white/80 hover:bg-white/90 text-black border border-white/30"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowImageModal(false);
                    }}
                    title="Close (Esc)"
                  >
                    <X className="h-6 w-6" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Check if this is a note
    if (entry.text.startsWith("NOTE:")) {
      const noteData = entry.text.replace("NOTE:", "").split(":");
      const noteSlug = noteData[0];
      const publicCode = noteData[1];
      const noteTitle = noteData[2] || "Untitled Note";

      return (
        <div className="group relative flex items-start justify-end gap-2 mb-4">
          {/* Action buttons on the left - hidden by default, visible on hover */}
          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 pt-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-9 w-9 p-0 bg-white/90 hover:bg-white dark:bg-gray-800/90 dark:hover:bg-gray-800 border-2 border-primary/20 hover:border-primary/40 shadow-lg hover:shadow-xl transition-all duration-200"
              onClick={() => window.open(`/n/${noteSlug}`, "_blank")}
              title="Edit note"
            >
              <Edit className="h-4 w-4 text-primary" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-9 w-9 p-0 bg-white/90 hover:bg-white dark:bg-gray-800/90 dark:hover:bg-gray-800 border-2 border-primary/20 hover:border-primary/40 shadow-lg hover:shadow-xl transition-all duration-200"
              onClick={() => window.open(`/n/${noteSlug}`, "_blank")}
              title="Edit note"
            >
              <ExternalLink className="h-4 w-4 text-primary" />
            </Button>
          </div>

          {/* Note message bubble */}
          <div className="relative max-w-[85%] sm:max-w-[70%]">
            <div className="relative bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-br-none p-3 shadow-sm hover:shadow-md transition-all duration-200 border border-border/10">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <span>📝</span>
                  <span>Note</span>
                </div>
                <div className="relative">
                  <div
                    className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border/20 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => window.open(`/n/${noteSlug}`, "_blank")}
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 shadow-sm">
                      <FileText className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground/90 leading-tight truncate">
                        {noteTitle}
                      </div>
                      <div className="text-xs text-muted-foreground/80 mt-0.5 mr-2.5">
                        Rich text note • Click to edit
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Message tail for notes */}
              <div className="absolute bottom-0 right-0 w-0 h-0 border-l-[12px] border-l-gray-100 dark:border-l-gray-800 border-b-[12px] border-b-transparent"></div>
            </div>
            {/* Message timestamp */}
            <div className="flex justify-end mt-1 px-1">
              <span className="text-xs text-muted-foreground/70">
                {formatTime(entry.created_at)}
              </span>
            </div>
          </div>
        </div>
      );
    }

    // Regular text message
    return (
      <div className="group relative flex items-start justify-end gap-2 mb-4">
        {/* Copy button on the left - hidden by default, visible on hover */}
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 pt-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-9 w-9 p-0 bg-white/90 hover:bg-white dark:bg-gray-800/90 dark:hover:bg-gray-800 border-2 border-primary/20 hover:border-primary/40 shadow-lg hover:shadow-xl transition-all duration-200"
            onClick={() => handleCopyText(entry.text || "")}
            title="Copy text"
          >
            <Copy className="h-4 w-4 text-primary" />
          </Button>
        </div>

        {/* Message bubble - right aligned like sent messages */}
        <div className="relative max-w-[85%] sm:max-w-[70%]">
          <div className="relative bg-blue-500 text-white rounded-2xl rounded-br-none px-4 py-3 shadow-sm hover:shadow-md transition-all duration-200">
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words overflow-wrap-anywhere">
              {entry.text}
            </p>
            {/* Message tail - integrated into the bubble */}
            <div className="absolute bottom-0 right-0 w-0 h-0 border-l-[12px] border-l-blue-500 border-b-[12px] border-b-transparent"></div>
          </div>
          {/* Message timestamp */}
          <div className="flex justify-end mt-1 px-1">
            <span className="text-xs text-muted-foreground/70">
              {formatTime(entry.created_at)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Message-style file attachments
  return (
    <div className="group relative flex items-start justify-end gap-2 mb-4">
      {/* Action buttons on the left - only for images - hidden by default, visible on hover */}
      {entry.kind === "image" && (
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 pt-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-9 w-9 p-0 bg-white/90 hover:bg-white dark:bg-gray-800/90 dark:hover:bg-gray-800 border-2 border-primary/20 hover:border-primary/40 shadow-lg hover:shadow-xl transition-all duration-200"
            onClick={() => {
              // Create a placeholder image URL for demo purposes
              // In a real app, you'd use the actual image URL from entry.asset_id
              const placeholderImageUrl =
                "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzQ5NzlmZiIvPjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+U2FtcGxlIEltYWdlPC90ZXh0Pjwvc3ZnPg==";
              handleView(placeholderImageUrl);
            }}
            title="View image"
          >
            <Eye className="h-4 w-4 text-primary" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-9 w-9 p-0 bg-white/90 hover:bg-white dark:bg-gray-800/90 dark:hover:bg-gray-800 border-2 border-primary/20 hover:border-primary/40 shadow-lg hover:shadow-xl transition-all duration-200"
            onClick={() => {
              // Create a placeholder image URL for download demo
              const placeholderImageUrl =
                "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzQ5NzlmZiIvPjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+U2FtcGxlIEltYWdlPC90ZXh0Pjwvc3ZnPg==";
              handleDownload(placeholderImageUrl, `image-${entry.id}.svg`);
            }}
            title="Download image"
          >
            <Download className="h-4 w-4 text-primary" />
          </Button>
        </div>
      )}

      <div className="relative max-w-[85%] sm:max-w-[70%]">
        {/* File attachment bubble */}
        <div className="relative bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-br-none p-4 shadow-sm hover:shadow-md transition-all duration-200 border border-border/10">
          <div className="flex items-center gap-3">
            {/* File icon with colored background */}
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm ${
                entry.kind === "image"
                  ? "bg-gradient-to-br from-blue-400 to-blue-600"
                  : entry.kind === "pdf"
                  ? "bg-gradient-to-br from-red-400 to-red-600"
                  : "bg-gradient-to-br from-gray-400 to-gray-600"
              }`}
            >
              <span className="text-white text-sm filter drop-shadow-sm">
                {entry.kind === "image"
                  ? "📷"
                  : entry.kind === "pdf"
                  ? "📄"
                  : "📁"}
              </span>
            </div>

            {/* File details */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground/90 leading-tight">
                {entry.kind === "image"
                  ? "Photo"
                  : entry.kind === "pdf"
                  ? "Document"
                  : "File"}
              </div>
              <div className="text-xs text-muted-foreground/80 mt-0.5">
                {entry.kind === "image"
                  ? "Image attachment"
                  : entry.kind === "pdf"
                  ? "PDF document"
                  : "File attachment"}
              </div>
            </div>

            {/* Action indicator for non-images */}
            {entry.kind !== "image" && (
              <div className="text-xs text-muted-foreground/60">📎</div>
            )}
          </div>
          {/* Message tail for file attachments - integrated into the bubble */}
          <div className="absolute bottom-0 right-0 w-0 h-0 border-l-[12px] border-l-gray-100 dark:border-l-gray-800 border-b-[12px] border-b-transparent"></div>
        </div>

        {/* Message timestamp */}
        <div className="flex justify-end mt-1 px-1">
          <span className="text-xs text-muted-foreground/70">
            {formatTime(entry.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
