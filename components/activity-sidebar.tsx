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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format, isToday, isYesterday } from "date-fns";
import NextImage from "next/image";
import JSZip from "jszip";
import jsPDF from "jspdf";

interface ActivitySidebarProps {
  entries: Entry[];
  isOpen: boolean;
}

type FilterType = "all" | "images" | "files" | "notes";

function formatDateGroup(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "d MMM");
  } catch {
    return "";
  }
}

function getItemType(entry: Entry): "image" | "file" | "note" | "unknown" {
  if (entry.kind === "file" && entry.meta?.type === "files") return "file";
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
  onDownload: (entry: Entry) => void;
  isDownloading?: boolean;
}

function SidebarItem({ entry, onDownload, isDownloading }: SidebarItemProps) {
  const [hovering, setHovering] = useState(false);

  // Helper function for smooth scrolling
  const scrollToEntry = (e: React.MouseEvent) => {
    e.preventDefault();
    const element = document.getElementById(`entry-${entry.id}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // File entries
  if (entry.kind === "file" && entry.meta?.type === "files") {
    const items: Array<{
      name: string;
      size: number;
      type: string;
      url: string;
    }> = entry.meta.items || [];
    const count = items.length;
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
        {hovering && (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDownload(entry);
              }}
            >
              <Download className="h-3.5 w-3.5" />
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
          {hovering && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDownload(entry);
                }}
              >
                <Download className="h-3.5 w-3.5" />
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
          {hovering && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDownload(entry);
                }}
              >
                <Download className="h-3.5 w-3.5" />
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
          {hovering && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDownload(entry);
                }}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </a>
      );
    }

    if (entry.text.startsWith("NOTE:")) {
      const noteData = entry.text.replace("NOTE:", "").split(":");
      const noteSlug = noteData[0];
      const noteTitle = noteData[2] || "Untitled note";

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
          {hovering && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(`/n/${noteSlug}`, "_blank");
                }}
                title="Preview"
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDownload(entry);
                }}
                title="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </a>
      );
    }
  }

  return null;
}

export function ActivitySidebar({ entries, isOpen }: ActivitySidebarProps) {
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
          if (e.text?.startsWith("NOTE:")) {
            const noteTitle = e.text.split(":")[3] || "note";
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

  const handleDownload = async (entry: Entry) => {
    if (entry.kind === "file" && entry.meta?.type === "files") {
      const items = entry.meta.items || [];
      if (items.length === 1) {
        const link = document.createElement("a");
        link.href = items[0].url;
        link.download = items[0].name;
        link.click();
      } else if (items.length > 1) {
        // Download all files as zip
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
      }
    } else if (entry.text?.startsWith("DRAWING:")) {
      const dataUrl = entry.text.replace("DRAWING:", "");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `drawing-${entry.id}.png`;
      link.click();
    } else if (entry.text?.startsWith("PHOTO:")) {
      const dataUrl = entry.text.replace("PHOTO:", "");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `photo-${entry.id}.jpg`;
      link.click();
    } else if (entry.text?.startsWith("PHOTOS:")) {
      // Download all photos as zip
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
        // Single photo - direct download
        const link = document.createElement("a");
        link.href = photos[0];
        link.download = `photo-${entry.id}.jpg`;
        link.click();
      } else if (photos.length > 1) {
        // Multiple photos - zip download
        try {
          const zip = new JSZip();
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
      }
    } else if (entry.text?.startsWith("NOTE:")) {
      // Download note as PDF
      const noteData = entry.text.replace("NOTE:", "").split(":");
      const noteSlug = noteData[0];
      const noteTitle = noteData[2] || "Untitled Note";

      try {
        // Fetch note content from API
        const res = await fetch(`/api/notes/${noteSlug}`);
        if (!res.ok) throw new Error("Failed to fetch note");
        const note = await res.json();

        // Create PDF
        const pdf = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 20;
        const contentWidth = pageWidth - margin * 2;
        let yPos = margin;

        // Title
        pdf.setFontSize(24);
        pdf.setFont("helvetica", "bold");
        const titleLines = pdf.splitTextToSize(
          note.title || noteTitle,
          contentWidth
        );
        pdf.text(titleLines, margin, yPos);
        yPos += titleLines.length * 10 + 10;

        // Date
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(128, 128, 128);
        const dateStr = format(
          new Date(note.updated_at || note.created_at),
          "MMMM d, yyyy"
        );
        pdf.text(dateStr, margin, yPos);
        yPos += 15;

        // Content - parse HTML and convert to text
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(0, 0, 0);

        // Simple HTML to text conversion
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

        pdf.save(
          `${(note.title || noteTitle).replace(/[^a-zA-Z0-9]/g, "_")}.pdf`
        );
      } catch (error) {
        console.error("Failed to download note as PDF:", error);
      }
    }
  };

  // Download all items in a date group as zip
  const handleDownloadAll = async (groupEntries: Entry[]) => {
    try {
      const zip = new JSZip();

      for (const entry of groupEntries) {
        // Files
        if (entry.kind === "file" && entry.meta?.type === "files") {
          const items = entry.meta.items || [];
          for (const item of items) {
            const res = await fetch(item.url);
            const blob = await res.blob();
            zip.file(`files/${item.name || `file-${entry.id}`}`, blob);
          }
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
        else if (entry.text?.startsWith("NOTE:")) {
          const noteData = entry.text.replace("NOTE:", "").split(":");
          const noteSlug = noteData[0];
          const noteTitle = noteData[2] || "Untitled Note";

          try {
            const res = await fetch(`/api/notes/${noteSlug}`);
            if (res.ok) {
              const note = await res.json();

              const pdf = new jsPDF({
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
              const dateStr = format(
                new Date(note.updated_at || note.created_at),
                "MMMM d, yyyy"
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
              zip.file(`notes/${safeName}.pdf`, pdfBlob);
            }
          } catch (e) {
            console.error("Failed to add note to zip:", e);
          }
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `woff-files-${format(new Date(), "yyyy-MM-dd")}.zip`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to create download zip:", error);
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
    <aside className="hidden md:flex flex-col border-l bg-background w-72 lg:w-80 flex-shrink-0 fixed right-0 top-14 bottom-0 z-30">
      {/* Search bar with filter */}
      <div className="p-3 border-b">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-border bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent placeholder:text-muted-foreground"
            />
          </div>
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`h-9 w-9 flex-shrink-0 ${
                  activeFilter !== "all" ? "border-primary text-primary" : ""
                }`}
              >
                <Filter className="h-4 w-4" />
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
      <div className="flex-1 overflow-y-auto">
        {Object.keys(groupedItems).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {searchQuery || activeFilter !== "all"
                ? "No items match your search"
                : "Nothing shared yet"}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Files, images, and notes will appear here
            </p>
          </div>
        ) : (
          Object.entries(groupedItems).map(([dateGroup, groupEntries]) => (
            <div key={dateGroup} className="py-2">
              {/* Date header */}
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {dateGroup}
                </span>
                {groupEntries.length > 1 && (
                  <button
                    onClick={() => handleDownloadAll(groupEntries)}
                    className="text-[10px] text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer"
                  >
                    Download all
                  </button>
                )}
              </div>
              {/* Items */}
              <div className="space-y-0.5">
                {groupEntries.map((entry) => (
                  <SidebarItem
                    key={entry.id}
                    entry={entry}
                    onDownload={handleDownload}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
