"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Archive,
  Download,
  Eye,
  File,
  FileCode,
  FileSpreadsheet,
  FileText,
  Film,
  FolderArchive,
  Image as ImageIcon,
  Loader2,
  Music,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";
import { downloadFileFromUrl, triggerBlobDownload } from "@/lib/download";
import { openOrCreateNoteForMarkdownFile } from "@/lib/actions";
import { addArchiveFiles, generateArchive } from "@/lib/archive";
import {
  isImageFile,
  isVideoFile,
  type Entry,
  type UploadedFileItem,
} from "./entry-types";
import { VideoThumbnailGrid } from "./video-thumbnail-grid";

const GlobalVideoViewer = dynamic(
  () =>
    import("../global-video-viewer").then((module) => module.GlobalVideoViewer),
  { ssr: false },
);

const GlobalImageViewer = dynamic(
  () =>
    import("../global-image-viewer").then((module) => module.GlobalImageViewer),
  { ssr: false },
);

interface FileEntryCardProps {
  entry: Entry;
  spaceSlug?: string;
  canWrite?: boolean;
}

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function isMarkdownFile(name: string, type?: string) {
  const ext = getFileExtension(name);
  return (
    ["md", "markdown", "mdown", "mkdn", "mdwn", "mdtxt", "mdtext"].includes(ext) ||
    type === "text/markdown" ||
    type === "text/x-markdown"
  );
}

function getFileIcon(type: string, name: string) {
  const ext = getFileExtension(name);

  if (["md", "markdown"].includes(ext) || type === "text/markdown" || type === "text/x-markdown") {
    return <FileText className="h-5 w-5 text-sky-500" />;
  }
  if (type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext)) {
    return <ImageIcon className="h-5 w-5 text-blue-500" />;
  }
  if (type === "application/pdf" || ext === "pdf") {
    return <FileText className="h-5 w-5 text-red-500" />;
  }
  if (type.startsWith("video/") || ["mp4", "webm", "mkv", "mov", "m4v", "ogv"].includes(ext)) {
    return <Film className="h-5 w-5 text-purple-500" />;
  }
  if (type.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a"].includes(ext)) {
    return <Music className="h-5 w-5 text-green-500" />;
  }
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) {
    return <Archive className="h-5 w-5 text-amber-500" />;
  }
  if (["js", "ts", "tsx", "jsx", "json", "html", "css", "py", "sql"].includes(ext)) {
    return <FileCode className="h-5 w-5 text-indigo-500" />;
  }
  if (["csv", "xlsx", "xls"].includes(ext)) {
    return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />;
  }

  return <File className="h-5 w-5 text-muted-foreground" />;
}

