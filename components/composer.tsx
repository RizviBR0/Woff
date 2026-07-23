"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  PenLine,
  RotateCcw,
  Send,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  createEntry,
  createNoteEntry,
  createUploadedEntry,
  createUploadIntent,
} from "@/lib/actions";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Entry } from "./entry-card";

const DrawingCanvas = dynamic(
  () => import("./digital-canvas").then((module) => module.DrawingCanvas),
  { ssr: false },
);

interface ComposerProps {
  spaceId: string;
  onNewEntry: (entry: Entry) => void;
  onUpdateEntry: (entryId: string, updates: Partial<Entry>) => void;
  onReplaceEntry: (placeholderId: string, realEntry: Entry) => void;
  onRemoveEntry: (entryId: string) => void;
  currentDeviceId?: string | null;
  centered?: boolean;
}

type UploadPresentation = "files" | "photos" | "drawing";
type BatchState = {
  id: string;
  files: File[];
  presentation: UploadPresentation;
  progress: number;
  status: "uploading" | "failed";
  error?: string;
};

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BATCH_FILES = 20;
const CONCURRENT_UPLOADS = 3;

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function localFileUrl(path: string) {
  return `/api/files/${path.split("/").map(encodeURIComponent).join("/")}`;
}

async function getImageDimensions(file: File) {
  if (!file.type.startsWith("image/")) return {};
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return {};
  }
}

