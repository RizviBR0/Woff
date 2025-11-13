"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  DownloadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import JSZip from "jszip";

interface PhotoGalleryProps {
  images: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export function PhotoGallery({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
}: PhotoGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

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

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, goToPrevious, goToNext]);

  const downloadImage = async (dataUrl: string, filename: string) => {
    try {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Failed to download image:", error);
    }
  };

  const downloadAllAsZip = async () => {
    try {
      const zip = new JSZip();

      for (let i = 0; i < images.length; i++) {
        const dataUrl = images[i];
        const base64Data = dataUrl.split(",")[1];
        const fileName = `photo-${i + 1}.jpg`;
        zip.file(fileName, base64Data, { base64: true });
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
      console.error("Failed to create zip:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full h-full max-w-6xl max-h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            <Button
              variant="secondary"
              size="icon"
              className="absolute left-4 z-10 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20"
              onClick={goToPrevious}
            >
              <ChevronLeft className="h-6 w-6 text-white" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="absolute right-4 z-10 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20"
              onClick={goToNext}
            >
              <ChevronRight className="h-6 w-6 text-white" />
            </Button>
          </>
        )}

        {/* Close button */}
        <Button
          variant="secondary"
          size="icon"
          className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20"
          onClick={onClose}
        >
          <X className="h-5 w-5 text-white" />
        </Button>

        {/* Download buttons */}
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white"
            onClick={() =>
              downloadImage(
                images[currentIndex],
                `photo-${currentIndex + 1}.jpg`
              )
            }
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          {images.length > 1 && (
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white"
              onClick={downloadAllAsZip}
            >
              <DownloadIcon className="h-4 w-4 mr-2" />
              Download All
            </Button>
          )}
        </div>

        {/* Image counter */}
        {images.length > 1 && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-3 py-1 text-white text-sm">
              {currentIndex + 1} / {images.length}
            </div>
          </div>
        )}

        {/* Main image */}
        <div className="relative w-full h-full">
          <Image
            src={images[currentIndex]}
            alt={`Photo ${currentIndex + 1} of ${images.length}`}
            fill
            sizes="100vw"
            className="object-contain rounded-lg"
            unoptimized
            priority
          />
        </div>
      </div>
    </div>
  );
}
