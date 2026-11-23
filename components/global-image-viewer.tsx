"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadFileFromUrl, triggerBlobDownload } from "@/lib/download";
import { addArchiveFiles, generateArchive } from "@/lib/archive";

interface GlobalImageViewerProps {
  images: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  // Optional callback to determine the filename for the single image download
  getDownloadFilename?: (index: number) => string;
  onEdit?: (imageUrl: string, index: number) => void;
}

export function GlobalImageViewer({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  getDownloadFilename,
  onEdit,
}: GlobalImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isBright, setIsBright] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const safeIndex =
    images.length > 0
      ? Math.min(Math.max(0, currentIndex), images.length - 1)
      : 0;
  const currentUrl = images[safeIndex] ?? "";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const clamped =
      images.length > 0
        ? Math.min(Math.max(0, initialIndex), images.length - 1)
        : 0;
    setCurrentIndex(clamped);
    setImageLoading(true);
    setImageError(false);
  }, [initialIndex, isOpen, images.length]);

  // Analyze brightness and sync cached image state
  useEffect(() => {
    if (!isOpen || !currentUrl) return;

    let isMounted = true;
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setImageLoading(false);
      setImageError(false);
    } else {
      setImageLoading(true);
      setImageError(false);
    }

    const analyzeImageBrightness = (dataUrl: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) return resolve(false);

            // Brightness only needs a representative sample. Downsampling
            // avoids allocating a full-resolution canvas for large photos.
            canvas.width = 32;
            canvas.height = 32;
            ctx.drawImage(img, 0, 0, 32, 32);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            let totalBrightness = 0;
            let pixelCount = 0;

            for (let i = 0; i < data.length; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              const a = data[i + 3];
              if (a > 0) {
                const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
                totalBrightness += brightness;
                pixelCount++;
              }
            }
            resolve(pixelCount > 0 && totalBrightness / pixelCount > 128);
          } catch {
            resolve(false);
          }
        };
        img.onerror = () => resolve(false);
        img.src = dataUrl;
      });
    };

    analyzeImageBrightness(currentUrl).then((bright) => {
      if (isMounted) setIsBright(bright);
    });

    return () => {
      isMounted = false;
    };
  }, [safeIndex, currentUrl, isOpen]);

  const goToPrevious = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const goToNext = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          goToPrevious();
          break;
        case "ArrowRight":
          goToNext();
          break;
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose, goToPrevious, goToNext]);

  const downloadImage = async (dataUrl: string, filename: string) => {
    if (isDownloading) return;
    setIsDownloading(true);
    const toastId = toast.loading("Preparing image for download...");
    try {
      if (dataUrl.startsWith("data:")) {
        const fetchRes = await fetch(dataUrl);
        const blob = await fetchRes.blob();
        triggerBlobDownload(blob, filename);
      } else {
        await downloadFileFromUrl(dataUrl, filename);
      }
      toast.success("Download started", { id: toastId });
    } catch {
      toast.error("Failed to download image", { id: toastId });
      window.open(dataUrl, "_blank", "noopener,noreferrer");
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadAllAsZip = async () => {
    if (isZipping) return;
    setIsZipping(true);
    const controller = new AbortController();
    const cancelAction = { label: "Cancel", onClick: () => controller.abort() };
    const toastId = toast.loading(`Preparing ZIP archive for ${images.length} photos...`, { action: cancelAction });
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      await addArchiveFiles(
        zip,
        images.map((url, index) => ({
          url,
          name: getDownloadFilename?.(index) || `photo-${index + 1}.${url.startsWith("data:image/jpeg") ? "jpg" : "png"}`,
        })),
        {
          signal: controller.signal,
          onProgress: (done, total) =>
            toast.loading(`Preparing ZIP: ${done}/${total} photos`, { id: toastId, action: cancelAction }),
        }
      );

      const zipBlob = await generateArchive(zip, { signal: controller.signal });
      triggerBlobDownload(zipBlob, `photos-${Date.now()}.zip`);
      toast.success("ZIP download started", { id: toastId });
    } catch (error) {
      if (controller.signal.aborted) {
        toast.message("ZIP cancelled", { id: toastId });
      } else {
        toast.error(error instanceof Error ? error.message : "Failed to create ZIP archive", { id: toastId });
      }
    } finally {
      setIsZipping(false);
    }
  };

  if (!isOpen || !mounted || images.length === 0) return null;

  // Theming based on brightness
  const modalBg = isBright ? "bg-gray-100/95" : "bg-black/95";
  const btnClasses = isBright
    ? "bg-black/80 hover:bg-black text-white border-black/40"
    : "bg-white/80 hover:bg-white text-black border-white/40";
  const textClasses = isBright ? "text-black" : "text-white";
  const subtleTextClasses = isBright ? "text-black/70" : "text-white/70";
  const surfaceClasses = isBright
    ? "bg-black/5 border-black/10"
    : "bg-white/10 border-white/15";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer (${safeIndex + 1} of ${images.length})`}
      className={`fixed inset-0 z-[9999] ${modalBg} backdrop-blur-sm flex items-center justify-center transition-colors duration-300`}
      onClick={onClose}
    >
      <div
        className="relative w-full h-full flex items-center justify-center p-4 2xl:p-12"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Previous image"
              className={`absolute left-4 z-10 h-10 w-10 md:h-12 md:w-12 rounded-full shadow-2xl border backdrop-blur-md transition-all duration-300 hover:scale-105 ${btnClasses}`}
              onClick={goToPrevious}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Next image"
              className={`absolute right-4 z-10 h-10 w-10 md:h-12 md:w-12 rounded-full shadow-2xl border backdrop-blur-md transition-all duration-300 hover:scale-105 ${btnClasses}`}
              onClick={goToNext}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </>
        )}

        {/* Top Right Controls */}
        <div className="absolute top-4 right-4 z-50 flex gap-3">
          {onEdit && (
            <Button
              size="icon"
              variant="secondary"
              className={`h-10 w-10 md:h-11 md:w-11 rounded-full shadow-2xl border backdrop-blur-md transition-all duration-300 hover:scale-105 ${btnClasses}`}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(currentUrl, safeIndex);
              }}
              title="Edit image"
              aria-label="Edit image"
            >
              <Edit3 className="h-5 w-5 md:h-6 md:w-6" />
            </Button>
          )}
          <Button
            size="icon"
            variant="secondary"
            disabled={isDownloading}
            className={`h-10 w-10 md:h-11 md:w-11 rounded-full shadow-2xl border backdrop-blur-md transition-all duration-300 hover:scale-105 ${btnClasses}`}
            onClick={(e) => {
              e.stopPropagation();
              const filename = getDownloadFilename
                ? getDownloadFilename(safeIndex)
                : `image-${Date.now()}.png`;
              downloadImage(currentUrl, filename);
            }}
            title={isDownloading ? "Downloading…" : "Download image"}
            aria-label={isDownloading ? "Downloading image" : "Download image"}
          >
            {isDownloading ? (
              <Loader2 className="h-5 w-5 md:h-6 md:w-6 animate-spin" />
            ) : (
              <Download className="h-5 w-5 md:h-6 md:w-6" />
            )}
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className={`h-10 w-10 md:h-11 md:w-11 rounded-full shadow-2xl border backdrop-blur-md transition-all duration-300 hover:scale-105 ${btnClasses}`}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Close (Esc)"
            aria-label="Close image viewer"
          >
            <X className="h-5 w-5 md:h-6 md:w-6" />
          </Button>
        </div>

        {/* Top Left Controls */}
        {images.length > 1 && (
          <div className="absolute top-4 left-4 z-50 flex gap-3">
            <Button
              variant="secondary"
              disabled={isZipping}
              className={`h-10 md:h-11 rounded-full shadow-2xl border backdrop-blur-md transition-all duration-300 px-4 font-semibold ${btnClasses}`}
              onClick={(e) => {
                e.stopPropagation();
                downloadAllAsZip();
              }}
            >
              {isZipping ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {isZipping ? "Creating ZIP…" : "Download All ZIP"}
            </Button>
          </div>
        )}

        {/* Image counter */}
        {images.length > 1 && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50 transition-colors duration-300">
            <div className={`backdrop-blur-md border rounded-full px-4 py-1.5 font-medium text-sm shadow-xl ${
              isBright ? "bg-white/50 border-black/10 text-black" : "bg-black/50 border-white/10 text-white"
            }`}>
              {safeIndex + 1} / {images.length}
            </div>
          </div>
        )}

        {/* Main image container */}
        <div className="relative flex items-center justify-center max-w-[95vw] max-h-[88vh] min-h-[160px] min-w-[160px]">
          {imageLoading && !imageError && (
            <div className={`relative flex flex-col items-center justify-center w-[85vw] sm:w-[580px] h-[50vh] sm:h-[480px] max-w-[92vw] max-h-[85vh] rounded-2xl backdrop-blur-xl border overflow-hidden shadow-2xl animate-in fade-in duration-200 ${surfaceClasses}`}>
              <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/15 dark:via-white/10 to-transparent pointer-events-none" />
              <div className="flex flex-col items-center gap-3 z-10">
                <div className={`h-12 w-12 rounded-2xl backdrop-blur-md flex items-center justify-center shadow-lg border ${surfaceClasses}`}>
                  <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                </div>
                <span className={`text-xs font-medium tracking-tight ${textClasses}`}>
                  Loading full image…
                </span>
              </div>
            </div>
          )}

          {imageError ? (
            <div className={`flex flex-col items-center justify-center gap-3 text-center p-8 rounded-2xl backdrop-blur-md border max-w-sm shadow-2xl ${surfaceClasses} ${textClasses}`}>
              <p className="text-sm font-semibold">Unable to display image</p>
              <p className={`text-xs ${subtleTextClasses}`}>The file could not be rendered inline.</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-1 text-xs"
                onClick={() => window.open(currentUrl, "_blank", "noopener,noreferrer")}
              >
                Open in new tab
              </Button>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              ref={imgRef}
              key={`${safeIndex}-${currentUrl}`}
              src={currentUrl}
              alt={`Viewing image ${safeIndex + 1}`}
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageLoading(false);
                setImageError(true);
              }}
              className={`max-h-[88vh] max-w-[92vw] w-auto h-auto object-contain rounded-xl drop-shadow-2xl select-none transition-all duration-300 ${
                imageLoading ? "opacity-0 scale-95 blur-sm absolute pointer-events-none" : "opacity-100 scale-100 blur-0 relative"
              }`}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
