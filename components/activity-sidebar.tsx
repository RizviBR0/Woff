"use client";

import React, { useState, useMemo } from "react";
import { Entry } from "./entry-card";
import {
  extractNoteSlugFromEntry,
  getEntryCategory,
  isSafeLegacyMediaUrl,
  isVideoFile,
  parseLegacyPhotosText,
} from "./entries/entry-types";
import { isSafePosterDataUrl } from "@/lib/video-utils";
import {
  Search,
  Filter,
  Download,
  Eye,
  FileText,
  Film,
  Image as ImageIcon,
  File,
  Play,
  StickyNote,
  Check,
  Pen,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import NextImage from "next/image";
import { toast } from "sonner";
import { downloadFileFromUrl, triggerBlobDownload } from "@/lib/download";
import { addArchiveFiles, addArchiveText, generateArchive } from "@/lib/archive";
import { portableNoteHtml, printPortableNote } from "@/lib/portable-note";
import { formatActivityDate } from "@/lib/date-labels";
import { useClientNow } from "@/lib/hooks/use-client-now";

async function createZip() {
  const JSZip = (await import("jszip")).default;
  return new JSZip();
}

interface ActivitySidebarProps {
  entries: Entry[];
  isOpen: boolean;
  spaceSlug?: string;
}

type FilterType = "all" | "images" | "videos" | "files" | "notes";

interface MetaFileItem {
  name: string;
  size?: number;
  type?: string;
  url: string;
  poster?: string;
}

function formatDateIso(date: Date): string {
  try {
    return date.toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function getItemType(entry: Entry): "image" | "video" | "file" | "note" | "unknown" {
  const category = getEntryCategory(entry);
  if (category === "media") return "image";
  if (category === "file") {
    const metaItems = getMetaItems(entry);
    if (
      metaItems.length > 0 &&
      metaItems.some((item) => isVideoFile(item.type, item.name))
    ) {
      return "video";
    }
    return "file";
  }
  if (category === "note") return "note";
  return "unknown";
}

function getMetaItems(entry: Entry): MetaFileItem[] {
  if (!Array.isArray(entry.meta?.items)) return [];
  return entry.meta.items.filter(
    (item: unknown): item is MetaFileItem =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as MetaFileItem).url === "string" &&
      (item as MetaFileItem).url.length > 0
  );
}

function extractNoteTitle(entry: Entry, fallback = "Untitled note"): string {
  if (typeof entry.meta?.title === "string" && entry.meta.title.trim()) {
    return entry.meta.title.trim();
  }
  if (entry.text?.startsWith("NOTE:")) {
    const parts = entry.text.slice("NOTE:".length).split(":");
    const legacyTitle = parts.slice(2).join(":").trim();
    if (legacyTitle) return legacyTitle;
  }
  return fallback;
}

function extractLegacyImageUrls(entry: Entry): {
  kind: "drawing" | "photo" | "photos";
  urls: string[];
} | null {
  if (entry.kind !== "text" || !entry.text) return null;
  if (entry.text.startsWith("DRAWING:")) {
    const url = entry.text.slice("DRAWING:".length).trim();
    return isSafeLegacyMediaUrl(url) ? { kind: "drawing", urls: [url] } : null;
  }
  if (entry.text.startsWith("PHOTO:")) {
    const url = entry.text.slice("PHOTO:".length).trim();
    return isSafeLegacyMediaUrl(url) ? { kind: "photo", urls: [url] } : null;
  }
  if (entry.text.startsWith("PHOTOS:")) {
    const urls = parseLegacyPhotosText(entry.text.slice("PHOTOS:".length));
    return urls.length > 0 ? { kind: "photos", urls } : null;
  }
  return null;
}

function extensionFromDataUrl(dataUrl: string, fallback = "png"): string {
  const mimeType = dataUrl.split(";")[0]?.split(":")[1]?.toLowerCase();
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/avif") return "avif";
  return fallback;
}

interface SidebarItemProps {
  entry: Entry;
  spaceSlug?: string;
  onDownload: (entry: Entry) => void;
  isDownloading?: boolean;
}

function SidebarItem({
  entry,
  spaceSlug,
  onDownload,
  isDownloading,
}: SidebarItemProps) {
  const scrollToEntry = (e: React.MouseEvent) => {
    e.preventDefault();
    const element = document.getElementById(`entry-${entry.id}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const actionRevealClass = isDownloading
    ? "opacity-100"
    : "opacity-90 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100";

  const type = getItemType(entry);
  const metaItems = getMetaItems(entry);

  // Notes (both modern meta-based and legacy NOTE: text entries)
  if (type === "note") {
    const noteSlug = extractNoteSlugFromEntry(entry);
    const noteTitle = extractNoteTitle(entry, "Untitled note");
    const targetSpaceSlug =
      spaceSlug ||
      (typeof entry.meta?.space_slug === "string"
        ? entry.meta.space_slug
        : undefined);
    const noteUrl = noteSlug
      ? targetSpaceSlug
        ? `/${encodeURIComponent(targetSpaceSlug)}/${encodeURIComponent(noteSlug)}`
        : `/n/${encodeURIComponent(noteSlug)}`
      : null;

    return (
      <div className="group flex items-center gap-2 px-2 py-1.5 hover:bg-accent/50 rounded-lg mx-2 transition-colors">
        <a
          href={`#entry-${entry.id}`}
          onClick={scrollToEntry}
          className="flex items-center gap-3 flex-1 min-w-0 py-1 px-1"
        >
          <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 border border-amber-200 dark:border-amber-800/50">
            <Pen className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-foreground">
              {noteTitle}
            </div>
            <div className="text-xs text-muted-foreground">note</div>
          </div>
        </a>
        {noteUrl && (
          <div
            className={`flex items-center gap-1 shrink-0 transition-opacity ${actionRevealClass}`}
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => window.open(noteUrl, "_blank", "noopener,noreferrer")}
              title="Open note"
              aria-label={`Open note ${noteTitle}`}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={isDownloading}
              onClick={() => onDownload(entry)}
              title={
                isDownloading
                  ? "Preparing print preview…"
                  : "Print / Save as PDF"
              }
              aria-label={`Print or save ${noteTitle} as PDF`}
            >
              {isDownloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Modern uploaded media/files (including kind="file", "pdf", "image" with meta.items)
  if (metaItems.length > 0) {
    const count = metaItems.length;
    const first = metaItems[0];
    const isDrawing =
      entry.meta?.presentation === "drawing" || entry.meta?.type === "drawing";
    const isVisual = type === "image";

    if (isVisual) {
      return (
        <div className="group flex items-center gap-2 px-2 py-1.5 hover:bg-accent/50 rounded-lg mx-2 transition-colors">
          <a
            href={`#entry-${entry.id}`}
            onClick={scrollToEntry}
            className="flex items-center gap-3 flex-1 min-w-0 py-1 px-1"
          >
            <div className="relative h-10 w-10 flex-shrink-0">
              {count > 1 && (
                <>
                  <div className="absolute top-0.5 left-0.5 h-9 w-9 rounded-lg bg-muted border border-border/30" />
                  <div className="absolute top-1 left-1 h-9 w-9 rounded-lg bg-muted border border-border/30" />
                </>
              )}
              <div className="relative h-10 w-10 rounded-lg overflow-hidden bg-muted border border-border/50 z-10">
                {first?.url && (
                  <NextImage
                    src={first.url}
                    alt={first.name || (isDrawing ? "Drawing" : "Photo")}
                    fill
                    unoptimized
                    sizes="40px"
                    className="object-cover"
                  />
                )}
              </div>
              {count > 1 && (
                <div className="absolute -bottom-1 -right-1 z-20 bg-primary text-primary-foreground text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none border-2 border-background">
                  {count}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate text-foreground">
                {isDrawing
                  ? "Drawing"
                  : count > 1
                    ? `${count} photos`
                    : first?.name || "Photo"}
              </div>
              <div className="text-xs text-muted-foreground">
                {isDrawing ? "drawing" : count > 1 ? "images" : "image"}
              </div>
            </div>
          </a>
          <div
            className={`flex items-center gap-1 shrink-0 transition-opacity ${actionRevealClass}`}
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={isDownloading}
              onClick={() => onDownload(entry)}
              title={isDownloading ? "Downloading…" : "Download"}
              aria-label={`Download ${isDrawing ? "drawing" : first?.name || "image"}`}
            >
              {isDownloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      );
    }

    if (type === "video") {
      const videoCount = metaItems.filter((item) =>
        isVideoFile(item.type, item.name),
      ).length;
      const firstVideo =
        metaItems.find((item) => isVideoFile(item.type, item.name)) || first;
      const thumbPoster = isSafePosterDataUrl(firstVideo?.poster)
        ? firstVideo.poster
        : undefined;
      const displayName =
        count > 1
          ? videoCount === count
            ? `${count} videos`
            : `${videoCount} ${videoCount === 1 ? "video" : "videos"} + ${count - videoCount} more`
          : firstVideo?.name || "Video";
      const subtitle = videoCount > 1 ? "videos" : "video";

      return (
        <div className="group flex items-center gap-2 px-2 py-1.5 hover:bg-accent/50 rounded-lg mx-2 transition-colors">
          <a
            href={`#entry-${entry.id}`}
            onClick={scrollToEntry}
            className="flex items-center gap-3 flex-1 min-w-0 py-1 px-1"
          >
            <div className="relative h-10 w-10 flex-shrink-0">
              {count > 1 && (
                <>
                  <div className="absolute top-0.5 left-0.5 h-9 w-9 rounded-lg bg-muted border border-border/30" />
                  <div className="absolute top-1 left-1 h-9 w-9 rounded-lg bg-muted border border-border/30" />
                </>
              )}
              <div className="relative h-10 w-10 rounded-lg overflow-hidden bg-zinc-900 border border-border/50 flex items-center justify-center z-10">
                {thumbPoster ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={thumbPoster}
                    alt={displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Film className="h-4 w-4 text-orange-400" />
                )}
                {thumbPoster && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="h-3.5 w-3.5 fill-white text-white drop-shadow" />
                  </div>
                )}
              </div>
              {count > 1 && (
                <div className="absolute -bottom-1 -right-1 z-20 bg-primary text-primary-foreground text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none border-2 border-background">
                  {count}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate text-foreground">
                {displayName}
              </div>
              <div className="text-xs text-muted-foreground">{subtitle}</div>
            </div>
          </a>
          <div
            className={`flex items-center gap-1 shrink-0 transition-opacity ${actionRevealClass}`}
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={isDownloading}
              onClick={() => onDownload(entry)}
              title={isDownloading ? "Downloading…" : "Download"}
              aria-label={`Download ${displayName}`}
            >
              {isDownloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      );
    }

    const firstName = first?.name || "file";
    const displayName = count > 1 ? "Multiple files" : firstName;
    const subtitle = count > 1 ? `${count} files` : "file";

    return (
      <div className="group flex items-center gap-2 px-2 py-1.5 hover:bg-accent/50 rounded-lg mx-2 transition-colors relative">
        <a
          href={`#entry-${entry.id}`}
          onClick={scrollToEntry}
          className="flex items-center gap-3 flex-1 min-w-0 py-1 px-1"
        >
          <div className="relative h-10 w-10 flex-shrink-0">
            {count > 1 && (
              <>
                <div className="absolute top-0.5 left-0.5 h-9 w-9 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/40" />
                <div className="absolute top-1 left-1 h-9 w-9 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/40" />
              </>
            )}
            <div className="relative h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center border border-orange-200 dark:border-orange-800/50 z-10">
              <File className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-foreground">
              {displayName}
            </div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
        </a>
        <div
          className={`flex items-center gap-1 shrink-0 transition-opacity ${actionRevealClass}`}
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={isDownloading}
            onClick={() => onDownload(entry)}
            title={isDownloading ? "Downloading…" : "Download"}
            aria-label={`Download ${displayName}`}
          >
            {isDownloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Legacy text-encoded image entries (PHOTO:, PHOTOS:, DRAWING:)
  const legacyImages = extractLegacyImageUrls(entry);
  if (legacyImages) {
    const count = legacyImages.urls.length;
    const first = legacyImages.urls[0];
    const label =
      legacyImages.kind === "drawing"
        ? "Drawing"
        : count === 1
          ? "Photo"
          : `${count} images`;
    const sublabel = count === 1 ? "image" : "images";

    return (
      <div className="group flex items-center gap-2 px-2 py-1.5 hover:bg-accent/50 rounded-lg mx-2 transition-colors">
        <a
          href={`#entry-${entry.id}`}
          onClick={scrollToEntry}
          className="flex items-center gap-3 flex-1 min-w-0 py-1 px-1"
        >
          <div className="relative h-10 w-10 flex-shrink-0">
            {count > 1 && (
              <>
                <div className="absolute top-0.5 left-0.5 h-9 w-9 rounded-lg bg-muted border border-border/30" />
                <div className="absolute top-1 left-1 h-9 w-9 rounded-lg bg-muted border border-border/30" />
              </>
            )}
            <div className="relative h-10 w-10 rounded-lg overflow-hidden bg-muted border border-border/50 z-10">
              {first && (
                <NextImage
                  src={first}
                  alt={label}
                  fill
                  unoptimized
                  sizes="40px"
                  className="object-cover"
                />
              )}
            </div>
            {count > 1 && (
              <div className="absolute -bottom-1 -right-1 z-20 bg-primary text-primary-foreground text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none border-2 border-background">
                {count}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-foreground">
              {label}
            </div>
            <div className="text-xs text-muted-foreground">{sublabel}</div>
          </div>
        </a>
        <div
          className={`flex items-center gap-1 shrink-0 transition-opacity ${actionRevealClass}`}
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={isDownloading}
            onClick={() => onDownload(entry)}
            title={isDownloading ? "Downloading…" : "Download"}
            aria-label={`Download ${label}`}
          >
            {isDownloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

export function ActivitySidebar({
  entries,
  isOpen,
  spaceSlug,
}: ActivitySidebarProps) {
  const clientNow = useClientNow(60_000);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const items = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries
      .filter((e) => {
        const type = getItemType(e);
        if (type === "unknown") return false;

        if (activeFilter === "images" && type !== "image") return false;
        if (activeFilter === "videos" && type !== "video") return false;
        if (activeFilter === "files" && type !== "file") return false;
        if (activeFilter === "notes" && type !== "note") return false;

        if (q) {
          if (type === "note") {
            return extractNoteTitle(e, "note").toLowerCase().includes(q);
          }
          const metaItems = getMetaItems(e);
          if (metaItems.length > 0) {
            const matchesName = metaItems.some((item) =>
              (item.name || "").toLowerCase().includes(q)
            );
            if (matchesName) return true;
            if (type === "video") {
              return "video videos clip".includes(q);
            }
            if (type === "image") {
              const isDrawing =
                e.meta?.presentation === "drawing" ||
                e.meta?.type === "drawing";
              return (isDrawing ? "drawing image" : "photo image").includes(q);
            }
            return false;
          }
          const legacy = extractLegacyImageUrls(e);
          if (legacy) {
            const label =
              legacy.kind === "drawing" ? "drawing image" : "photo image";
            return label.includes(q);
          }
          return false;
        }
        return true;
      })
      .slice()
      .sort(
        (a, b) =>
          (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)
      );
  }, [entries, activeFilter, searchQuery]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, Entry[]> = {};
    items.forEach((item) => {
      const dateKey = formatActivityDate(item.created_at, clientNow);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    });
    return groups;
  }, [items, clientNow]);

  const [downloadingEntryId, setDownloadingEntryId] = useState<string | null>(
    null
  );
  const [downloadingDateGroup, setDownloadingDateGroup] = useState<
    string | null
  >(null);

  const handleDownload = async (entry: Entry) => {
    if (downloadingEntryId) return;
    setDownloadingEntryId(entry.id);
    let toastId: string | number | undefined;
    const controller = new AbortController();
    const cancelAction = { label: "Cancel", onClick: () => controller.abort() };

    try {
      const type = getItemType(entry);
      const metaItems = getMetaItems(entry);

      if (metaItems.length > 0) {
        if (metaItems.length === 1) {
          const single = metaItems[0];
          const label =
            single.name ||
            (type === "image" ? "photo.png" : type === "video" ? "video.mp4" : "file");
          toastId = toast.loading(`Preparing "${label}" for download...`);
          await downloadFileFromUrl(single.url, label);
          toast.success(`Download started for "${label}"`, { id: toastId });
        } else {
          const noun =
            type === "image" ? "photos" : type === "video" ? "videos" : "files";
          toastId = toast.loading(
            `Preparing ZIP for ${metaItems.length} ${noun}...`,
            { action: cancelAction }
          );
          const zip = await createZip();
          await addArchiveFiles(
            zip,
            metaItems.map((item, idx) => ({
              url: item.url,
              name: item.name || `file-${idx + 1}`,
            })),
            {
              signal: controller.signal,
              onProgress: (done, total) =>
                toast.loading(`Preparing ZIP: ${done}/${total}`, {
                  id: toastId,
                  action: cancelAction,
                }),
            }
          );
          const zipBlob = await generateArchive(zip, {
            signal: controller.signal,
          });
          triggerBlobDownload(
            zipBlob,
            `${noun}-${entry.id}.zip`
          );
          toast.success("ZIP download started", { id: toastId });
        }
        return;
      }

      const legacyImages = extractLegacyImageUrls(entry);
      if (legacyImages) {
        if (legacyImages.urls.length === 1) {
          const url = legacyImages.urls[0];
          const fallbackExt = legacyImages.kind === "drawing" ? "png" : "jpg";
          const ext = url.startsWith("data:")
            ? extensionFromDataUrl(url, fallbackExt)
            : fallbackExt;
          toastId = toast.loading(
            `Preparing ${legacyImages.kind === "drawing" ? "drawing" : "photo"} download...`
          );
          await downloadFileFromUrl(
            url,
            `${legacyImages.kind === "drawing" ? "drawing" : "photo"}-${entry.id}.${ext}`
          );
          toast.success("Download started", { id: toastId });
        } else {
          toastId = toast.loading(
            `Preparing ZIP for ${legacyImages.urls.length} photos...`,
            { action: cancelAction }
          );
          const zip = await createZip();
          const remoteUrls: { url: string; name: string }[] = [];
          legacyImages.urls.forEach((url, index) => {
            if (url.startsWith("data:image/")) {
              const base64Data = url.split(",")[1];
              if (base64Data) {
                zip.file(
                  `photo-${index + 1}.${extensionFromDataUrl(url, "jpg")}`,
                  base64Data,
                  { base64: true }
                );
              }
            } else {
              remoteUrls.push({ url, name: `photo-${index + 1}.jpg` });
            }
          });
          if (remoteUrls.length > 0) {
            await addArchiveFiles(zip, remoteUrls, {
              signal: controller.signal,
              onProgress: (done, total) =>
                toast.loading(`Preparing ZIP: ${done}/${total} photos`, {
                  id: toastId,
                  action: cancelAction,
                }),
            });
          }
          const content = await generateArchive(zip, {
            signal: controller.signal,
          });
          triggerBlobDownload(content, `photos-${entry.id}.zip`);
          toast.success("ZIP download started", { id: toastId });
        }
        return;
      }

      if (type === "note") {
        const noteSlug = extractNoteSlugFromEntry(entry);
        if (!noteSlug) throw new Error("Invalid note link");
        const noteTitle = extractNoteTitle(entry, "Untitled Note");

        toastId = toast.loading(`Preparing "${noteTitle}" for print…`, {
          action: cancelAction,
        });
        const res = await fetch(`/api/notes/${encodeURIComponent(noteSlug)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to fetch note");
        const note = await res.json();
        if (note.is_locked && !note.is_owner) {
          throw new Error("This note is private.");
        }
        await printPortableNote(note.title || noteTitle, note.content || "");
        toast.success("Choose Save as PDF in the print dialog", {
          id: toastId,
        });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        if (toastId) toast.message("Download cancelled", { id: toastId });
      } else {
        const message =
          error instanceof Error
            ? error.message
            : "Download failed. Please try again.";
        if (toastId) toast.error(message, { id: toastId });
        else toast.error(message);
      }
    } finally {
      setDownloadingEntryId(null);
    }
  };

  const handleDownloadAll = async (
    dateGroup: string,
    groupEntries: Entry[]
  ) => {
    if (downloadingDateGroup) return;
    setDownloadingDateGroup(dateGroup);
    const controller = new AbortController();
    const cancelAction = { label: "Cancel", onClick: () => controller.abort() };
    const toastId = toast.loading(
      `Preparing ZIP archive for ${groupEntries.length} items...`,
      { action: cancelAction }
    );
    try {
      const zip = await createZip();

      const remoteFiles: { url: string; name: string }[] = [];
      for (const entry of groupEntries) {
        const type = getItemType(entry);
        const metaItems = getMetaItems(entry);
        if (metaItems.length > 0) {
          const folder =
            type === "image" ? "images" : type === "video" ? "videos" : "files";
          for (const item of metaItems) {
            remoteFiles.push({
              url: item.url,
              name: `${folder}/${item.name || `file-${entry.id}`}`,
            });
          }
          continue;
        }
        const legacyImages = extractLegacyImageUrls(entry);
        if (legacyImages) {
          legacyImages.urls.forEach((url, index) => {
            if (!url.startsWith("data:")) {
              const prefix =
                legacyImages.kind === "drawing" ? "drawing" : "photo";
              remoteFiles.push({
                url,
                name: `images/${prefix}-${entry.id}-${index + 1}.jpg`,
              });
            }
          });
        }
      }

      if (remoteFiles.length > 0) {
        await addArchiveFiles(zip, remoteFiles, {
          signal: controller.signal,
          onProgress: (done, total) =>
            toast.loading(`Preparing ZIP: ${done}/${total} files`, {
              id: toastId,
              action: cancelAction,
            }),
        });
      }

      for (const entry of groupEntries) {
        controller.signal.throwIfAborted();
        if (getMetaItems(entry).length > 0) continue;

        const legacyImages = extractLegacyImageUrls(entry);
        if (legacyImages) {
          legacyImages.urls.forEach((url, index) => {
            if (!url.startsWith("data:image/")) return;
            const base64Data = url.split(",")[1];
            if (!base64Data) return;
            const prefix =
              legacyImages.kind === "drawing" ? "drawing" : "photo";
            const ext = extensionFromDataUrl(
              url,
              legacyImages.kind === "drawing" ? "png" : "jpg"
            );
            const suffix = legacyImages.urls.length > 1 ? `-${index + 1}` : "";
            zip.file(`images/${prefix}-${entry.id}${suffix}.${ext}`, base64Data, {
              base64: true,
            });
          });
          continue;
        }

        if (getItemType(entry) === "note") {
          const noteSlug = extractNoteSlugFromEntry(entry);
          if (!noteSlug) {
            throw new Error("A note link is invalid. No partial ZIP was downloaded.");
          }
          const noteTitle = extractNoteTitle(entry, "Untitled Note");
          const res = await fetch(
            `/api/notes/${encodeURIComponent(noteSlug)}`,
            { signal: controller.signal }
          );
          if (!res.ok) {
            throw new Error("A note is unavailable. No partial ZIP was downloaded.");
          }
          const note = await res.json();
          if (note.is_locked && !note.is_owner) {
            throw new Error("A note is private. No partial ZIP was downloaded.");
          }
          const html = await portableNoteHtml(
            note.title || noteTitle,
            note.content || "",
            controller.signal
          );
          const safeName =
            (note.title || noteTitle)
              .replace(/[\x00-\x1f/\\:*?"<>|]/g, "_")
              .slice(0, 120) || "note";
          let filename = `notes/${safeName}.html`;
          let suffix = 1;
          while (zip.files[filename]) {
            filename = `notes/${safeName} (${suffix++}).html`;
          }
          addArchiveText(zip, filename, html);
          zip.file(
            "README.txt",
            "Notes are portable HTML with embedded images. Open a note in a browser and choose Print / Save as PDF. Files retain their original formats. Keep this export before your room expires."
          );
        }
      }

      const content = await generateArchive(zip, { signal: controller.signal });
      triggerBlobDownload(
        content,
        `woff-files-${formatDateIso(new Date())}.zip`
      );
      toast.success("ZIP download started", { id: toastId });
    } catch (error) {
      if (controller.signal.aborted) {
        toast.message("ZIP cancelled", { id: toastId });
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to generate ZIP archive",
          { id: toastId }
        );
      }
    } finally {
      setDownloadingDateGroup(null);
    }
  };

  const filterOptions: {
    value: FilterType;
    label: string;
    icon: React.ReactNode;
  }[] = [
    { value: "all", label: "All", icon: null },
    {
      value: "images",
      label: "Images",
      icon: <ImageIcon className="h-4 w-4" />,
    },
    {
      value: "videos",
      label: "Videos",
      icon: <Film className="h-4 w-4" />,
    },
    { value: "files", label: "Files", icon: <File className="h-4 w-4" /> },
    {
      value: "notes",
      label: "Notes",
      icon: <StickyNote className="h-4 w-4" />,
    },
  ];

  if (!isOpen) {
    return null;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden bg-transparent">
      {/* Search bar with filter */}
      <div className="p-3 border-b border-zinc-200/80 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 dark:text-zinc-500 z-10"
              aria-hidden="true"
            />
            <Input
              type="text"
              placeholder="Search"
              aria-label="Search shared items"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-900/50 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
            />
          </div>
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Filter shared items"
                title="Filter shared items"
                className={`h-9 w-9 flex-shrink-0 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
                  activeFilter !== "all" ? "border-primary text-primary" : ""
                }`}
              >
                <Filter className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="end">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setActiveFilter(option.value);
                    setFilterOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors ${
                    activeFilter === option.value ? "bg-accent" : ""
                  }`}
                >
                  {option.icon}
                  <span className="flex-1 text-left">{option.label}</span>
                  {activeFilter === option.value && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 hover-scrollbar">
        {Object.keys(groupedItems).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center animate-in fade-in slide-in-from-bottom-3 duration-500 ease-out">
            <div className="h-12 w-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3 transition-all duration-300 hover:scale-110 hover:rotate-6 shadow-sm border border-zinc-200/20 dark:border-white/[0.02]">
              <FileText className="h-6 w-6 text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 tracking-tight">
              {searchQuery || activeFilter !== "all"
                ? "No matches"
                : "Nothing shared yet"}
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 max-w-[180px] mx-auto leading-relaxed">
              Files, images, and notes will appear here
            </p>
          </div>
        ) : (
          Object.entries(groupedItems).map(([dateGroup, groupEntries]) => (
            <div
              key={dateGroup}
              className="py-2 border-b border-zinc-100/50 dark:border-white/[0.02] last:border-0"
            >
              {/* Date header */}
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  {dateGroup}
                </span>
                {groupEntries.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadAll(dateGroup, groupEntries)}
                    disabled={Boolean(downloadingDateGroup)}
                    className="h-auto p-0 inline-flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-transparent font-normal disabled:opacity-60"
                  >
                    {downloadingDateGroup === dateGroup ? (
                      <>
                        <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
                        <span className="text-primary font-medium">
                          Zipping…
                        </span>
                      </>
                    ) : (
                      "Download all"
                    )}
                  </Button>
                )}
              </div>
              {/* Items */}
              <div className="space-y-0.5">
                {groupEntries.map((entry) => (
                  <SidebarItem
                    key={entry.id}
                    entry={entry}
                    spaceSlug={spaceSlug}
                    onDownload={handleDownload}
                    isDownloading={downloadingEntryId === entry.id}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