export function FileEntryCard({ entry, spaceSlug, canWrite = true }: FileEntryCardProps) {
  const router = useRouter();
  const [isZipping, setIsZipping] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [openingNoteIndex, setOpeningNoteIndex] = useState<number | null>(null);
  const [videoViewerIndex, setVideoViewerIndex] = useState<number | null>(null);
  const [imageViewerIndex, setImageViewerIndex] = useState<number | null>(null);

  const isPlaceholder =
    entry.id.startsWith("placeholder-") || Boolean(entry.isLoading);

  const items: UploadedFileItem[] = useMemo(() => {
    if (Array.isArray(entry.meta?.items)) return entry.meta.items;
    return [];
  }, [entry.meta?.items]);

  const { videoItems, imageItems, otherItems } = useMemo(() => {
    const videos: UploadedFileItem[] = [];
    const images: UploadedFileItem[] = [];
    const others: UploadedFileItem[] = [];
    for (const item of items) {
      if (isVideoFile(item.type, item.name)) {
        videos.push(item);
      } else if (isImageFile(item.type, item.name) && item.url) {
        images.push(item);
      } else {
        others.push(item);
      }
    }
    return { videoItems: videos, imageItems: images, otherItems: others };
  }, [items]);

  const openInRichNote = async (file: UploadedFileItem, index: number) => {
    if (!canWrite || openingNoteIndex !== null) return;
    setOpeningNoteIndex(index);
    const toastId = toast.loading(`Opening "${file.name}" in Rich Note…`);
    try {
      const res = await fetch(file.url);
      if (!res.ok) {
        throw new Error("Could not load Markdown file content. Please retry.");
      }
      const markdownContent = await res.text();

      const { noteSlug } = await openOrCreateNoteForMarkdownFile({
        spaceId: entry.space_id,
        fileName: file.name,
        markdownContent,
      });

      toast.dismiss(toastId);
      const targetSlug = spaceSlug || entry.meta?.space_slug;
      const targetUrl = targetSlug
        ? `/${encodeURIComponent(targetSlug)}/${encodeURIComponent(noteSlug)}`
        : `/n/${encodeURIComponent(noteSlug)}`;
      router.push(targetUrl);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to open rich note",
        { id: toastId },
      );
    } finally {
      setOpeningNoteIndex(null);
    }
  };

  const downloadFile = async (url: string, name: string, key: string) => {
    if (downloadingKey !== null || !url) return;
    setDownloadingKey(key);
    const toastId = toast.loading(`Preparing "${name}" for download...`);
    try {
      await downloadFileFromUrl(url, name);
      toast.success(`Download started for "${name}"`, { id: toastId });
    } catch {
      toast.error(`Failed to download "${name}"`, { id: toastId });
    } finally {
      setDownloadingKey(null);
    }
  };

  const downloadAllAsZip = async () => {
    const downloadableItems = items.filter((item) => Boolean(item.url));
    if (!downloadableItems.length || isZipping) return;
    setIsZipping(true);
    const controller = new AbortController();
    const cancelAction = { label: "Cancel", onClick: () => controller.abort() };
    const allVideosOnly =
      videoItems.length === items.length && videoItems.length > 0;
    const noun = allVideosOnly ? "videos" : "files";
    const toastId = toast.loading(
      `Preparing ZIP archive for ${downloadableItems.length} ${noun}...`,
      { action: cancelAction },
    );
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      await addArchiveFiles(
        zip,
        downloadableItems.map((file, index) => ({
          url: file.url,
          name: file.name || `file-${index + 1}`,
        })),
        {
          signal: controller.signal,
          onProgress: (done, total) =>
            toast.loading(`Preparing ZIP: ${done}/${total} ${noun}`, {
              id: toastId,
              action: cancelAction,
            }),
        },
      );

      const zipBlob = await generateArchive(zip, { signal: controller.signal });
      triggerBlobDownload(
        zipBlob,
        `woff-${noun}-${Date.now()}.zip`,
      );
      toast.success("ZIP download started", { id: toastId });
    } catch (err) {
      if (controller.signal.aborted) {
        toast.info("ZIP download cancelled", { id: toastId });
      } else {
        toast.error(
          err instanceof Error ? err.message : "Failed to generate ZIP archive",
          { id: toastId },
        );
      }
    } finally {
      setIsZipping(false);
    }
  };

  if (!items.length) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground rounded-xl border bg-card">
        <File className="h-4 w-4" />
        <span>Empty file attachment</span>
      </div>
    );
  }

  const hasVisualMedia = videoItems.length > 0 || imageItems.length > 0;
  const allVideosOnly = videoItems.length === items.length;
  const headerLabel = allVideosOnly
    ? `${videoItems.length} videos`
    : `${items.length} files attached`;

  const downloadingVideoIndex =
    downloadingKey && downloadingKey.startsWith("video-")
      ? Number(downloadingKey.slice("video-".length))
      : null;

  return (
    <>
      <div className={`w-full space-y-2 ${hasVisualMedia ? "max-w-xl" : "max-w-md"}`}>
        {items.length > 1 && (
          <div className="flex items-center justify-between px-1 pb-0.5">
            <span className="text-xs font-medium text-muted-foreground">
              {headerLabel}
            </span>
            {!isPlaceholder && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={downloadAllAsZip}
                disabled={isZipping}
              >
                {isZipping ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FolderArchive className="h-3.5 w-3.5" />
                )}
                Download all (.zip)
              </Button>
            )}
          </div>
        )}

        {/* Watchable video card or multi-video thumbnail grid */}
        {videoItems.length > 0 && (
          <VideoThumbnailGrid
            videos={videoItems}
            disabled={isPlaceholder}
            downloadingIndex={downloadingVideoIndex}
            onPlay={(idx) => {
              if (!isPlaceholder && videoItems[idx]?.url) {
                setVideoViewerIndex(idx);
              }
            }}
            onDownload={
              isPlaceholder
                ? undefined
                : (video, idx) =>
                    void downloadFile(video.url, video.name, `video-${idx}`)
            }
          />
        )}

        {/* Mixed-batch photo previews (when photos & videos/files were sent together) */}
        {imageItems.length > 0 && (
          <div
            className={`grid gap-1.5 overflow-hidden rounded-2xl ${
              imageItems.length === 1
                ? "max-w-md grid-cols-1"
                : imageItems.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-2 sm:grid-cols-3"
            }`}
          >
            {imageItems.slice(0, 6).map((img, idx) => {
              const remaining = idx === 5 && imageItems.length > 6 ? imageItems.length - 6 : 0;
              return (
                <button
                  key={`${img.url}-${idx}`}
                  type="button"
                  disabled={isPlaceholder}
                  onClick={() => setImageViewerIndex(idx)}
                  aria-label={`View image ${img.name}`}
                  className={`group/img relative overflow-hidden bg-muted text-left ${
                    imageItems.length === 1 ? "max-h-[340px]" : "aspect-square"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.name}
                    loading="lazy"
                    className={`h-full w-full object-cover transition-transform duration-300 group-hover/img:scale-105 ${
                      imageItems.length === 1 ? "max-h-[340px]" : ""
                    }`}
                  />
                  {remaining > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-lg font-bold text-white">
                      +{remaining}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Non-media file attachment rows */}
        {otherItems.length > 0 && (
          <div className="max-w-md space-y-1.5">
            {otherItems.map((file, idx) => {
              const canOpenInNote =
                canWrite && !isPlaceholder && isMarkdownFile(file.name, file.type);
              const downloadKey = `file-${idx}`;
              const isRowDownloading = downloadingKey === downloadKey;

              return (
                <div
                  key={`${file.path || file.name}-${idx}`}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl border bg-card hover:bg-muted/50 transition-colors"
                >
                  {canOpenInNote ? (
                    <button
                      type="button"
                      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer group/mdinfo bg-transparent border-0 p-0"
                      onClick={() => void openInRichNote(file, idx)}
                      disabled={openingNoteIndex === idx}
                      title={`Open ${file.name} in Rich Note`}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {getFileIcon(file.type, file.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate text-foreground group-hover/mdinfo:text-sky-600 dark:group-hover/mdinfo:text-sky-400 transition-colors">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(file.size)}
                        </p>
                      </div>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {getFileIcon(file.type, file.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(file.size)}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    {canOpenInNote && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 hover:bg-muted text-muted-foreground hover:text-foreground"
                        onClick={() => void openInRichNote(file, idx)}
                        disabled={openingNoteIndex === idx}
                        aria-label={`Open ${file.name} in Rich Note`}
                        title={`Open ${file.name} in Rich Note`}
                      >
                        {openingNoteIndex === idx ? (
                          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    )}

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 hover:bg-muted"
                      onClick={() =>
                        void downloadFile(file.url, file.name, downloadKey)
                      }
                      disabled={isPlaceholder || isRowDownloading}
                      aria-label={`Download ${file.name}`}
                      title={
                        isRowDownloading
                          ? "Downloading…"
                          : `Download ${file.name}`
                      }
                    >
                      {isRowDownloading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <Download className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {videoViewerIndex !== null && (
        <GlobalVideoViewer
          isOpen={videoViewerIndex !== null}
          videos={videoItems}
          initialIndex={videoViewerIndex}
          onClose={() => setVideoViewerIndex(null)}
        />
      )}

      {imageViewerIndex !== null && (
        <GlobalImageViewer
          images={imageItems.map((img) => img.url)}
          initialIndex={imageViewerIndex}
          isOpen={imageViewerIndex !== null}
          onClose={() => setImageViewerIndex(null)}
          getDownloadFilename={(idx) =>
            imageItems[idx]?.name || `photo-${idx + 1}.png`
          }
        />
      )}
    </>
  );
}
