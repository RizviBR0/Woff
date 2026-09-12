"use client";

import { useState } from "react";
import NextImage from "next/image";
import dynamic from "next/dynamic";
import { Edit3, Eye, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  createUploadedEntry,
  createUploadIntents,
} from "@/lib/actions";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Entry, UploadedFileItem } from "./entry-types";

const GlobalImageViewer = dynamic(
  () =>
    import("../global-image-viewer").then((module) => module.GlobalImageViewer),
  { ssr: false },
);

const GlobalVideoViewer = dynamic(
  () =>
    import("../global-video-viewer").then((module) => module.GlobalVideoViewer),
  { ssr: false },
);

const ImageMarkupEditor = dynamic(
  () =>
    import("../image-markup-editor").then((module) => module.ImageMarkupEditor),
  { ssr: false },
);

interface MediaEntryCardProps {
  entry: Entry;
  onNewEntry?: (entry: Entry) => void;
}

function ShimmerImage({
  src,
  alt,
  className = "",
  containerClassName = "",
  onClick,
}: {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  onClick?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className={`relative overflow-hidden ${containerClassName}`}
      onClick={onClick}
    >
      {!loaded && (
        <div className="absolute inset-0 z-0 bg-muted/60 backdrop-blur-sm overflow-hidden animate-in fade-in duration-150">
          <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent pointer-events-none" />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`${className} transition-all duration-300 ${
          loaded ? "opacity-100 blur-0 scale-100" : "opacity-0 blur-sm scale-[0.98]"
        }`}
      />
    </div>
  );
}

export function MediaEntryCard({ entry, onNewEntry }: MediaEntryCardProps) {
  const [showGallery, setShowGallery] = useState(false);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [markupImage, setMarkupImage] = useState<string | null>(null);
  const [video, setVideo] = useState<{ src: string; title: string } | null>(null);

  // Extract media items
  const items: UploadedFileItem[] = (() => {
    if (Array.isArray(entry.meta?.items)) return entry.meta.items;
    return [];
  })();

  const previewUrls: string[] = entry.meta?.previewUrls || [];

  // Parse legacy drawing or photo text
  const drawingDataUrl = (() => {
    if (entry.text?.startsWith("DRAWING:")) {
      return entry.text.replace("DRAWING:", "");
    }
    if (entry.meta?.previewUrl && entry.meta?.type === "drawing") {
      return entry.meta.previewUrl;
    }
    return null;
  })();

  const singlePhotoUrl = (() => {
    if (entry.text?.startsWith("PHOTO:")) {
      return entry.text.replace("PHOTO:", "");
    }
    if (entry.meta?.url && typeof entry.meta.url === "string") {
      return entry.meta.url;
    }
    return null;
  })();

  const handleOpenGallery = (images: string[], index = 0) => {
    setGalleryImages(images);
    setGalleryIndex(index);
    setShowGallery(true);
  };

  const handleSaveMarkup = async (blob: Blob) => {
    if (!onNewEntry) {
      throw new Error("This room cannot receive the edited image right now");
    }
    const file = new File([blob], `markup-${Date.now()}.png`, {
      type: "image/png",
    });
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const apiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!projectUrl || !apiKey) {
      throw new Error("Upload service is not configured");
    }

    const bitmap =
      typeof createImageBitmap === "function"
        ? await createImageBitmap(file).catch(() => null)
        : null;

    const [intents, authResult] = await Promise.all([
      createUploadIntents(entry.space_id, [
        { name: file.name, size: file.size, type: file.type },
      ]),
      supabaseBrowser.auth.getSession(),
    ]);

    const session = authResult.data.session;
    if (!session) {
      bitmap?.close();
      throw new Error("Your anonymous session expired. Refresh and retry.");
    }

    const parsedUrl = new URL(projectUrl);
    const projectId = parsedUrl.hostname.endsWith(".supabase.co")
      ? parsedUrl.hostname.split(".")[0]
      : null;
    const storageOrigin = projectId
      ? `https://${projectId}.storage.supabase.co`
      : parsedUrl.origin;
    const intent = intents[0];
    const { Upload } = await import("tus-js-client");

    try {
      await new Promise<void>((resolve, reject) => {
        const upload = new Upload(file, {
          endpoint: `${storageOrigin}/storage/v1/upload/resumable`,
          retryDelays: [0, 3000, 5000, 10_000],
          headers: {
            authorization: `Bearer ${session.access_token}`,
            apikey: apiKey,
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          chunkSize: 6 * 1024 * 1024,
          metadata: {
            bucketName: intent.bucket,
            objectName: intent.path,
            contentType: file.type,
            cacheControl: "3600",
          },
          onError: reject,
          onSuccess: () => resolve(),
        });
        upload.start();
      });

      const created = await createUploadedEntry(
        entry.space_id,
        [
          {
            path: intent.path,
            name: file.name,
            type: file.type,
            size: file.size,
            width: bitmap?.width,
            height: bitmap?.height,
          },
        ],
        "drawing",
      );
      onNewEntry(created as Entry);
      toast.success("Annotated image sent");
    } catch (error) {
      await supabaseBrowser.storage
        .from("files")
        .remove([intent.path])
        .catch(() => undefined);
      throw error;
    } finally {
      bitmap?.close();
    }
  };

  const renderMediaContent = () => {
    // Drawing presentation
    if (drawingDataUrl || (items.length === 1 && entry.meta?.presentation === "drawing")) {
      const src = drawingDataUrl || items[0]?.url;
      return (
        <div className="relative group/drawing overflow-hidden rounded-2xl border bg-white shadow-sm max-w-lg">
          <ShimmerImage
            src={src}
            alt="Drawing"
            className="w-full h-auto object-contain max-h-[500px] cursor-pointer"
            onClick={() => handleOpenGallery([src])}
          />
          <div className="absolute top-2 right-2 opacity-0 group-hover/drawing:opacity-100 transition-opacity flex gap-1 z-10">
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-lg shadow bg-background/80 hover:bg-background backdrop-blur-sm"
              onClick={() => handleOpenGallery([src])}
              aria-label="View fullscreen"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-lg shadow bg-background/80 hover:bg-background backdrop-blur-sm"
              onClick={() => setMarkupImage(src)}
              aria-label="Annotate drawing"
            >
              <Edit3 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }

    // Single photo URL (legacy or direct)
    if (singlePhotoUrl) {
      return (
        <div className="relative group/photo overflow-hidden rounded-2xl border bg-card max-w-lg">
          <ShimmerImage
            src={singlePhotoUrl}
            alt="Photo"
            className="w-full h-auto object-cover max-h-[500px] cursor-pointer"
            onClick={() => handleOpenGallery([singlePhotoUrl])}
          />
          <div className="absolute top-2 right-2 opacity-0 group-hover/photo:opacity-100 transition-opacity flex gap-1 z-10">
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-lg shadow bg-background/80 hover:bg-background backdrop-blur-sm"
              onClick={() => handleOpenGallery([singlePhotoUrl])}
              aria-label="View fullscreen"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-lg shadow bg-background/80 hover:bg-background backdrop-blur-sm"
              onClick={() => setMarkupImage(singlePhotoUrl)}
              aria-label="Annotate photo"
            >
              <Edit3 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }

    // Uploaded photo items or previews
    const allImages = (() => {
      const itemUrls = items
        .map((i) => i.url)
        .filter((url): url is string => Boolean(url));
      if (itemUrls.length > 0) return itemUrls;
      return previewUrls.filter((url): url is string => Boolean(url));
    })();

    if (allImages.length === 0) {
      return null;
    }

    if (allImages.length === 1) {
      const src = allImages[0];
      return (
        <div className="relative group/photo overflow-hidden rounded-2xl border bg-card max-w-lg">
          <ShimmerImage
            src={src}
            alt="Uploaded photo"
            className="w-full h-auto object-cover max-h-[500px] cursor-pointer"
            onClick={() => handleOpenGallery([src])}
          />
          <div className="absolute top-2 right-2 opacity-0 group-hover/photo:opacity-100 transition-opacity flex gap-1 z-10">
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-lg shadow bg-background/80 hover:bg-background backdrop-blur-sm"
              onClick={() => handleOpenGallery([src])}
              aria-label="View fullscreen"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-lg shadow bg-background/80 hover:bg-background backdrop-blur-sm"
              onClick={() => setMarkupImage(src)}
              aria-label="Annotate photo"
            >
              <Edit3 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }

    // Grid for multi-photo albums
    return (
      <div className="space-y-2 max-w-xl">
        <div
          className={`grid gap-1.5 rounded-2xl overflow-hidden ${
            allImages.length === 2
              ? "grid-cols-2"
              : allImages.length === 3
                ? "grid-cols-3"
                : "grid-cols-2 sm:grid-cols-3"
          }`}
        >
          {allImages.slice(0, 6).map((src, index) => {
            const isLastHidden = index === 5 && allImages.length > 6;
            const remainingCount = allImages.length - 6;

            return (
              <div
                key={index}
                className="relative aspect-square cursor-pointer overflow-hidden bg-muted group/item"
                onClick={() => handleOpenGallery(allImages, index)}
              >
                <ShimmerImage
                  src={src}
                  alt={`Photo ${index + 1}`}
                  containerClassName="w-full h-full"
                  className="w-full h-full object-cover group-hover/item:scale-105"
                />
                <div className="absolute top-1.5 right-1.5 opacity-0 group-hover/item:opacity-100 transition-opacity flex gap-1 z-10">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7 rounded-lg shadow bg-background/80 hover:bg-background backdrop-blur-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenGallery(allImages, index);
                    }}
                    aria-label="View fullscreen"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7 rounded-lg shadow bg-background/80 hover:bg-background backdrop-blur-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMarkupImage(src);
                    }}
                    aria-label="Annotate photo"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {isLastHidden && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-lg">
                    +{remainingCount}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {renderMediaContent()}

      {showGallery && (
        <GlobalImageViewer
          images={galleryImages}
          initialIndex={galleryIndex}
          isOpen={showGallery}
          onClose={() => setShowGallery(false)}
          onEdit={(imageUrl) => {
            setShowGallery(false);
            setMarkupImage(imageUrl);
          }}
        />
      )}

      {markupImage && (
        <ImageMarkupEditor
          imageUrl={markupImage}
          isOpen={Boolean(markupImage)}
          onClose={() => setMarkupImage(null)}
          onSend={handleSaveMarkup}
        />
      )}

      {video && (
        <GlobalVideoViewer
          src={video.src}
          title={video.title}
          isOpen={Boolean(video)}
          onClose={() => setVideo(null)}
        />
      )}
    </>
  );
}
