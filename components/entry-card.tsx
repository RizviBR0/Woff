"use client";

import {
  Eye,
  Download,
  X,
  Copy,
  Check,
  FileText,
  ExternalLink,
  Edit,
  Lock,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import JSZip from "jszip";
import { useState, useEffect, memo } from "react";
import { PhotoGallery } from "./photo-gallery";
import { displayNameForDevice } from "@/lib/display-name";
import NextImage from "next/image";

export interface Entry {
  id: string;
  space_id: string;
  kind: "text" | "image" | "pdf" | "file";
  text: string | null;
  asset_id?: string;
  meta: any;
  created_by_device_id: string | null;
  created_at: string;
  // Optimistic UI fields
  isLoading?: boolean;
  uploadProgress?: number;
  uploadMessage?: string;
}

interface EntryCardProps {
  entry: Entry;
  currentDeviceId?: string | null;
}

export const EntryCard = memo(function EntryCard({
  entry,
  currentDeviceId = null,
}: EntryCardProps) {
  const [showImageModal, setShowImageModal] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string>("");
  const [modalBgColor, setModalBgColor] = useState<string>("bg-black/90");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isNoteLocked, setIsNoteLocked] = useState(false);
  const [noteLoaded, setNoteLoaded] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [copied, setCopied] = useState(false);

  const isMine =
    !!entry.created_by_device_id &&
    !!currentDeviceId &&
    entry.created_by_device_id === currentDeviceId;
  const nameLabel = isMine
    ? "You"
    : displayNameForDevice(entry.created_by_device_id || entry.id);

  // Deterministic color for avatar
  const colorIndex = (() => {
    const key = entry.created_by_device_id || entry.id;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h << 5) - h + key.charCodeAt(i);
    return Math.abs(h) % 8;
  })();

  const avatarColors = [
    "bg-rose-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-sky-500",
    "bg-fuchsia-500",
    "bg-teal-500",
    "bg-purple-500",
    "bg-orange-500",
  ];

  const firstLetter = nameLabel.charAt(0).toUpperCase();

  // Avatar component
  const avatar = (
    <div
      className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
        isMine ? "bg-blue-500" : avatarColors[colorIndex]
      }`}
      aria-label={nameLabel}
    >
      {firstLetter}
    </div>
  );

  // Loading overlay component for optimistic UI
  const loadingOverlay = entry.isLoading ? (
    <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] rounded-lg flex items-center justify-center z-10">
      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          {/* Animated spinner */}
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
        {entry.uploadMessage && (
          <span className="text-xs text-muted-foreground font-medium">
            {entry.uploadMessage}
          </span>
        )}
        {typeof entry.uploadProgress === "number" &&
          entry.uploadProgress > 0 && (
            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${entry.uploadProgress}%` }}
              />
            </div>
          )}
      </div>
    </div>
  ) : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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

  const imageModal = (
    <Dialog open={showImageModal} onOpenChange={setShowImageModal}>
      <DialogContent className="max-w-5xl w-full p-0 overflow-hidden bg-transparent border-none shadow-none [&>button]:hidden">
        <DialogTitle className="hidden">Preview</DialogTitle>
        <div className="relative w-full h-[85vh] flex items-center justify-center group/modal">
          <button
            onClick={() => setShowImageModal(false)}
            className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>

          {currentImageUrl && (
            <NextImage
              src={currentImageUrl}
              alt="Preview"
              fill
              className="object-contain"
              unoptimized
              priority
            />
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="bg-black/50 hover:bg-black/70 text-white border-none"
              onClick={() =>
                downloadFileUrl(currentImageUrl, `image-${Date.now()}.png`)
              }
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  // Check if note is locked (only for note entries)
  useEffect(() => {
    const checkNoteLock = async () => {
      if (entry.text && entry.text.startsWith("NOTE:")) {
        const noteData = entry.text.replace("NOTE:", "").split(":");
        const noteSlug = noteData[0];

        try {
          const res = await fetch(`/api/notes/${noteSlug}`);
          if (res.ok) {
            const note = await res.json();
            if (note) {
              setIsNoteLocked(!!note.is_locked);
            }
          }
          setNoteLoaded(true);
        } catch (error) {
          console.error("Failed to check note lock status:", error);
          setNoteLoaded(true);
        }
      }
    };

    checkNoteLock();
  }, [entry.text]);

  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "";
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
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackError) {
        console.error("Fallback copy failed:", fallbackError);
      }
    }
  };

  const formatBytes = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(mb < 1 ? 2 : 1)} MB`;
  };

  const downloadFileUrl = async (url: string, name: string) => {
    try {
      // Fetch blob to ensure download works for cross-origin files
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    } catch (e) {
      console.error("Download failed, opening in new tab", e);
      window.open(url, "_blank");
    }
  };

  // Handle placeholder/loading entries from optimistic UI
  if (entry.isLoading && entry.id.startsWith("placeholder-")) {
    const meta = entry.meta || {};
    const metaType = meta.type || "";

    // Determine icon and label based on meta type
    let icon = "📤";
    let label = "Uploading...";
    let previewContent = null;

    if (metaType === "photo" || metaType === "drawing") {
      icon = metaType === "drawing" ? "🎨" : "📷";
      label = metaType === "drawing" ? "Drawing" : "Photo";
      if (meta.previewUrl) {
        previewContent = (
          <div className="mt-2 w-full max-w-xs">
            <div className="relative w-full aspect-[4/3]">
              <NextImage
                src={meta.previewUrl}
                alt="Preview"
                fill
                unoptimized
                sizes="(max-width: 768px) 60vw, 260px"
                className="object-contain rounded-lg border border-border/20 bg-background opacity-60"
              />
            </div>
          </div>
        );
      }
    } else if (metaType === "photos") {
      icon = "🖼️";
      label = `${meta.count || "Multiple"} Photos`;
      if (meta.previewUrls && meta.previewUrls.length > 0) {
        previewContent = (
          <div className="mt-2 flex gap-1 flex-wrap max-w-xs">
            {meta.previewUrls.slice(0, 4).map((url: string, i: number) => (
              <div key={i} className="relative w-16 h-16">
                <NextImage
                  src={url}
                  alt={`Preview ${i + 1}`}
                  fill
                  unoptimized
                  className="object-cover rounded border border-border/20 opacity-60"
                />
              </div>
            ))}
            {meta.previewUrls.length > 4 && (
              <div className="w-16 h-16 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                +{meta.previewUrls.length - 4}
              </div>
            )}
          </div>
        );
      }
    } else if (metaType === "files") {
      icon = "📄";
      const items = meta.items || [];
      label =
        items.length > 1 ? `${items.length} Files` : items[0]?.name || "File";
    } else if (metaType === "note") {
      icon = "📝";
      label = "Note";
    }

    return (
      <div
        id={`entry-${entry.id}`}
        className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
      >
        {/* Loading overlay */}
        {loadingOverlay}

        {/* Avatar */}
        {avatar}

        {/* Message content */}
        <div className="flex-1 min-w-0">
          {/* Header: Name and Time */}
          <div className="flex items-baseline gap-2 mb-1">
            <span
              className={`font-semibold text-sm ${
                isMine ? "text-blue-600 dark:text-blue-400" : "text-foreground"
              }`}
            >
              {nameLabel}
            </span>
            <span className="text-xs text-muted-foreground/60">
              {formatTime(entry.created_at)}
            </span>
          </div>

          {/* Content type indicator */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{icon}</span>
              <span>{label}</span>
            </div>
            {previewContent}
          </div>
        </div>
      </div>
    );
  }

  if (entry.kind === "text" && entry.text) {
    // Check if this is a drawing
    if (entry.text.startsWith("DRAWING:")) {
      const dataUrl = entry.text.replace("DRAWING:", "");
      return (
        <>
          <div
            id={`entry-${entry.id}`}
            className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
          >
            {/* Loading overlay for optimistic UI */}
            {loadingOverlay}

            {/* Avatar */}
            {avatar}

            {/* Message content */}
            <div className="flex-1 min-w-0">
              {/* Header: Name and Time */}
              <div className="flex items-baseline gap-2 mb-1">
                <span
                  className={`font-semibold text-sm ${
                    isMine
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-foreground"
                  }`}
                >
                  {nameLabel}
                </span>
                <span className="text-xs text-muted-foreground/60">
                  {formatTime(entry.created_at)}
                </span>
              </div>

              {/* Drawing content */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>🎨</span>
                  <span>Drawing</span>
                </div>
                <div className="mt-2 w-full max-w-xs">
                  <div className="relative w-full aspect-square">
                    <NextImage
                      src={dataUrl}
                      alt="Hand drawn image"
                      fill
                      unoptimized
                      sizes="(max-width: 768px) 60vw, 260px"
                      className="object-contain rounded-lg border border-border/20 cursor-pointer hover:opacity-90 transition-opacity bg-background"
                      onClick={() => handleView(dataUrl)}
                    />
                  </div>
                </div>
              </div>

              {/* Action buttons - shown on hover */}
              <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleView(dataUrl)}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    handleDownload(dataUrl, `drawing-${entry.id}.png`)
                  }
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download
                </Button>
              </div>
            </div>
          </div>

          {/* Image view modal (canvas sits below the app top bar) */}
          {showImageModal && currentImageUrl && (
            <div
              className={`fixed inset-x-0 bottom-0 top-10 ${modalBgColor} z-[40] flex items-center justify-center transition-colors duration-300`}
              onClick={() => setShowImageModal(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setShowImageModal(false);
                }
              }}
              tabIndex={-1}
            >
              <div
                className="relative w-full h-full max-w-7xl max-h-full flex items-center justify-center px-2 sm:px-4 py-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative w-full h-full max-w-[95vw] max-h-[95vh] flex items-center justify-center">
                  <NextImage
                    src={currentImageUrl}
                    alt="Image - full view"
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 95vw, 90vw"
                    className="object-contain rounded-lg shadow-2xl"
                  />
                </div>
                {/* Control buttons positioned at top right of viewport with guaranteed contrast */}
                <div className="fixed top-4 right-4 flex gap-3 z-50">
                  <Button
                    size="icon"
                    variant="secondary"
                    className={`h-10 w-10 md:h-11 md:w-11 rounded-full shadow-2xl border border-black/40 bg-black/80 text-white backdrop-blur-md hover:bg-black hover:scale-105 transition-all duration-300`}
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
                    className={`h-10 w-10 md:h-11 md:w-11 rounded-full shadow-2xl border border-black/40 bg-black/80 text-white backdrop-blur-md hover:bg-black hover:scale-105 transition-all duration-300`}
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
        </>
      );
    }

    // Check if this is a photo
    if (entry.text.startsWith("PHOTO:")) {
      const dataUrl = entry.text.replace("PHOTO:", "");
      return (
        <>
          <div
            id={`entry-${entry.id}`}
            className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
          >
            {/* Loading overlay for optimistic UI */}
            {loadingOverlay}

            {/* Avatar */}
            {avatar}

            {/* Message content */}
            <div className="flex-1 min-w-0">
              {/* Header: Name and Time */}
              <div className="flex items-baseline gap-2 mb-1">
                <span
                  className={`font-semibold text-sm ${
                    isMine
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-foreground"
                  }`}
                >
                  {nameLabel}
                </span>
                <span className="text-xs text-muted-foreground/60">
                  {formatTime(entry.created_at)}
                </span>
              </div>

              {/* Photo content */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>📷</span>
                  <span>Photo</span>
                </div>
                <div className="mt-2 w-full max-w-xs">
                  <div className="relative w-full aspect-[4/3]">
                    <NextImage
                      src={dataUrl}
                      alt="Photo"
                      fill
                      unoptimized
                      sizes="(max-width: 768px) 60vw, 260px"
                      className="object-contain rounded-lg border border-border/20 cursor-pointer hover:opacity-90 transition-opacity bg-background"
                      onClick={() => handleView(dataUrl)}
                    />
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleView(dataUrl)}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    handleDownload(dataUrl, `photo-${entry.id}.jpg`)
                  }
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download
                </Button>
              </div>
            </div>
          </div>

          {/* Image view modal for photos (canvas sits below the app top bar) */}
          {showImageModal && currentImageUrl && (
            <div
              className={`fixed inset-0 -top-[25px] ${modalBgColor} z-[40] flex items-center justify-center transition-colors duration-300`}
              onClick={() => setShowImageModal(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setShowImageModal(false);
                }
              }}
              tabIndex={-1}
            >
              <div
                className="relative w-full h-full max-w-7xl max-h-full flex items-center justify-center px-2 sm:px-4 py-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative w-full h-full max-w-[95vw] max-h-[95vh] flex items-center justify-center">
                  <NextImage
                    src={currentImageUrl}
                    alt="Image - full view"
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 95vw, 90vw"
                    className="object-contain rounded-lg shadow-2xl"
                  />
                </div>
                {/* Control buttons positioned at top right of viewport with guaranteed contrast */}
                <div className="fixed top-4 right-4 flex gap-3 z-50">
                  <Button
                    size="icon"
                    variant="secondary"
                    className={`h-10 w-10 md:h-11 md:w-11 rounded-full shadow-2xl border border-black/40 bg-black/80 text-white backdrop-blur-md hover:bg-black hover:scale-105 transition-all duration-300`}
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
                    className={`h-10 w-10 md:h-11 md:w-11 rounded-full shadow-2xl border border-black/40 bg-black/80 text-white backdrop-blur-md hover:bg-black hover:scale-105 transition-all duration-300`}
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
        </>
      );
    }

    // Check if this is multiple photos
    if (entry.text.startsWith("PHOTOS:")) {
      const photosDataRaw = entry.text.replace("PHOTOS:", "");
      let photosData: string[] = [];
      // Prefer JSON format (new) fallback to legacy comma separated
      try {
        if (photosDataRaw.trim().startsWith("[")) {
          const parsed = JSON.parse(photosDataRaw);
          if (Array.isArray(parsed)) {
            photosData = parsed.filter(
              (v) => typeof v === "string" && v.startsWith("data:image"),
            );
          }
        } else {
          photosData = photosDataRaw
            .split(",")
            .map((u) => u.trim())
            .filter((u) => u.startsWith("data:image"));
        }
      } catch {
        photosData = photosDataRaw
          .split(",")
          .map((u) => u.trim())
          .filter((u) => u.startsWith("data:image"));
      }
      // Deduplicate identical data URLs (defensive against double insertion)
      photosData = Array.from(new Set(photosData));

      const downloadAllAsZip = async () => {
        try {
          const JSZip = (await import("jszip")).default;
          const zip = new JSZip();

          photosData.forEach((dataUrl, index) => {
            if (dataUrl.startsWith("data:image/")) {
              const base64Data = dataUrl.split(",")[1];
              const mimeType = dataUrl.split(";")[0].split(":")[1];
              const extension =
                mimeType === "image/jpeg"
                  ? "jpg"
                  : mimeType === "image/png"
                    ? "png"
                    : mimeType === "image/gif"
                      ? "gif"
                      : "jpg";
              zip.file(`photo-${index + 1}.${extension}`, base64Data, {
                base64: true,
              });
            }
          });

          const content = await zip.generateAsync({ type: "blob" });
          const url = URL.createObjectURL(content);
          const link = document.createElement("a");
          link.href = url;
          link.download = `photos-${entry.id}.zip`;
          link.style.display = "none";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } catch (error) {
          console.error("Failed to create zip:", error);
        }
      };

      const displayedPhotos = photosData.slice(0, 5);
      const remainingCount = photosData.length - 5;

      return (
        <>
          <div
            id={`entry-${entry.id}`}
            className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
          >
            {/* Loading overlay for optimistic UI */}
            {loadingOverlay}

            {/* Avatar */}
            {avatar}

            {/* Message content */}
            <div className="flex-1 min-w-0">
              {/* Header: Name and Time */}
              <div className="flex items-baseline gap-2 mb-1">
                <span
                  className={`font-semibold text-sm ${
                    isMine
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-foreground"
                  }`}
                >
                  {nameLabel}
                </span>
                <span className="text-xs text-muted-foreground/60">
                  {formatTime(entry.created_at)}
                </span>
              </div>

              {/* Photos content */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>📷</span>
                  <span>
                    {photosData.length === 1
                      ? "1 Photo"
                      : `${photosData.length} Photos`}
                  </span>
                </div>
                <div
                  className="relative cursor-pointer"
                  onMouseEnter={() => setHovering(true)}
                  onMouseLeave={() => setHovering(false)}
                  onClick={() => setShowGallery(true)}
                >
                  <div
                    className={`grid gap-1 ${
                      photosData.length === 1 ? "grid-cols-1" : "grid-cols-3"
                    }`}
                  >
                    {displayedPhotos.map((dataUrl, index) => (
                      <div
                        key={index}
                        className={`relative ${
                          photosData.length === 1
                            ? "aspect-[4/3] max-w-sm"
                            : "aspect-square"
                        }`}
                      >
                        <NextImage
                          src={dataUrl}
                          alt={`Photo ${index + 1}`}
                          fill
                          unoptimized
                          sizes={
                            photosData.length === 1
                              ? "(max-width: 768px) 90vw, 400px"
                              : "(max-width: 768px) 30vw, 300px"
                          }
                          className="object-cover rounded border border-border/20 hover:opacity-90 transition-opacity"
                        />
                      </div>
                    ))}
                    {remainingCount > 0 && photosData.length > 5 && (
                      <div className="relative aspect-square bg-black/20 rounded border border-border/20 flex items-center justify-center">
                        <span className="text-white text-sm font-medium">
                          +{remainingCount}
                        </span>
                        <div className="absolute inset-0 bg-black/40 rounded flex items-center justify-center">
                          <span className="text-white text-xs">more</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Hover overlay for download all */}
                  {hovering && (
                    <div className="absolute inset-0 bg-black/60 rounded flex items-center justify-center transition-all duration-200">
                      <div className="rounded-lg px-3 py-2 flex items-center gap-2 text-sm font-medium bg-white/90 dark:bg-gray-800/90 text-gray-900 dark:text-gray-100 border border-border/30">
                        <Eye className="h-4 w-4" />
                        View All
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setShowGallery(true)}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View All
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={downloadAllAsZip}
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download ZIP
                </Button>
              </div>
            </div>
          </div>

          {/* Photo Gallery Modal */}
          <PhotoGallery
            images={photosData}
            onClose={() => setShowGallery(false)}
            initialIndex={0}
            isOpen={showGallery}
          />
        </>
      );
    }

    // Check if this is a note
    if (entry.text.startsWith("NOTE:")) {
      const noteData = entry.text.replace("NOTE:", "").split(":");
      const noteSlug = noteData[0];
      const publicCode = noteData[1];
      const noteTitle = noteData[2] || "Untitled Note";

      // Download note as PDF
      const downloadNotePDF = async () => {
        try {
          // Fetch note content
          const res = await fetch(`/api/notes/${noteSlug}`);
          if (!res.ok) throw new Error("Failed to fetch note");
          const note = await res.json();

          // Dynamic import jsPDF
          const { jsPDF } = await import("jspdf");
          const doc = new jsPDF();

          // Add title
          doc.setFontSize(20);
          doc.setFont("helvetica", "bold");
          doc.text(note.title || noteTitle, 20, 20);

          // Convert HTML content to plain text
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = note.content || "";
          const textContent = tempDiv.textContent || tempDiv.innerText || "";

          // Add content with word wrapping
          doc.setFontSize(12);
          doc.setFont("helvetica", "normal");
          const lines = doc.splitTextToSize(textContent, 170);
          doc.text(lines, 20, 35);

          // Save PDF
          doc.save(`${note.title || noteTitle}.pdf`);
        } catch (error) {
          console.error("Failed to download PDF:", error);
        }
      };

      // Download note as Markdown
      const downloadNoteMarkdown = async () => {
        try {
          // Fetch note content
          const res = await fetch(`/api/notes/${noteSlug}`);
          if (!res.ok) throw new Error("Failed to fetch note");
          const note = await res.json();

          // Convert HTML to Markdown (simplified)
          const content = note.content || "";
          const markdown = content
            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
            .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n")
            .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
            .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, "> $1\n\n")
            .replace(
              /<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gi,
              "```\n$1\n```\n\n",
            )
            .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
            .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
            .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
            .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
            .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
            .replace(/<hr\s*\/?>/gi, "---\n\n")
            .replace(/<[^>]*>/g, "") // Remove remaining HTML tags
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/\n{3,}/g, "\n\n"); // Clean up extra newlines

          const fullMarkdown = `# ${note.title || noteTitle}\n\n${markdown}`;

          // Download as .md file
          const blob = new Blob([fullMarkdown], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${note.title || noteTitle}.md`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } catch (error) {
          console.error("Failed to download Markdown:", error);
        }
      };

      return (
        <div
          id={`entry-${entry.id}`}
          className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
        >
          {/* Loading overlay for optimistic UI */}
          {loadingOverlay}

          {/* Avatar */}
          {avatar}

          {/* Message content */}
          <div className="flex-1 min-w-0">
            {/* Header: Name and Time */}
            <div className="flex items-baseline gap-2 mb-1">
              <span
                className={`font-semibold text-sm ${
                  isMine
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-foreground"
                }`}
              >
                {nameLabel}
              </span>
              <span className="text-xs text-muted-foreground/60">
                {formatTime(entry.created_at)}
              </span>
            </div>

            {/* Note content */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-foreground/90 leading-tight truncate">
                        {noteTitle}
                      </div>
                      {isNoteLocked && (
                        <div title="Protected note">
                          <Lock className="h-3 w-3 text-orange-500 flex-shrink-0" />
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground/80 mt-0.5 mr-2.5">
                      Rich text note • Click to edit
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => window.open(`/n/${noteSlug}`, "_blank")}
              >
                <Edit className="h-3 w-3 mr-1" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => window.open(`/n/${noteSlug}`, "_blank")}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Open
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem onClick={downloadNotePDF}>
                    <FileText className="h-4 w-4 mr-2" />
                    Download PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadNoteMarkdown}>
                    <FileText className="h-4 w-4 mr-2" />
                    Download MD
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      );
    }

    // Regular text message
    return (
      <div
        id={`entry-${entry.id}`}
        className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
      >
        {/* Loading overlay for optimistic UI */}
        {loadingOverlay}

        {/* Avatar */}
        {avatar}

        {/* Message content */}
        <div className="flex-1 min-w-0">
          {/* Header: Name and Time */}
          <div className="flex items-baseline gap-2 mb-1">
            <span
              className={`font-semibold text-sm ${
                isMine ? "text-blue-600 dark:text-blue-400" : "text-foreground"
              }`}
            >
              {nameLabel}
            </span>
            <span className="text-xs text-muted-foreground/60">
              {formatTime(entry.created_at)}
            </span>
          </div>

          {/* Message text */}
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/90 dark:text-foreground/95">
            {entry.text}
          </p>

          {/* Action button - shown on hover */}
          <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="ghost"
              className={`h-7 px-2 text-xs transition-all duration-200 ${
                copied
                  ? "bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/20 dark:text-green-400"
                  : ""
              }`}
              onClick={() => handleCopyText(entry.text || "")}
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // File entries rendering
  if (entry.kind === "file" && entry.meta?.type === "files") {
    const items: Array<{
      name: string;
      size: number;
      type: string;
      url: string;
    }> = entry.meta.items || [];

    const handleDownloadAllZip = async () => {
      try {
        const zip = new JSZip();
        for (const item of items) {
          const res = await fetch(item.url);
          const blob = await res.blob();
          zip.file(item.name || "file", blob);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `files-${entry.id}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error("ZIP download failed", e);
      }
    };

    // Helper to check if file is an image
    const isImage = (type: string, name: string) => {
      return (
        type?.startsWith("image/") ||
        /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name)
      );
    };

    const allImages =
      items.length > 0 && items.every((it) => isImage(it.type, it.name));
    const icon = allImages ? "🖼️" : "📄";

    return (
      <div
        id={`entry-${entry.id}`}
        className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
      >
        {/* Loading overlay for optimistic UI */}
        {loadingOverlay}

        {/* Avatar */}
        {avatar}

        {/* Message content */}
        <div className="flex-1 min-w-0">
          {/* Header: Name and Time */}
          <div className="flex items-baseline gap-2 mb-1">
            <span
              className={`font-semibold text-sm ${
                isMine ? "text-blue-600 dark:text-blue-400" : "text-foreground"
              }`}
            >
              {nameLabel}
            </span>
            <span className="text-xs text-muted-foreground/60">
              {formatTime(entry.created_at)}
            </span>
          </div>

          {/* Files content */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{icon}</span>
              <span>
                {items.length > 1
                  ? allImages
                    ? "Images"
                    : "Files"
                  : allImages
                    ? "Image"
                    : "File"}
              </span>
            </div>

            {/* Display images as visual gallery if possible, otherwise list */}
            {items.every((it) => isImage(it.type, it.name)) ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {items.map((it) => (
                  <div
                    key={it.url}
                    className="relative aspect-square group/image"
                  >
                    <NextImage
                      src={it.url}
                      alt={it.name}
                      fill
                      unoptimized
                      className="object-cover rounded-lg border border-border/20 cursor-pointer hover:opacity-90 transition-opacity bg-background"
                      onClick={() => handleView(it.url)}
                    />
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover/image:opacity-100 transition-opacity shadow-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadFileUrl(it.url, it.name);
                      }}
                      title="Download"
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y rounded-md border border-border/20 bg-background">
                {items.map((it) => {
                  const isImg = isImage(it.type, it.name);
                  return (
                    <div
                      key={it.url}
                      className="flex items-center justify-between p-2 hover:bg-accent/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {isImg ? (
                          <div
                            className="relative h-10 w-10 flex-shrink-0 bg-muted rounded overflow-hidden border cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => handleView(it.url)}
                          >
                            <NextImage
                              src={it.url}
                              alt="Preview"
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="h-10 w-10 flex items-center justify-center bg-muted rounded flex-shrink-0 text-muted-foreground border">
                            <FileText className="h-5 w-5" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm font-medium truncate max-w-[180px] sm:max-w-[300px]"
                            title={it.name}
                          >
                            {it.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatBytes(it.size)} • {it.type || "file"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pl-2">
                        {isImg && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            onClick={() => handleView(it.url)}
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => downloadFileUrl(it.url, it.name)}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action buttons */}
          {items.length > 1 && (
            <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={handleDownloadAllZip}
              >
                <Download className="h-3 w-3 mr-1" />
                Download All ZIP
              </Button>
            </div>
          )}
        </div>
        {imageModal}
      </div>
    );
  }

  // Message-style file attachments
  return (
    <div
      id={`entry-${entry.id}`}
      className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
    >
      {/* Loading overlay for optimistic UI */}
      {loadingOverlay}

      {/* Avatar */}
      {avatar}

      {/* Message content */}
      <div className="flex-1 min-w-0">
        {/* Header: Name and Time */}
        <div className="flex items-baseline gap-2 mb-1">
          <span
            className={`font-semibold text-sm ${
              isMine ? "text-blue-600 dark:text-blue-400" : "text-foreground"
            }`}
          >
            {nameLabel}
          </span>
          <span className="text-xs text-muted-foreground/60">
            {formatTime(entry.created_at)}
          </span>
        </div>

        {/* File attachment content */}
        <div className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border/20">
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

        {/* Action buttons */}
        {entry.kind === "image" && (
          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const placeholderImageUrl =
                  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzQ5NzlmZiIvPjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+U2FtcGxlIEltYWdlPC90ZXh0Pjwvc3ZnPg==";
                handleView(placeholderImageUrl);
              }}
            >
              <Eye className="h-3 w-3 mr-1" />
              View
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const placeholderImageUrl =
                  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzQ5NzlmZiIvPjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+U2FtcGxlIEltYWdlPC90ZXh0Pjwvc3ZnPg==";
                handleDownload(placeholderImageUrl, `image-${entry.id}.svg`);
              }}
            >
              <Download className="h-3 w-3 mr-1" />
              Download
            </Button>
          </div>
        )}
      </div>
      {imageModal}
    </div>
  );
});
