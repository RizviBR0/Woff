"use client";

import React, { useState, useMemo } from "react";
import { Entry } from "./entry-card";
import {
  Search,
  Filter,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  File,
  StickyNote,
  Check,
  Pen,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import NextImage from "next/image";
import { toast } from "sonner";
import { downloadFileFromUrl, triggerBlobDownload } from "@/lib/download";
import { addArchiveFiles, generateArchive } from "@/lib/archive";

async function createZip() {
  const JSZip = (await import("jszip")).default;
  return new JSZip();
}

async function createPdf(options: {
  orientation: "portrait" | "landscape";
  unit: "mm";
  format: "a4";
}) {
  const { jsPDF } = await import("jspdf");
  return new jsPDF(options);
}

interface ActivitySidebarProps {
  entries: Entry[];
  isOpen: boolean;
  spaceSlug?: string;
}

type FilterType = "all" | "images" | "files" | "notes";

function formatDateGroup(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) return "Today";

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();
    if (isYesterday) return "Yesterday";

    return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(d);
  } catch {
    return "";
  }
}

function formatNoteDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

function formatDateIso(date: Date): string {
  try {
    return date.toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function getItemType(entry: Entry): "image" | "file" | "note" | "unknown" {
  if (entry.kind === "file") {
    const presentation = entry.meta?.presentation;
    if (presentation === "photos" || presentation === "drawing") return "image";
    return "file";
  }
  if (entry.kind === "image") return "image";
  if (entry.kind === "pdf") return "file";
  if (entry.meta?.type === "note") return "note";
  if (entry.kind === "text" && entry.text) {
    if (
      entry.text.startsWith("DRAWING:") ||
      entry.text.startsWith("PHOTO:") ||
      entry.text.startsWith("PHOTOS:")
    )
      return "image";
    if (entry.text.startsWith("NOTE:")) return "note";
  }
  return "unknown";
}

interface SidebarItemProps {
  entry: Entry;
  spaceSlug?: string;
  onDownload: (entry: Entry) => void;
  isDownloading?: boolean;
}

function SidebarItem({ entry, spaceSlug, onDownload, isDownloading }: SidebarItemProps) {
  const [hovering, setHovering] = useState(false);

  // Helper function for smooth scrolling
  const scrollToEntry = (e: React.MouseEvent) => {
    e.preventDefault();
    const element = document.getElementById(`entry-${entry.id}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // Modern File & Media entries
  if (entry.kind === "file" || entry.kind === "pdf") {
    const items: Array<{
      name: string;
      size: number;
      type: string;
      url: string;
    }> = entry.meta?.items || [];
    const count = items.length;
    const first = items[0];
    const isPhotos = entry.meta?.presentation === "photos";
    const isDrawing = entry.meta?.presentation === "drawing";

    // Photos / Drawing presentation: show real image thumbnail
    if (isPhotos || isDrawing) {
      return (
        <a
          href={`#entry-${entry.id}`}
          onClick={scrollToEntry}
          className="group flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 rounded-lg mx-2 transition-colors"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
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
              {isDrawing ? "Drawing" : count > 1 ? `${count} photos` : first?.name || "Photo"}
            </div>
            <div className="text-xs text-muted-foreground">
              {isDrawing ? "drawing" : count > 1 ? "images" : "image"}
            </div>
          </div>
          {(hovering || isDownloading) && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={isDownloading}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDownload(entry);
                }}
                title={isDownloading ? "Downloading…" : "Download"}
              >
                {isDownloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          )}
        </a>
      );
    }

    const firstName = items[0]?.name || "file";
    const displayName = count > 1 ? "Multiple files" : firstName;
    const subtitle = count > 1 ? `${count} files` : "file";

    return (
      <a
        href={`#entry-${entry.id}`}
        onClick={scrollToEntry}
        className="group flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 rounded-lg mx-2 transition-colors relative"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {/* Thumbnail */}
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

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate text-foreground">
            {displayName}
          </div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>

        {/* Hover actions */}
        {(hovering || isDownloading) && (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={isDownloading}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDownload(entry);
              }}
              title={isDownloading ? "Downloading…" : "Download"}
            >
              {isDownloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )}
      </a>
    );
  }

  // Image entries (PHOTO, PHOTOS, DRAWING)
  if (entry.kind === "text" && entry.text) {
    if (entry.text.startsWith("DRAWING:")) {
      const dataUrl = entry.text.replace("DRAWING:", "");
      return (
        <a
          href={`#entry-${entry.id}`}
          onClick={scrollToEntry}
          className="group flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 rounded-lg mx-2 transition-colors"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <div className="relative h-10 w-10 rounded-lg overflow-hidden bg-muted border border-border/50 flex-shrink-0">
            <NextImage
              src={dataUrl}
              alt="Drawing"
              fill
              unoptimized
              sizes="40px"
              className="object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-foreground">
              Drawing
            </div>
            <div className="text-xs text-muted-foreground">image</div>
          </div>
          {(hovering || isDownloading) && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={isDownloading}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDownload(entry);
                }}
                title={isDownloading ? "Downloading…" : "Download"}
              >
                {isDownloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          )}
        </a>
      );
    }

    if (entry.text.startsWith("PHOTO:")) {
      const dataUrl = entry.text.replace("PHOTO:", "");
      return (
        <a
          href={`#entry-${entry.id}`}
          onClick={scrollToEntry}
          className="group flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 rounded-lg mx-2 transition-colors"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <div className="relative h-10 w-10 rounded-lg overflow-hidden bg-muted border border-border/50 flex-shrink-0">
            <NextImage
              src={dataUrl}
              alt="Photo"
              fill
              unoptimized
              sizes="40px"
              className="object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-foreground">
              Photo
            </div>
            <div className="text-xs text-muted-foreground">image</div>
          </div>
          {(hovering || isDownloading) && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={isDownloading}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDownload(entry);
                }}
                title={isDownloading ? "Downloading…" : "Download"}
              >
                {isDownloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          )}
        </a>
      );
    }

    if (entry.text.startsWith("PHOTOS:")) {
      const raw = entry.text.replace("PHOTOS:", "");
      let photos: string[] = [];
      try {
        if (raw.trim().startsWith("[")) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            photos = parsed.filter(
              (v) => typeof v === "string" && v.startsWith("data:image")
            );
          }
        } else {
          photos = raw
            .split(",")
            .map((u) => u.trim())
            .filter((u) => u.startsWith("data:image"));
        }
      } catch {
        photos = raw
          .split(",")
          .map((u) => u.trim())
          .filter((u) => u.startsWith("data:image"));
      }

      const count = photos.length;
      const first = photos[0];

      return (
        <a
          href={`#entry-${entry.id}`}
          onClick={scrollToEntry}
          className="group flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 rounded-lg mx-2 transition-colors"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <div className="relative h-10 w-10 flex-shrink-0">
            {/* Stacked thumbnails effect for multi-image */}
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
                  alt="Photos"
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
              {count === 1 ? "Photo" : `${count} images`}
            </div>
            <div className="text-xs text-muted-foreground">
              {count === 1 ? "image" : "images"}
            </div>
          </div>
          {(hovering || isDownloading) && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={isDownloading}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDownload(entry);
                }}
                title={isDownloading ? "Downloading…" : "Download"}
              >
                {isDownloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          )}
        </a>
      );
    }

    if (entry.meta?.type === "note" || entry.text.startsWith("NOTE:")) {
      const noteData = entry.text?.startsWith("NOTE:")
        ? entry.text.replace("NOTE:", "").split(":")
        : [];
      const noteSlug = entry.meta?.note_slug || noteData[0];
      const noteTitle = entry.meta?.title || noteData[2] || "Untitled note";
      const noteUrl = spaceSlug
        ? `/${spaceSlug}/${noteSlug}`
        : entry.meta?.space_slug
          ? `/${entry.meta.space_slug}/${noteSlug}`
          : `/n/${noteSlug}`;

      return (
        <a
          href={`#entry-${entry.id}`}
          onClick={scrollToEntry}
          className="group flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 rounded-lg mx-2 transition-colors"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
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
          {(hovering || isDownloading) && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(noteUrl, "_blank");
                }}
                title="Preview"
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={isDownloading}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDownload(entry);
                }}
                title={isDownloading ? "Generating PDF…" : "Download PDF"}
              >
                {isDownloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          )}
        </a>
      );
    }
  }

  return null;
}

