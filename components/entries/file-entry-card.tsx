"use client";

import { useState } from "react";
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
import type { Entry, UploadedFileItem } from "./entry-types";

interface FileEntryCardProps {
  entry: Entry;
  spaceSlug?: string;
}

export function isMarkdownFile(name: string, type?: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return (
    ["md", "markdown", "mdown", "mkdn", "mdwn", "mdtxt", "mdtext"].includes(ext) ||
    type === "text/markdown" ||
    type === "text/x-markdown"
  );
}

function getFileIcon(type: string, name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";

  if (["md", "markdown"].includes(ext) || type === "text/markdown" || type === "text/x-markdown") {
    return <FileText className="h-5 w-5 text-sky-500" />;
  }
  if (type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext)) {
    return <ImageIcon className="h-5 w-5 text-blue-500" />;
  }
  if (type === "application/pdf" || ext === "pdf") {
    return <FileText className="h-5 w-5 text-red-500" />;
  }
  if (type.startsWith("video/") || ["mp4", "webm", "mkv", "mov"].includes(ext)) {
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

export function FileEntryCard({ entry, spaceSlug }: FileEntryCardProps) {
  const router = useRouter();
  const [isZipping, setIsZipping] = useState(false);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [openingNoteIndex, setOpeningNoteIndex] = useState<number | null>(null);

  const items: UploadedFileItem[] = (() => {
    if (Array.isArray(entry.meta?.items)) return entry.meta.items;
    return [];
  })();

  const openInRichNote = async (file: UploadedFileItem, index: number) => {
    if (openingNoteIndex !== null) return;
    setOpeningNoteIndex(index);
    const toastId = toast.loading(`Opening "${file.name}" in Rich Note…`);
    try {
      let markdownContent = "";
      try {
        const res = await fetch(file.url);
        if (res.ok) {
          markdownContent = await res.text();
        }
      } catch {
        // Fallback gracefully if network/cors blocks direct fetch
      }

      const { noteSlug } = await openOrCreateNoteForMarkdownFile({
        spaceId: entry.space_id,
        fileName: file.name,
        markdownContent,
      });

      toast.dismiss(toastId);
      const targetSlug = spaceSlug || entry.meta?.space_slug;
      const targetUrl = targetSlug ? `/${targetSlug}/${noteSlug}` : `/n/${noteSlug}`;
      router.push(targetUrl);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to open rich note",
        { id: toastId },
      );
      setOpeningNoteIndex(null);
    }
  };

  const downloadFile = async (url: string, name: string, index: number) => {
    if (downloadingIndex !== null) return;
    setDownloadingIndex(index);
    const toastId = toast.loading(`Preparing "${name}" for download...`);
    try {
      await downloadFileFromUrl(url, name);
      toast.success(`Download started for "${name}"`, { id: toastId });
    } catch {
      toast.error(`Failed to download "${name}"`, { id: toastId });
    } finally {
      setDownloadingIndex(null);
    }
  };

  const downloadAllAsZip = async () => {
    if (!items.length || isZipping) return;
    setIsZipping(true);
    const toastId = toast.loading(`Preparing ZIP archive for ${items.length} files...`);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      await Promise.all(
        items.map(async (file, index) => {
          const res = await fetch(file.url);
          const blob = await res.blob();
          const fileName = file.name || `file-${index + 1}`;
          zip.file(fileName, blob);
        }),
      );

      const zipBlob = await zip.generateAsync({ type: "blob" });
      triggerBlobDownload(zipBlob, `woff-files-${Date.now()}.zip`);
      toast.success("ZIP download started", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate ZIP archive", { id: toastId });
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

  return (
    <>
      <div className="w-full max-w-md space-y-2">
        {items.length > 1 && (
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-xs font-medium text-muted-foreground">
              {items.length} files attached
            </span>
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
          </div>
        )}

        <div className="space-y-1.5">
          {items.map((file, idx) => {
            const isMd = isMarkdownFile(file.name, file.type);

            return (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl border bg-card hover:bg-muted/50 transition-colors"
              >
                <div
                  className={`flex items-center gap-3 min-w-0 flex-1 ${
                    isMd ? "cursor-pointer group/mdinfo" : ""
                  }`}
                  onClick={() => {
                    if (isMd) {
                      void openInRichNote(file, idx);
                    }
                  }}
                  title={isMd ? `Open ${file.name} in Rich Note` : undefined}
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
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isMd && (
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
                    onClick={() => void downloadFile(file.url, file.name, idx)}
                    disabled={downloadingIndex === idx}
                    aria-label={`Download ${file.name}`}
                    title={
                      downloadingIndex === idx
                        ? "Downloading…"
                        : `Download ${file.name}`
                    }
                  >
                    {downloadingIndex === idx ? (
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
      </div>
    </>
  );
}
