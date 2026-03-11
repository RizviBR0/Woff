"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import {
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  DownloadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import JSZip from "jszip";

interface GlobalImageViewerProps {
  images: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  // Optional callback to determine the filename for the single image download
  getDownloadFilename?: (index: number) => string;
}

export function GlobalImageViewer({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  getDownloadFilename,
}: GlobalImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isBright, setIsBright] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  // Analyze brightness
  useEffect(() => {
    if (!isOpen || images.length === 0) return;

    let isMounted = true;
    const currentUrl = images[currentIndex];

    const analyzeImageBrightness = (dataUrl: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) return resolve(false);

            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            let totalBrightness = 0;
            let pixelCount = 0;

            for (let i = 0; i < data.length; i += 40) {
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
            resolve(totalBrightness / pixelCount > 128);
          } catch (error) {
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
  }, [currentIndex, images, isOpen]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

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

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose, goToPrevious, goToNext]);

  const downloadImage = async (dataUrl: string, filename: string) => {
    try {
      // Create blob from data URL logic
      if (dataUrl.startsWith("data:")) {
        const fetchRes = await fetch(dataUrl);
        const blob = await fetchRes.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      /* console.error("Failed to download image:", error); */
      window.open(dataUrl, "_blank");
    }
  };

  const downloadAllAsZip = async () => {
    try {
      const zip = new JSZip();

      for (let i = 0; i < images.length; i++) {
        const dataUrl = images[i];
        if (dataUrl.startsWith("data:image/")) {
          const base64Data = dataUrl.split(",")[1];
          const mimeType = dataUrl.split(";")[0].split(":")[1];
          const extension =
            mimeType === "image/jpeg" ? "jpg" :
            mimeType === "image/png" ? "png" :
            mimeType === "image/gif" ? "gif" : "jpg";
          zip.file(`photo-${i + 1}.${extension}`, base64Data, { base64: true });
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `photos-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      /* console.error("Failed to create zip:", error); */
    }
  };

  if (!isOpen || !mounted || images.length === 0) return null;

  // Theming based on brightness
  // If image is bright (white-ish), background is dark, buttons are dark (to contrast white image)
  // Wait, if image is bright, buttons inside the image or overlapping the image need to be DARK.
  // The background of the modal can be slightly transparent opposite.
  const modalBg = isBright ? "bg-gray-100/95" : "bg-black/95";
  const btnClasses = isBright
    ? "bg-black/80 hover:bg-black text-white border-black/40"
    : "bg-white/80 hover:bg-white text-black border-white/40";
  const textClasses = isBright ? "text-black" : "text-white";

  return createPortal(
    <div
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
              className={`absolute left-4 z-10 h-10 w-10 md:h-12 md:w-12 rounded-full shadow-2xl border backdrop-blur-md transition-all duration-300 hover:scale-105 ${btnClasses}`}
              onClick={goToPrevious}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className={`absolute right-4 z-10 h-10 w-10 md:h-12 md:w-12 rounded-full shadow-2xl border backdrop-blur-md transition-all duration-300 hover:scale-105 ${btnClasses}`}
              onClick={goToNext}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </>
        )}

        {/* Top Right Controls */}
        <div className="absolute top-4 right-4 z-50 flex gap-3">
          <Button
            size="icon"
            variant="secondary"
            className={`h-10 w-10 md:h-11 md:w-11 rounded-full shadow-2xl border backdrop-blur-md transition-all duration-300 hover:scale-105 ${btnClasses}`}
            onClick={(e) => {
              e.stopPropagation();
              const filename = getDownloadFilename 
                ? getDownloadFilename(currentIndex) 
                : `image-${Date.now()}.png`;
              downloadImage(images[currentIndex], filename);
            }}
            title="Download image"
          >
            <Download className="h-5 w-5 md:h-6 md:w-6" />
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
          >
            <X className="h-5 w-5 md:h-6 md:w-6" />
          </Button>
        </div>

        {/* Top Left Controls */}
        {images.length > 1 && (
          <div className="absolute top-4 left-4 z-50 flex gap-3">
            <Button
              variant="secondary"
              className={`h-10 md:h-11 rounded-full shadow-2xl border backdrop-blur-md transition-all duration-300 px-4 font-semibold ${btnClasses}`}
              onClick={(e) => {
                e.stopPropagation();
                downloadAllAsZip();
              }}
            >
              <DownloadIcon className="h-4 w-4 mr-2" />
              Download All ZIP
            </Button>
          </div>
        )}

        {/* Image counter */}
        {images.length > 1 && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50 transition-colors duration-300">
            <div className={`backdrop-blur-md border rounded-full px-4 py-1.5 font-medium text-sm shadow-xl ${
              isBright ? "bg-white/50 border-black/10 text-black" : "bg-black/50 border-white/10 text-white"
            }`}>
              {currentIndex + 1} / {images.length}
            </div>
          </div>
        )}

        {/* Main image */}
        <div className="relative w-full h-full flex items-center justify-center max-w-[95vw] max-h-[95vh]">
          <Image
            src={images[currentIndex]}
            alt={`Viewing image ${currentIndex + 1}`}
            fill
            sizes="100vw"
            className="object-contain rounded-lg drop-shadow-2xl"
            unoptimized
            priority
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