export function ActivitySidebar({ entries, isOpen, spaceSlug }: ActivitySidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [filterOpen, setFilterOpen] = useState(false);

  // Filter relevant entries
  const items = useMemo(() => {
    return entries
      .filter((e) => {
        const type = getItemType(e);
        if (type === "unknown") return false;

        // Apply type filter
        if (activeFilter === "images" && type !== "image") return false;
        if (activeFilter === "files" && type !== "file") return false;
        if (activeFilter === "notes" && type !== "note") return false;

        // Apply search filter (basic name matching)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          if (e.kind === "file" && e.meta?.items?.[0]?.name) {
            return e.meta.items[0].name.toLowerCase().includes(q);
          }
          if (e.meta?.type === "note" || e.text?.startsWith("NOTE:")) {
            const noteData = e.text?.startsWith("NOTE:")
              ? e.text.replace("NOTE:", "").split(":")
              : [];
            const noteTitle = e.meta?.title || noteData[2] || "note";
            return noteTitle.toLowerCase().includes(q);
          }
          // For images, just include them if searching (no specific name)
          return true;
        }
        return true;
      })
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at)); // newest first
  }, [entries, activeFilter, searchQuery]);

  // Group items by date
  const groupedItems = useMemo(() => {
    const groups: { [key: string]: Entry[] } = {};
    items.forEach((item) => {
      const dateKey = formatDateGroup(item.created_at);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    });
    return groups;
  }, [items]);

  const [downloadingEntryId, setDownloadingEntryId] = useState<string | null>(null);
  const [downloadingDateGroup, setDownloadingDateGroup] = useState<string | null>(null);

  const handleDownload = async (entry: Entry) => {
    if (downloadingEntryId) return;
    setDownloadingEntryId(entry.id);
    let toastId: string | number | undefined;
    const controller = new AbortController();

    try {
      if (entry.kind === "file" && entry.meta?.type === "files") {
        const items = entry.meta.items || [];
        if (items.length === 1) {
          toastId = toast.loading(`Preparing "${items[0].name}" for download...`);
          await downloadFileFromUrl(items[0].url, items[0].name);
          toast.success(`Download started for "${items[0].name}"`, { id: toastId });
        } else if (items.length > 1) {
          toastId = toast.loading(`Preparing ZIP for ${items.length} files...`, { action: { label: "Cancel", onClick: () => controller.abort() } });
          const zip = await createZip();
          await addArchiveFiles(zip, items.map((item: { url: string; name: string }) => ({ url: item.url, name: item.name || "file" })), { signal: controller.signal, onProgress: (done, total) => toast.loading(`Preparing ZIP: ${done}/${total} files`, { id: toastId }) });
          const zipBlob = await generateArchive(zip, { signal: controller.signal });
          triggerBlobDownload(zipBlob, `files-${entry.id}.zip`);
          toast.success("ZIP download started", { id: toastId });
        }
      } else if (entry.text?.startsWith("DRAWING:")) {
        toastId = toast.loading("Preparing drawing download...");
        const dataUrl = entry.text.replace("DRAWING:", "");
        await downloadFileFromUrl(dataUrl, `drawing-${entry.id}.png`);
        toast.success("Download started", { id: toastId });
      } else if (entry.text?.startsWith("PHOTO:")) {
        toastId = toast.loading("Preparing photo download...");
        const dataUrl = entry.text.replace("PHOTO:", "");
        await downloadFileFromUrl(dataUrl, `photo-${entry.id}.jpg`);
        toast.success("Download started", { id: toastId });
      } else if (entry.text?.startsWith("PHOTOS:")) {
        const raw = entry.text.replace("PHOTOS:", "");
        let photos: string[] = [];
        try {
          if (raw.trim().startsWith("[")) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              photos = parsed.filter(
                (v) => typeof v === "string" && v.startsWith("data:image")
              );
            }
          } else {
            photos = raw
              .split(",")
              .map((u) => u.trim())
              .filter((u) => u.startsWith("data:image"));
          }
        } catch {
          photos = raw
            .split(",")
            .map((u) => u.trim())
            .filter((u) => u.startsWith("data:image"));
        }

        if (photos.length === 1) {
          toastId = toast.loading("Preparing photo download...");
          await downloadFileFromUrl(photos[0], `photo-${entry.id}.jpg`);
          toast.success("Download started", { id: toastId });
        } else if (photos.length > 1) {
          toastId = toast.loading(`Preparing ZIP for ${photos.length} photos...`);
          const zip = await createZip();
          photos.forEach((dataUrl, index) => {
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

          const content = await generateArchive(zip, { signal: controller.signal });
          triggerBlobDownload(content, `photos-${entry.id}.zip`);
          toast.success("ZIP download started", { id: toastId });
        }
      } else if (entry.meta?.type === "note" || entry.text?.startsWith("NOTE:")) {
        const noteData = entry.text?.startsWith("NOTE:")
          ? entry.text.replace("NOTE:", "").split(":")
          : [];
        const noteSlug = entry.meta?.note_slug || noteData[0];
        const noteTitle = entry.meta?.title || noteData[2] || "Untitled Note";

        toastId = toast.loading(`Generating PDF for "${noteTitle}"...`);
        const res = await fetch(`/api/notes/${noteSlug}`);
        if (!res.ok) throw new Error("Failed to fetch note");
        const note = await res.json();

        const pdf = await createPdf({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 20;
        const contentWidth = pageWidth - margin * 2;
        let yPos = margin;

        pdf.setFontSize(24);
        pdf.setFont("helvetica", "bold");
        const titleLines = pdf.splitTextToSize(
          note.title || noteTitle,
          contentWidth
        );
        pdf.text(titleLines, margin, yPos);
        yPos += titleLines.length * 10 + 10;

        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(128, 128, 128);
        const dateStr = formatNoteDate(
          new Date(note.updated_at || note.created_at)
        );
        pdf.text(dateStr, margin, yPos);
        yPos += 15;

        pdf.setFontSize(12);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(0, 0, 0);

        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = note.content || "";
        const textContent = tempDiv.textContent || tempDiv.innerText || "";

        const lines = pdf.splitTextToSize(textContent, contentWidth);
        for (const line of lines) {
          if (yPos > pageHeight - margin) {
            pdf.addPage();
            yPos = margin;
          }
          pdf.text(line, margin, yPos);
          yPos += 6;
        }

        const safeFilename = `${(note.title || noteTitle).replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
        const pdfBlob = pdf.output("blob");
        triggerBlobDownload(pdfBlob, safeFilename);
        toast.success(`PDF downloaded: ${note.title || noteTitle}`, { id: toastId });
      }
    } catch {
      if (toastId) {
        toast.error("Download failed. Please try again.", { id: toastId });
      } else {
        toast.error("Download failed. Please try again.");
      }
    } finally {
      setDownloadingEntryId(null);
    }
  };

  // Download all items in a date group as zip
  const handleDownloadAll = async (dateGroup: string, groupEntries: Entry[]) => {
    if (downloadingDateGroup) return;
    setDownloadingDateGroup(dateGroup);
    const controller = new AbortController();
    const toastId = toast.loading(`Preparing ZIP archive for ${groupEntries.length} items...`, { action: { label: "Cancel", onClick: () => controller.abort() } });
    try {
      const zip = await createZip();

      const remoteFiles = groupEntries.flatMap((entry) => entry.kind === "file" && entry.meta?.type === "files" ? (entry.meta.items || []).map((item: { url: string; name: string }) => ({ url: item.url, name: `files/${item.name || `file-${entry.id}`}` })) : []);
      await addArchiveFiles(zip, remoteFiles, { signal: controller.signal, onProgress: (done, total) => toast.loading(`Preparing ZIP: ${done}/${total} files`, { id: toastId }) });

      for (const entry of groupEntries) {
        controller.signal.throwIfAborted();
        // Files
        if (entry.kind === "file" && entry.meta?.type === "files") {
          continue;
        }
        // Drawing
        else if (entry.text?.startsWith("DRAWING:")) {
          const dataUrl = entry.text.replace("DRAWING:", "");
          const base64Data = dataUrl.split(",")[1];
          zip.file(`images/drawing-${entry.id}.png`, base64Data, {
            base64: true,
          });
        }
        // Single photo
        else if (entry.text?.startsWith("PHOTO:")) {
          const dataUrl = entry.text.replace("PHOTO:", "");
          const base64Data = dataUrl.split(",")[1];
          zip.file(`images/photo-${entry.id}.jpg`, base64Data, {
            base64: true,
          });
        }
        // Multiple photos
        else if (entry.text?.startsWith("PHOTOS:")) {
          const raw = entry.text.replace("PHOTOS:", "");
          let photos: string[] = [];
          try {
            if (raw.trim().startsWith("[")) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                photos = parsed.filter(
                  (v) => typeof v === "string" && v.startsWith("data:image")
                );
              }
            } else {
              photos = raw
                .split(",")
                .map((u) => u.trim())
                .filter((u) => u.startsWith("data:image"));
            }
          } catch {
            photos = raw
              .split(",")
              .map((u) => u.trim())
              .filter((u) => u.startsWith("data:image"));
          }
          photos.forEach((dataUrl, index) => {
            if (dataUrl.startsWith("data:image/")) {
              const base64Data = dataUrl.split(",")[1];
              const mimeType = dataUrl.split(";")[0].split(":")[1];
              const extension =
                mimeType === "image/png"
                  ? "png"
                  : mimeType === "image/gif"
                  ? "gif"
                  : "jpg";
              zip.file(
                `images/photo-${entry.id}-${index + 1}.${extension}`,
                base64Data,
                { base64: true }
              );
            }
          });
        }
        // Notes as PDF
        else if (entry.meta?.type === "note" || entry.text?.startsWith("NOTE:")) {
          const noteData = entry.text?.startsWith("NOTE:")
            ? entry.text.replace("NOTE:", "").split(":")
            : [];
          const noteSlug = entry.meta?.note_slug || noteData[0];
          const noteTitle = entry.meta?.title || noteData[2] || "Untitled Note";

          try {
            const res = await fetch(`/api/notes/${noteSlug}`);
            if (res.ok) {
              const note = await res.json();

              const pdf = await createPdf({
                orientation: "portrait",
                unit: "mm",
                format: "a4",
              });

              const pageWidth = pdf.internal.pageSize.getWidth();
              const pageHeight = pdf.internal.pageSize.getHeight();
              const margin = 20;
              const contentWidth = pageWidth - margin * 2;
              let yPos = margin;

              pdf.setFontSize(24);
              pdf.setFont("helvetica", "bold");
              const titleLines = pdf.splitTextToSize(
                note.title || noteTitle,
                contentWidth
              );
              pdf.text(titleLines, margin, yPos);
              yPos += titleLines.length * 10 + 10;

              pdf.setFontSize(10);
              pdf.setFont("helvetica", "normal");
              pdf.setTextColor(128, 128, 128);
              const dateStr = formatNoteDate(
                new Date(note.updated_at || note.created_at)
              );
              pdf.text(dateStr, margin, yPos);
              yPos += 15;

              pdf.setFontSize(12);
              pdf.setFont("helvetica", "normal");
              pdf.setTextColor(0, 0, 0);

              const tempDiv = document.createElement("div");
              tempDiv.innerHTML = note.content || "";
              const textContent =
                tempDiv.textContent || tempDiv.innerText || "";

              const lines = pdf.splitTextToSize(textContent, contentWidth);
              for (const line of lines) {
                if (yPos > pageHeight - margin) {
                  pdf.addPage();
                  yPos = margin;
                }
                pdf.text(line, margin, yPos);
                yPos += 6;
              }

              const pdfBlob = pdf.output("blob");
              const safeName = (note.title || noteTitle).replace(
                /[^a-zA-Z0-9]/g,
                "_"
              );
              let filename = `notes/${safeName}.pdf`;
              let suffix = 1;
              while (zip.files[filename]) filename = `notes/${safeName} (${suffix++}).pdf`;
              zip.file(filename, pdfBlob);
            } else { throw new Error("A note is unavailable. No partial ZIP was downloaded."); }
          } catch (error) {
            throw error;
          }
        }
      }

      const content = await generateArchive(zip, { signal: controller.signal });
      triggerBlobDownload(content, `woff-files-${formatDateIso(new Date())}.zip`);
      toast.success("ZIP download started", { id: toastId });
    } catch {
      toast.error("Failed to generate ZIP archive", { id: toastId });
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-900/50 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-transparent placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
            />
          </div>
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
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
            <div key={dateGroup} className="py-2 border-b border-zinc-100/50 dark:border-white/[0.02] last:border-0">
              {/* Date header */}
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  {dateGroup}
                </span>
                {groupEntries.length > 1 && (
                  <button
                    onClick={() => handleDownloadAll(dateGroup, groupEntries)}
                    disabled={downloadingDateGroup === dateGroup}
                    className="inline-flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {downloadingDateGroup === dateGroup ? (
                      <>
                        <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
                        <span className="text-primary font-medium">Zipping…</span>
                      </>
                    ) : (
                      "Download all"
                    )}
                  </button>
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
