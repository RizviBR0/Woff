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
  Trash2,
  Loader2,
  MoreVertical,
  Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
// JSZip is dynamically imported when needed to reduce bundle size
import { useState, useEffect, memo } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { displayNameForDevice } from "@/lib/display-name";
import { deleteEntry, reportEntry } from "@/lib/actions";
import NextImage from "next/image";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const GlobalImageViewer = dynamic(
  () =>
    import("./global-image-viewer").then((module) => module.GlobalImageViewer),
  { ssr: false },
);

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
  isError?: boolean;
}

interface EntryCardProps {
  entry: Entry;
  currentDeviceId?: string | null;
  onDelete?: (entryId: string) => void;
}

export const EntryCard = memo(function EntryCard({
  entry,
  currentDeviceId = null,
  onDelete,
}: EntryCardProps) {
  const [isNoteLocked, setIsNoteLocked] = useState(false);
  const [noteLoaded, setNoteLoaded] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteEntry(entry.id);
      onDelete?.(entry.id);
    } catch (err: any) {
      setIsDeleting(false);
      toast.error(err?.message || "Unable to delete this message");
    }
  };

  // Custom menus and dialog definitions
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Close context menu on click or scroll
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    window.addEventListener("click", handleClose, { passive: true });
    window.addEventListener("scroll", handleClose, { passive: true });
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("scroll", handleClose);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    // If it's a placeholder, don't show context menu
    if (entry.id.startsWith("placeholder-")) return;

    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 180;
    const menuHeight = 220; // estimate max height

    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }

    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }

    setContextMenu({ x, y });
  };

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
  const loadingOverlay = entry.id.startsWith("placeholder-") ? (
    <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] rounded-lg flex items-center justify-center z-10 transition-all">
      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          {/* Animated spinner or error icon */}
          {entry.isLoading ? (
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10">
              <span className="text-destructive font-bold text-lg">!</span>
            </div>
          )}
        </div>
        {entry.uploadMessage && (
          <span className={`text-xs font-medium ${entry.isLoading ? "text-muted-foreground" : "text-destructive"}`}>
            {entry.uploadMessage}
          </span>
        )}
        {entry.isLoading && typeof entry.uploadProgress === "number" &&
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
      /* console.error("Download failed:", error); */
      // Fallback: open in new tab if download fails
      window.open(dataUrl, "_blank");
    }
  };

  const handleView = (dataUrl: string) => {
    setGalleryImages([dataUrl]);
    setGalleryIndex(0);
    setShowGallery(true);
  };

  const handleViewMultiple = (images: string[], index: number = 0) => {
    setGalleryImages(images);
    setGalleryIndex(index);
    setShowGallery(true);
  };

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      /* console.error("Failed to copy text:", error); */
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
        /* console.error("Fallback copy failed:", fallbackError); */
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
      /* console.error("Download failed, opening in new tab", e); */
      window.open(url, "_blank");
    }
  };

  // Parse photos data if it is a PHOTOS entry
  const photosData = (() => {
    if (!entry.text || !entry.text.startsWith("PHOTOS:")) return [];
    const photosDataRaw = entry.text.replace("PHOTOS:", "");
    let photos: string[] = [];
    try {
      if (photosDataRaw.trim().startsWith("[")) {
        const parsed = JSON.parse(photosDataRaw);
        if (Array.isArray(parsed)) {
          photos = parsed.filter(
            (v) => typeof v === "string" && v.startsWith("data:image")
          );
        }
      } else {
        photos = photosDataRaw
          .split(",")
          .map((u) => u.trim())
          .filter((u) => u.startsWith("data:image"));
      }
    } catch {
      photos = photosDataRaw
        .split(",")
        .map((u) => u.trim())
        .filter((u) => u.startsWith("data:image"));
    }
    return Array.from(new Set(photos));
  })();

  // Parse note info if it is a NOTE entry
  const noteInfo = (() => {
    if (!entry.text || !entry.text.startsWith("NOTE:")) return null;
    if (entry.meta?.note_slug) {
      return {
        slug: entry.meta.note_slug,
        publicCode: entry.meta.public_code || "",
        title: entry.meta.title || "Untitled Note",
      };
    }
    const noteData = entry.text.replace("NOTE:", "").split(":");
    return {
      slug: noteData[0],
      publicCode: noteData[1],
      title: noteData[2] || "Untitled Note",
    };
  })();

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
      /* console.error("Failed to create zip:", error); */
    }
  };

  const downloadNotePDF = async () => {
    if (!noteInfo) return;
    try {
      // Fetch note content
      const res = await fetch(`/api/notes/${noteInfo.slug}`);
      if (!res.ok) throw new Error("Failed to fetch note");
      const note = await res.json();

      // Dynamic import jsPDF
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();

      // Add title
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text(note.title || noteInfo.title, 20, 20);

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
      doc.save(`${note.title || noteInfo.title}.pdf`);
    } catch (error) {
      /* console.error("Failed to download PDF:", error); */
    }
  };

  const downloadNoteMarkdown = async () => {
    if (!noteInfo) return;
    try {
      // Fetch note content
      const res = await fetch(`/api/notes/${noteInfo.slug}`);
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

      const fullMarkdown = `# ${note.title || noteInfo.title}\n\n${markdown}`;

      // Download as .md file
      const blob = new Blob([fullMarkdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${note.title || noteInfo.title}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      /* console.error("Failed to download Markdown:", error); */
    }
  };

  const handleDownloadAllZip = async () => {
    const items = entry.meta?.items || [];
    try {
      const JSZip = (await import("jszip")).default;
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
      /* console.error("ZIP download failed", e); */
    }
  };

  const getMenuOptions = () => {
    const options = [];

    // 1. Text options
    if (entry.kind === "text" && entry.text) {
      if (entry.text.startsWith("DRAWING:")) {
        const dataUrl = entry.text.replace("DRAWING:", "");
        options.push(
          {
            label: "View Drawing",
            icon: <Eye className="h-4 w-4" />,
            onClick: () => handleView(dataUrl),
          },
          {
            label: "Download Drawing",
            icon: <Download className="h-4 w-4" />,
            onClick: () => handleDownload(dataUrl, `drawing-${entry.id}.png`),
          }
        );
      } else if (entry.text.startsWith("PHOTO:")) {
        const dataUrl = entry.text.replace("PHOTO:", "");
        options.push(
          {
            label: "View Photo",
            icon: <Eye className="h-4 w-4" />,
            onClick: () => handleView(dataUrl),
          },
          {
            label: "Download Photo",
            icon: <Download className="h-4 w-4" />,
            onClick: () => handleDownload(dataUrl, `photo-${entry.id}.jpg`),
          }
        );
      } else if (entry.text.startsWith("PHOTOS:")) {
        options.push(
          {
            label: "View Gallery",
            icon: <Eye className="h-4 w-4" />,
            onClick: () => handleViewMultiple(photosData, 0),
          },
          {
            label: "Download ZIP",
            icon: <Download className="h-4 w-4" />,
            onClick: downloadAllAsZip,
          }
        );
      } else if (entry.text.startsWith("NOTE:") && noteInfo) {
        options.push(
          {
            label: "Edit Note",
            icon: <Edit className="h-4 w-4" />,
            onClick: () => window.open(`/n/${noteInfo.slug}`, "_blank"),
          },
          {
            label: "Open Note",
            icon: <ExternalLink className="h-4 w-4" />,
            onClick: () => window.open(`/n/${noteInfo.slug}`, "_blank"),
          },
          {
            label: "Download PDF",
            icon: <FileText className="h-4 w-4" />,
            onClick: downloadNotePDF,
          },
          {
            label: "Download MD",
            icon: <FileText className="h-4 w-4" />,
            onClick: downloadNoteMarkdown,
          }
        );
      } else {
        // Regular text
        options.push({
          label: copied ? "Copied!" : "Copy Text",
          icon: copied ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" /> : <Copy className="h-4 w-4" />,
          onClick: () => handleCopyText(entry.text || ""),
        });
      }
    }

    // 2. File options
    if (entry.kind === "file" && entry.meta?.type === "files") {
      const items = entry.meta.items || [];
      if (items.length === 1) {
        options.push({
          label: "Download File",
          icon: <Download className="h-4 w-4" />,
          onClick: () => downloadFileUrl(items[0].url, items[0].name),
        });
      } else if (items.length > 1) {
        options.push({
          label: "Download ZIP",
          icon: <Download className="h-4 w-4" />,
          onClick: handleDownloadAllZip,
        });
      }
    }

    // 2b. Message-style file attachment options (fallback card)
    if (entry.kind === "image") {
      const placeholderImageUrl =
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzQ5NzlmZiIvPjx0ZXh0IHg9IjE1MCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+U2FtcGxlIEltYWdlPC90ZXh0Pjwvc3ZnPg==";
      options.push(
        {
          label: "View Image",
          icon: <Eye className="h-4 w-4" />,
          onClick: () => handleView(placeholderImageUrl),
        },
        {
          label: "Download Image",
          icon: <Download className="h-4 w-4" />,
          onClick: () => handleDownload(placeholderImageUrl, `image-${entry.id}.svg`),
        }
      );
    }

    // 3. Delete option for owner
    if (isMine) {
      options.push({
        label: "Delete Message",
        icon: <Trash2 className="h-4 w-4 text-red-500" />,
        onClick: () => setDeleteDialogOpen(true),
        destructive: true,
      });
    } else {
      options.push({
        label: "Report Message",
        icon: <Flag className="h-4 w-4" />,
        onClick: async () => {
          try {
            await reportEntry(entry.id);
            toast.success("Report submitted for review");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to report message");
          }
        },
      });
    }

    return options;
  };


  const ActionsMenu = () => {
    const menuOptions = getMenuOptions();
    if (menuOptions.length === 0) return null;

    return (
      <div className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 z-20">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-zinc-200/50 dark:hover:bg-white/10 transition-colors"
              title="Message options"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-white/95 dark:bg-[#151518]/95 backdrop-blur-xl border border-zinc-200 dark:border-white/[0.08] shadow-[0_10px_30px_rgba(0,0,0,0.15)] rounded-xl p-1 z-[999]">
            {menuOptions.map((opt, i) => (
              <DropdownMenuItem
                key={i}
                onClick={opt.onClick}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors ${
                  opt.destructive
                    ? "text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/20"
                    : "text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/5"
                }`}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const ContextMenu = () => {
    if (!contextMenu) return null;
    const menuOptions = getMenuOptions();
    if (menuOptions.length === 0) return null;

    return (
      <div
        className="fixed z-[9999] min-w-[180px] overflow-hidden rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white/95 dark:bg-[#151518]/95 backdrop-blur-xl p-1.5 shadow-[0_10px_35px_rgba(0,0,0,0.15)] dark:shadow-[0_10px_35px_rgba(0,0,0,0.3)] animate-in fade-in zoom-in-95 duration-100"
        style={{
          top: contextMenu.y,
          left: contextMenu.x,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {menuOptions.map((opt, i) => (
          <button
            key={i}
            onClick={() => {
              opt.onClick();
              setContextMenu(null);
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium rounded-lg cursor-pointer transition-colors ${
              opt.destructive
                ? "text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/20"
                : "text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/5"
            }`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
    );
  };

  const Dialogs = () => (
    <>
      <ContextMenu />
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="border-red-500/20 dark:border-red-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground dark:text-foreground font-semibold flex items-center gap-2">
              <span className="text-red-500">⚠️</span> Delete Message
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to permanently delete this message? This action cannot be undone and will delete any associated files.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2 sm:gap-0">
            <AlertDialogCancel disabled={isDeleting} className="border-border hover:bg-accent">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white font-medium shadow-[0_0_10px_rgba(239,68,68,0.2)] focus:ring-red-500 h-9 px-4 rounded-md inline-flex items-center justify-center"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin animate-spin-fast" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );



  const globalViewerModal = (
    <GlobalImageViewer 
      images={galleryImages} 
      initialIndex={galleryIndex} 
      isOpen={showGallery} 
      onClose={() => setShowGallery(false)} 
      getDownloadFilename={(index) => {
        if (entry.text?.startsWith("DRAWING:")) return `drawing-${entry.id}.png`;
        if (entry.text?.startsWith("PHOTO:")) return `photo-${entry.id}.jpg`;
        if (entry.text?.startsWith("PHOTOS:")) return `photo-${index + 1}-${entry.id}.jpg`;
        return `image-${entry.id}`;
      }}
    />
  );

  // Handle placeholder/loading entries from optimistic UI
  if (entry.id.startsWith("placeholder-")) {
    const meta = entry.meta || {};
    const metaType = meta.type || "";
    const isError = !entry.isLoading;

    // Determine icon and label based on meta type
    let icon = "📤";
    let label = entry.uploadMessage || "Uploading...";
    let customSkeleton = null;

    if (metaType === "photo" || metaType === "drawing") {
      icon = metaType === "drawing" ? "🎨" : "📷";
      const isDrawing = metaType === "drawing";
      
      customSkeleton = (
        <div className={`relative mt-2 max-w-[280px] rounded-xl overflow-hidden border ${
          isError 
            ? "border-destructive/20 bg-destructive/5 shadow-sm" 
            : "border-orange-500/20 dark:border-orange-500/30 bg-muted/5 shadow-sm"
        } p-2 transition-all duration-300`}>
          <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-muted/20 flex items-center justify-center border border-border/30">
            {meta.previewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={meta.previewUrl}
                  alt="Preview"
                  className={`w-full h-full object-cover rounded-lg transition-all duration-300 ${
                    isError ? "opacity-30 blur-[2px]" : "opacity-60 blur-[1px] animate-pulse"
                  }`}
                />
                {!isError && (
                  <div className="absolute inset-0 bg-gradient-to-t from-orange-500/10 via-transparent to-transparent pointer-events-none" />
                )}
              </>
            ) : (
              <div className="text-3xl animate-bounce">
                {icon}
              </div>
            )}
            
            {/* Ambient glowing center piece */}
            {!isError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative flex items-center justify-center h-12 w-12">
                  <div className="absolute inset-0 rounded-full bg-orange-500/20 border border-orange-500/30 animate-ping" style={{ animationDuration: "2s" }} />
                  <div className="relative h-9 w-9 rounded-full bg-orange-500/10 dark:bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                    <span className="text-orange-500 dark:text-orange-400 text-xs font-bold animate-pulse">
                      {isDrawing ? "🎨" : "⚡"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-2.5 px-1 pb-1">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className={`text-[11px] font-semibold tracking-wide uppercase ${isError ? "text-destructive" : "text-orange-500 dark:text-orange-400"}`}>
                {isError ? "Upload Failed" : isDrawing ? "Saving Drawing" : "Uploading Photo"}
              </span>
              {!isError && typeof entry.uploadProgress === "number" && (
                <span className="text-[10px] font-bold text-orange-500 dark:text-orange-400 font-mono bg-orange-500/10 px-1.5 py-0.5 rounded">
                  {entry.uploadProgress}%
                </span>
              )}
            </div>
            <p className={`text-xs truncate ${isError ? "text-destructive/80 font-medium" : "text-muted-foreground"}`}>
              {label}
            </p>
          </div>
          
          {/* Orange glowing progress at bottom */}
          {!isError && typeof entry.uploadProgress === "number" && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-muted/30 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 transition-all duration-300 rounded-full"
                style={{ width: `${entry.uploadProgress}%` }}
              />
            </div>
          )}
        </div>
      );
    } else if (metaType === "photos") {
      icon = "🖼️";
      
      customSkeleton = (
        <div className={`relative mt-2 max-w-[280px] rounded-xl overflow-hidden border ${
          isError 
            ? "border-destructive/20 bg-destructive/5 shadow-sm" 
            : "border-orange-500/20 dark:border-orange-500/30 bg-muted/5 shadow-sm"
        } p-2 transition-all duration-300`}>
          <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-muted/20 flex items-center justify-center border border-border/30">
            {meta.previewUrls && meta.previewUrls.length > 0 ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={meta.previewUrls[0]}
                  alt="Front preview"
                  className={`w-full h-full object-cover rounded-lg transition-all duration-300 ${
                    isError ? "opacity-30 blur-[2px]" : "opacity-60 blur-[1px] animate-pulse"
                  }`}
                />
                {!isError && (
                  <div className="absolute inset-0 bg-gradient-to-t from-orange-500/15 via-transparent to-transparent pointer-events-none" />
                )}
              </>
            ) : (
              <div className="text-3xl animate-bounce">🖼️</div>
            )}
            
            {/* Photo Stack Counter Badge */}
            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-white border border-white/10 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <span>🖼️</span>
              <span>{meta.count || 2} Photos</span>
            </div>

            {/* Central Glow Orb */}
            {!isError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative flex items-center justify-center h-12 w-12">
                  <div className="absolute inset-0 rounded-full bg-orange-500/25 border border-orange-500/30 animate-ping" style={{ animationDuration: "2.2s" }} />
                  <div className="relative h-9 w-9 rounded-full bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                    <span className="text-orange-500 dark:text-orange-400 text-[10px] font-extrabold animate-pulse">
                      +{meta.count ? meta.count - 1 : 1}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-2.5 px-1 pb-1">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className={`text-[11px] font-semibold tracking-wide uppercase ${isError ? "text-destructive" : "text-orange-500 dark:text-orange-400"}`}>
                {isError ? "Failed to Upload" : "Uploading Stack"}
              </span>
              {!isError && typeof entry.uploadProgress === "number" && (
                <span className="text-[10px] font-bold text-orange-500 dark:text-orange-400 font-mono bg-orange-500/10 px-1.5 py-0.5 rounded">
                  {entry.uploadProgress}%
                </span>
              )}
            </div>
            <p className={`text-xs truncate ${isError ? "text-destructive/80 font-medium" : "text-muted-foreground"}`}>
              {label}
            </p>
          </div>

          {/* Orange glowing progress at bottom */}
          {!isError && typeof entry.uploadProgress === "number" && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-muted/30 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 transition-all duration-300 rounded-full"
                style={{ width: `${entry.uploadProgress}%` }}
              />
            </div>
          )}
        </div>
      );
    } else if (metaType === "files") {
      icon = "📄";
      const items = meta.items || [];
      const hasMultiple = items.length > 1;
      
      customSkeleton = (
        <div className="relative mt-2 max-w-[320px] pt-1 transition-all duration-300">
          {hasMultiple ? (
            // Stacked Document Skeletons
            <div className="relative w-full min-h-[74px]">
              {/* Back Sheet */}
              <div className={`absolute inset-x-2 top-0 h-[66px] rounded-xl border ${
                isError ? "border-destructive/10 bg-destructive/5" : "border-orange-500/10 bg-muted/5 shadow-sm"
              } rotate-[3deg] translate-y-[-4px] scale-[0.97] opacity-35 transition-transform`} />
              
              {/* Front Sheet */}
              <div className={`relative w-full rounded-xl border ${
                isError 
                  ? "border-destructive/30 bg-destructive/5 shadow-md shadow-destructive/5" 
                  : "border-orange-500/20 dark:border-orange-500/30 bg-gradient-to-r from-muted/20 to-orange-500/[0.01] shadow-lg shadow-orange-500/[0.04] dark:shadow-orange-500/[0.06]"
              } p-3 flex items-center gap-3 overflow-hidden min-h-[66px] transition-all`}>
                
                {/* File icon container */}
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center border flex-shrink-0 transition-colors ${
                  isError 
                    ? "bg-destructive/10 border-destructive/20 text-destructive" 
                    : "bg-orange-500/10 border-orange-500/20 text-orange-500 animate-pulse"
                }`}>
                  <FileText className="h-5 w-5" />
                </div>

                {/* Shimmer details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-[11px] font-semibold tracking-wide uppercase ${isError ? "text-destructive" : "text-orange-500 dark:text-orange-400"}`}>
                      {isError ? "Upload Failed" : `Uploading ${items.length} Files`}
                    </span>
                    {!isError && typeof entry.uploadProgress === "number" && (
                      <span className="text-[10px] font-bold text-orange-500 dark:text-orange-400 font-mono bg-orange-500/10 px-1.5 py-0.5 rounded">
                        {entry.uploadProgress}%
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-3.5 bg-muted-foreground/15 rounded-md animate-pulse w-4/5" />
                    <div className="h-2 bg-muted-foreground/10 rounded-md animate-pulse w-2/5" />
                  </div>
                </div>

                {/* Orange glowing progress at bottom */}
                {!isError && typeof entry.uploadProgress === "number" && (
                  <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-muted/30 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 transition-all duration-300 rounded-full shadow-[0_0_8px_rgba(255,90,0,0.8)]"
                      style={{ width: `${entry.uploadProgress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Single Document Skeleton
            <div className={`relative w-full rounded-xl border ${
              isError 
                ? "border-destructive/30 bg-destructive/5 shadow-md" 
                : "border-orange-500/20 dark:border-orange-500/30 bg-gradient-to-r from-muted/20 to-orange-500/[0.01] shadow-lg shadow-orange-500/[0.04] dark:shadow-orange-500/[0.06]"
            } p-3 flex items-center gap-3 overflow-hidden min-h-[66px] transition-all`}>
              
              {/* File icon container */}
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center border flex-shrink-0 transition-colors ${
                isError 
                  ? "bg-destructive/10 border-destructive/20 text-destructive" 
                  : "bg-orange-500/10 border-orange-500/20 text-orange-500 animate-pulse"
              }`}>
                <FileText className="h-5 w-5" />
              </div>

              {/* Shimmer details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-[11px] font-semibold tracking-wide uppercase ${isError ? "text-destructive" : "text-orange-500 dark:text-orange-400"}`}>
                    {isError ? "Upload Failed" : "Uploading File"}
                  </span>
                  {!isError && typeof entry.uploadProgress === "number" && (
                    <span className="text-[10px] font-bold text-orange-500 dark:text-orange-400 font-mono bg-orange-500/10 px-1.5 py-0.5 rounded">
                      {entry.uploadProgress}%
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="h-3.5 bg-muted-foreground/15 rounded-md animate-pulse w-[90%]" />
                  <div className="h-2 bg-muted-foreground/10 rounded-md animate-pulse w-[30%]" />
                </div>
              </div>

              {/* Orange glowing progress at bottom */}
              {!isError && typeof entry.uploadProgress === "number" && (
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-muted/30 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 transition-all duration-300 rounded-full shadow-[0_0_8px_rgba(255,90,0,0.8)]"
                    style={{ width: `${entry.uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      );
    } else if (metaType === "note") {
      icon = "📝";
      
      customSkeleton = (
        <div className={`relative mt-2 max-w-[300px] rounded-xl border ${
          isError 
            ? "border-destructive/30 bg-destructive/5 shadow-md shadow-destructive/5" 
            : "border-orange-500/20 dark:border-orange-500/30 bg-gradient-to-br from-muted/20 to-orange-500/[0.01] shadow-lg shadow-orange-500/[0.04] dark:shadow-orange-500/[0.06]"
        } p-3 overflow-hidden min-h-[80px] transition-all`}>
          
          <div className="flex items-center gap-2 mb-2">
            <div className={`h-6 w-6 rounded flex items-center justify-center border flex-shrink-0 ${
              isError 
                ? "bg-destructive/10 border-destructive/20 text-destructive" 
                : "bg-orange-500/10 border-orange-500/20 text-orange-500 animate-pulse"
            }`}>
              <span className="text-xs font-bold">📝</span>
            </div>
            <span className={`text-[11px] font-semibold tracking-wide uppercase ${isError ? "text-destructive" : "text-orange-500 dark:text-orange-400"}`}>
              {isError ? "Failed to Create" : "Creating Note..."}
            </span>
            {!isError && typeof entry.uploadProgress === "number" && (
              <span className="ml-auto text-[10px] font-bold text-orange-500 dark:text-orange-400 font-mono bg-orange-500/10 px-1.5 py-0.5 rounded">
                {entry.uploadProgress}%
              </span>
            )}
          </div>

          <div className="space-y-2">
            <div className="h-3.5 bg-muted-foreground/15 rounded animate-pulse w-[85%]" />
            <div className="h-2 bg-muted-foreground/10 rounded animate-pulse w-full" />
            <div className="h-2 bg-muted-foreground/10 rounded animate-pulse w-3/4" />
          </div>

          {/* Orange glowing progress at bottom */}
          {!isError && typeof entry.uploadProgress === "number" && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-muted/30 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 transition-all duration-300 rounded-full shadow-[0_0_8px_rgba(255,90,0,0.8)]"
                style={{ width: `${entry.uploadProgress}%` }}
              />
            </div>
          )}
        </div>
      );
    }

    if (!customSkeleton) {
      customSkeleton = (
        <div className={`relative mt-2 max-w-[280px] rounded-xl border ${
          isError 
            ? "border-destructive/30 bg-destructive/5" 
            : "border-orange-500/20 dark:border-orange-500/30 bg-gradient-to-r from-muted/20 to-orange-500/[0.01] shadow-lg shadow-orange-500/[0.04] dark:shadow-orange-500/[0.06]"
        } p-3 flex items-center gap-3 overflow-hidden min-h-[60px] transition-all`}>
          <div className={`h-8 w-8 rounded flex items-center justify-center border flex-shrink-0 ${
            isError ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-orange-500/10 border-orange-500/20 text-orange-500 animate-pulse"
          }`}>
            <span className="text-sm font-bold">{icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className={`text-[10px] font-semibold tracking-wide uppercase ${isError ? "text-destructive" : "text-orange-500"}`}>
                {isError ? "Failed" : "Uploading"}
              </span>
            </div>
            <p className={`text-xs truncate ${isError ? "text-destructive/80 font-medium" : "text-muted-foreground"}`}>
              {label}
            </p>
          </div>
          {!isError && typeof entry.uploadProgress === "number" && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-muted/30 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300"
                style={{ width: `${entry.uploadProgress}%` }}
              />
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        id={`entry-${entry.id}`}
        className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
      >
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

          {/* Glowing custom skeleton contents */}
          {customSkeleton}
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
            onContextMenu={handleContextMenu}
            className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
          >
            <ActionsMenu />
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
                <div className="mt-2 w-full flex">
                  <div className="relative max-w-full rounded-2xl overflow-hidden border border-border/30 shadow-sm cursor-pointer hover:shadow-md hover:ring-2 hover:ring-primary/20 transition-all bg-white dark:bg-neutral-900 group flex items-center justify-center p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={dataUrl}
                      alt="Hand drawn image"
                      className="max-w-full max-h-[350px] md:max-h-[450px] object-contain group-hover:opacity-90 transition-opacity rounded-xl"
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
          {globalViewerModal}
          <Dialogs />
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
            onContextMenu={handleContextMenu}
            className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
          >
            <ActionsMenu />
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
                <div className="mt-2 w-full flex">
                  <div className="relative max-w-full rounded-2xl overflow-hidden border border-border/30 shadow-sm cursor-pointer hover:shadow-md hover:ring-2 hover:ring-primary/20 hover:opacity-[0.98] transition-all bg-muted/10 group flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={dataUrl}
                      alt="Photo"
                      className="max-w-full max-h-[350px] md:max-h-[500px] object-contain rounded-2xl group-hover:scale-[1.01] transition-transform duration-300"
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
          {globalViewerModal}
          <Dialogs />
        </>
      );
    }

    // Check if this is multiple photos
    if (entry.text.startsWith("PHOTOS:")) {
      const displayedPhotos = photosData.slice(0, 5);
      const remainingCount = photosData.length - 5;

      return (
        <>
          <div
            id={`entry-${entry.id}`}
            onContextMenu={handleContextMenu}
            className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
          >
            <ActionsMenu />
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
                <div
                  className="relative mt-2 max-w-xl cursor-pointer"
                  onMouseEnter={() => setHovering(true)}
                  onMouseLeave={() => setHovering(false)}
                  onClick={() => handleViewMultiple(photosData, 0)}
                >
                  {photosData.length === 1 ? (
                    <div className="relative max-w-full rounded-2xl overflow-hidden border border-border/30 shadow-sm hover:shadow-md hover:ring-2 hover:ring-primary/20 hover:opacity-[0.98] transition-all bg-muted/10 group flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photosData[0]}
                        alt="Photo"
                        className="max-w-full max-h-[350px] md:max-h-[500px] object-contain rounded-2xl group-hover:scale-[1.01] transition-transform duration-300"
                      />
                    </div>
                  ) : (
                    <div
                      className={`grid gap-1.5 ${
                        photosData.length === 2 ? "grid-cols-2" : "grid-cols-3"
                      }`}
                    >
                      {displayedPhotos.map((dataUrl, index) => (
                        <div
                          key={index}
                          className="relative aspect-square rounded-xl overflow-hidden border border-border/20 shadow-sm group/item"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewMultiple(photosData, index);
                          }}
                        >
                          <NextImage
                            src={dataUrl}
                            alt={`Photo ${index + 1}`}
                            fill
                            unoptimized
                            sizes="(max-width: 768px) 30vw, 200px"
                            className="object-cover group-hover/item:scale-105 transition-transform duration-300"
                          />
                          {/* Dark overlay with clean text if it's the last displayed photo and more exist */}
                          {index === 4 && remainingCount > 0 && photosData.length > 5 && (
                            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-white hover:bg-black/70 transition-colors">
                              <span className="text-xl sm:text-2xl font-bold">+{remainingCount}</span>
                              <span className="text-xs sm:text-sm text-white/90 font-medium">more</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Hover overlay for multiple images (View Collection) */}
                  {hovering && photosData.length > 1 && (
                    <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center transition-all duration-200 pointer-events-none">
                      <div className="rounded-full px-4 py-2 flex items-center gap-2 text-sm font-semibold bg-white/95 dark:bg-gray-800/95 text-gray-900 dark:text-gray-100 border border-white/20 shadow-xl shadow-black/20">
                        <Eye className="h-4 w-4" />
                        View Gallery
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
                  onClick={() => handleViewMultiple(photosData, 0)}
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
          {globalViewerModal}
          <Dialogs />
        </>
      );
    }

    // Check if this is a note
    if (entry.text.startsWith("NOTE:") && noteInfo) {
      const { slug: noteSlug, title: noteTitle } = noteInfo;

      return (
        <>
          <div
            id={`entry-${entry.id}`}
            onContextMenu={handleContextMenu}
            className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
          >
            <ActionsMenu />
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
              <div className="relative">
                <Link
                  href={`/n/${noteSlug}`}
                  prefetch
                  className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border/20 cursor-pointer hover:bg-accent/50 transition-colors"
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
                </Link>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
                <Link href={`/n/${noteSlug}`} prefetch>
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Link>
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
                <Link href={`/n/${noteSlug}`} prefetch>
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open
                </Link>
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
        <Dialogs />
      </>
      );
    }

    // Regular text message
    return (
      <>
        <div
          id={`entry-${entry.id}`}
          onContextMenu={handleContextMenu}
          className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
        >
          <ActionsMenu />
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
            {(() => {
              if (!entry.text) return "";
              
              // URL matching regex: matches http://, https://, and www. links
              const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
              const parts = entry.text.split(urlRegex);
              if (parts.length === 1) {
                return entry.text;
              }
              
              return parts.map((part, index) => {
                const lowerPart = part.toLowerCase();
                const isUrl = lowerPart.startsWith("http://") || lowerPart.startsWith("https://") || lowerPart.startsWith("www.");
                
                if (isUrl) {
                  const href = lowerPart.startsWith("www.") ? `https://${part}` : part;
                  return (
                    <a
                      key={index}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#ff5a00] hover:text-[#ff3600] dark:text-[#ff7d3b] dark:hover:text-[#ff5a00] underline font-medium transition-colors break-all"
                    >
                      {part}
                    </a>
                  );
                }
                return part;
              });
            })()}
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
        <Dialogs />
      </>
    );
  }

  // File entries rendering
  if (entry.kind === "file" && entry.meta?.type === "files") {
    const items: Array<{
      name: string;
      size: number;
      type: string;
      url: string;
      path?: string;
    }> = entry.meta.items || [];



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
      <>
        <div
        id={`entry-${entry.id}`}
        onContextMenu={handleContextMenu}
        className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
      >
        <ActionsMenu />
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

            {/* Display files as a list with thumbnails for images */}
            <div className="divide-y rounded-md border border-border/20 bg-background">
              {(showAllFiles ? items : items.slice(0, 3)).map((it) => {
                const isImg = isImage(it.type, it.name);
                return (
                  <div
                    key={it.path || it.url}
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
              
              {items.length > 3 && (
                <div
                  className="p-2 text-center text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer hover:underline transition-colors"
                  onClick={() => setShowAllFiles(!showAllFiles)}
                >
                  {showAllFiles ? "Show less" : `View all ${items.length} files`}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {items.length > 1 && (
              <div className="flex gap-1 mt-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
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
      </div>
      {globalViewerModal}
      <Dialogs />
    </>
    );
  }

  // Message-style file attachments
  return (
    <>
      <div
        id={`entry-${entry.id}`}
        onContextMenu={handleContextMenu}
        className="group relative flex items-start gap-3 mb-4 hover:bg-accent/30 dark:hover:bg-accent/20 px-3 py-2 rounded-lg transition-colors"
      >
        <ActionsMenu />
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
      </div>
      {globalViewerModal}
      <Dialogs />
    </>
  );
});