export function Composer({
  spaceId,
  onNewEntry,
  onUpdateEntry,
  onReplaceEntry,
  onRemoveEntry,
  currentDeviceId,
  centered = false,
}: ComposerProps) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [batch, setBatch] = useState<BatchState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const activeUploadsRef = useRef<Set<tus.Upload>>(new Set());
  const cancelledRef = useRef(false);
  const previewUrlsRef = useRef<string[]>([]);

  const clearPreviews = useCallback(() => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
  }, []);

  useEffect(() => {
    const activeUploads = activeUploadsRef.current;
    return () => {
      cancelledRef.current = true;
      activeUploads.forEach((upload) => void upload.abort(true));
      clearPreviews();
    };
  }, [clearPreviews]);

  const validateFiles = useCallback((files: File[]) => {
    if (!files.length) throw new Error("Choose at least one file");
    if (files.length > MAX_BATCH_FILES) {
      throw new Error(`Upload at most ${MAX_BATCH_FILES} files at once`);
    }
    const empty = files.find((file) => file.size <= 0);
    if (empty) throw new Error(`${empty.name} is empty`);
    const tooLarge = files.find((file) => file.size > MAX_FILE_BYTES);
    if (tooLarge) {
      throw new Error(`${tooLarge.name} exceeds the 20 MB file limit`);
    }
  }, []);

  const uploadOne = useCallback(
    async (
      file: File,
      uploadedByIndex: number[],
      index: number,
      onProgress: () => void,
    ) => {
      const intent = await createUploadIntent(spaceId, {
        name: file.name,
        size: file.size,
        type: file.type,
      });
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session) throw new Error("Your anonymous session expired");

      const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;
      const apiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!apiKey) throw new Error("Upload service is not configured");

      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint,
          retryDelays: [0, 1000, 3000, 5000],
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
            contentType: file.type || "application/octet-stream",
            cacheControl: "3600",
          },
          onError(error) {
            activeUploadsRef.current.delete(upload);
            reject(error);
          },
          onProgress(bytesUploaded) {
            uploadedByIndex[index] = bytesUploaded;
            onProgress();
          },
          onSuccess() {
            uploadedByIndex[index] = file.size;
            onProgress();
            activeUploadsRef.current.delete(upload);
            resolve();
          },
        });
        activeUploadsRef.current.add(upload);
        upload.start();
      });

      return {
        path: intent.path,
        url: localFileUrl(intent.path),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        ...(await getImageDimensions(file)),
      };
    },
    [spaceId],
  );

  const runUpload = useCallback(
    async (files: File[], presentation: UploadPresentation, existingId?: string) => {
      validateFiles(files);
      if (batch?.status === "uploading") {
        throw new Error("Wait for the current upload or cancel it");
      }

      cancelledRef.current = false;
      const batchId = existingId || `placeholder-${crypto.randomUUID()}`;
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      const uploadedByIndex = files.map(() => 0);
      clearPreviews();

      const placeholderMeta =
        presentation === "photos"
          ? {
              type: "photos",
              previewUrls: [],
              count: files.length,
              items: files.map((file) => ({
                name: file.name,
                type: file.type,
                size: file.size,
              })),
            }
          : presentation === "drawing"
            ? { type: "drawing" }
            : {
                type: "files",
                items: files.map((file) => ({
                  name: file.name,
                  type: file.type,
                  size: file.size,
                })),
              };

      if (!existingId) {
        onNewEntry({
          id: batchId,
          space_id: spaceId,
          kind: "file",
          text: null,
          meta: placeholderMeta,
          created_by_device_id: currentDeviceId || null,
          created_at: new Date().toISOString(),
          isLoading: true,
          uploadProgress: 0,
        });
      } else {
        onUpdateEntry(batchId, {
          isLoading: true,
          isError: false,
          uploadProgress: 0,
          meta: placeholderMeta,
        });
      }

      setBatch({ id: batchId, files, presentation, progress: 0, status: "uploading" });

      const reportProgress = () => {
        const bytesUploaded = uploadedByIndex.reduce((sum, value) => sum + value, 0);
        const progress = Math.min(99, Math.round((bytesUploaded / totalBytes) * 100));
        setBatch((current) => (current ? { ...current, progress } : current));
        onUpdateEntry(batchId, { uploadProgress: progress });
      };

      const uploaded: Awaited<ReturnType<typeof uploadOne>>[] = new Array(files.length);
      let nextIndex = 0;
      const worker = async () => {
        while (!cancelledRef.current) {
          const index = nextIndex++;
          if (index >= files.length) return;
          uploaded[index] = await uploadOne(files[index], uploadedByIndex, index, reportProgress);
        }
      };

      try {
        const workerResults = await Promise.allSettled(
          Array.from({ length: Math.min(CONCURRENT_UPLOADS, files.length) }, worker),
        );
        const uploadedPaths = uploaded
          .filter(Boolean)
          .map((item) => item.path);
        if (cancelledRef.current) {
          if (uploadedPaths.length) {
            await supabaseBrowser.storage.from("files").remove(uploadedPaths);
          }
          return;
        }
        const failedWorker = workerResults.find(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        if (failedWorker) {
          if (uploadedPaths.length) {
            await supabaseBrowser.storage.from("files").remove(uploadedPaths);
          }
          throw failedWorker.reason;
        }

        // One database commit after every object succeeds. Remote participants
        // never see a partially completed batch.
        const entry = await createUploadedEntry(spaceId, uploaded, presentation);
        onUpdateEntry(batchId, { uploadProgress: 100 });
        onReplaceEntry(batchId, entry as Entry);
        setBatch(null);
        clearPreviews();
        toast.success(files.length === 1 ? "Upload complete" : `${files.length} files uploaded`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed";
        setBatch({
          id: batchId,
          files,
          presentation,
          progress: 0,
          status: "failed",
          error: message,
        });
        onUpdateEntry(batchId, {
          isLoading: true,
          isError: true,
          uploadProgress: 0,
        });
        toast.error(message);
      }
    },
    [
      batch?.status,
      clearPreviews,
      currentDeviceId,
      onNewEntry,
      onReplaceEntry,
      onUpdateEntry,
      spaceId,
      uploadOne,
      validateFiles,
    ],
  );

  const cancelUpload = useCallback(async () => {
    cancelledRef.current = true;
    await Promise.all(
      [...activeUploadsRef.current].map((upload) => upload.abort(true).catch(() => undefined)),
    );
    activeUploadsRef.current.clear();
    if (batch) onRemoveEntry(batch.id);
    setBatch(null);
    clearPreviews();
    toast.message("Upload cancelled");
  }, [batch, clearPreviews, onRemoveEntry]);

  const retryUpload = useCallback(() => {
    if (!batch || batch.status !== "failed") return;
    void runUpload(batch.files, batch.presentation, batch.id);
  }, [batch, runUpload]);

  const sendText = async () => {
    const message = text.trim();
    if (!message || isPosting) return;
    setIsPosting(true);
    try {
      const entry = await createEntry(spaceId, "text", message);
      onNewEntry(entry as Entry);
      setText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send message");
    } finally {
      setIsPosting(false);
    }
  };

  const createNote = async () => {
    if (isPosting) return;
    setIsPosting(true);
    try {
      const result = await createNoteEntry(spaceId);
      onNewEntry({
        id: result.entryId,
        space_id: spaceId,
        kind: "text",
        text: `NOTE:${result.noteSlug}`,
        meta: {
          type: "note",
          note_slug: result.noteSlug,
          public_code: result.publicCode,
          title: "Untitled Note",
        },
        created_by_device_id: currentDeviceId || null,
        created_at: new Date().toISOString(),
      });
      router.push(`/n/${result.noteSlug}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create note");
    } finally {
      setIsPosting(false);
    }
  };

  const receiveFiles = useCallback(
    (list: FileList | File[], preferred?: UploadPresentation) => {
      const files = Array.from(list);
      const presentation =
        preferred ||
        (files.every((file) => file.type.startsWith("image/")) ? "photos" : "files");
      void runUpload(files, presentation).catch((error) => {
        toast.error(error instanceof Error ? error.message : "Unable to upload");
      });
    },
    [runUpload],
  );

  const saveDrawing = useCallback(
    async (dataUrl: string) => {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `drawing-${Date.now()}.png`, { type: "image/png" });
      receiveFiles([file], "drawing");
    },
    [receiveFiles],
  );

  useEffect(() => {
    const pending = (window as any).__pending_dragged_files as File[] | undefined;
    if (pending?.length) {
      delete (window as any).__pending_dragged_files;
      receiveFiles(pending);
    }
  }, [receiveFiles]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files || [])];
      if (!files.length) return;
      event.preventDefault();
      receiveFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [receiveFiles]);

  return (
    <>
      <div
        className={`relative rounded-2xl border bg-background/95 shadow-xl shadow-black/5 backdrop-blur ${
          isDragging ? "border-orange-500 ring-4 ring-orange-500/10" : "border-border"
        } ${centered ? "p-3 sm:p-4" : "p-2 sm:p-3"}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (event.dataTransfer.files.length) receiveFiles(event.dataTransfer.files);
        }}
      >
        {isDragging && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-background/90 text-sm font-semibold text-orange-600 backdrop-blur">
            Drop files to upload
          </div>
        )}

        {batch && (
          <div className="mb-2 rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">
                  {batch.status === "failed"
                    ? "Upload failed"
                    : `Uploading ${batch.files.length} ${batch.files.length === 1 ? "file" : "files"}`}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {batch.status === "failed"
                    ? batch.error
                    : `${batch.progress}% · ${formatBytes(
                        batch.files.reduce((sum, file) => sum + file.size, 0),
                      )}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {batch.status === "failed" && (
                  <button
                    onClick={retryUpload}
                    className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium hover:bg-background"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                )}
                <button
                  onClick={() => void cancelUpload()}
                  className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-background"
                >
                  {batch.status === "uploading" ? (
                    <Square className="h-3.5 w-3.5" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  {batch.status === "uploading" ? "Cancel" : "Dismiss"}
                </button>
              </div>
            </div>
            {batch.status === "uploading" && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-orange-500 transition-[width] duration-150"
                  style={{ width: `${batch.progress}%` }}
                />
              </div>
            )}
          </div>
        )}

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void sendText();
            }
          }}
          rows={centered ? 4 : 2}
          maxLength={50_000}
          placeholder="Write something…"
          className="max-h-48 min-h-[52px] w-full resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
          aria-label="Message"
        />

        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => photoInputRef.current?.click()}
              className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Upload photos"
            >
              <ImageIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Photos</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Upload files"
            >
              <Paperclip className="h-4 w-4" />
              <span className="hidden sm:inline">Files</span>
            </button>
            <button
              onClick={() => setDrawingOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Open drawing canvas"
            >
              <PenLine className="h-4 w-4" />
              <span className="hidden md:inline">Draw</span>
            </button>
            <button
              onClick={() => void createNote()}
              className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Create note"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden md:inline">Note</span>
            </button>
          </div>
          <button
            onClick={() => void sendText()}
            disabled={!text.trim() || isPosting}
            className="flex h-9 items-center gap-2 rounded-xl bg-orange-500 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPosting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) receiveFiles(event.target.files, "photos");
            event.target.value = "";
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) receiveFiles(event.target.files, "files");
            event.target.value = "";
          }}
        />
      </div>

      <DrawingCanvas
        isOpen={drawingOpen}
        onClose={() => setDrawingOpen(false)}
        onSave={(dataUrl) => void saveDrawing(dataUrl)}
      />
    </>
  );
}
