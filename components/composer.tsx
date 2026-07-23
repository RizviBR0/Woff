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
  createUploadIntents,
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
  onUploadStateChange?: (active: boolean) => void;
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

const MAX_FILE_BYTES = 200 * 1024 * 1024;
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
  onUploadStateChange,
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
      throw new Error(`${tooLarge.name} exceeds the 200 MB file limit`);
    }
  }, []);

  const uploadOne = useCallback(
    async (
      file: File,
      intent: { path: string; bucket: string },
      accessToken: string,
      uploadedByIndex: number[],
      index: number,
      onProgress: () => void,
    ) => {
      const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const apiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!projectUrl || !apiKey) throw new Error("Upload service is not configured");
      const parsedUrl = new URL(projectUrl);
      const projectId = parsedUrl.hostname.endsWith(".supabase.co")
        ? parsedUrl.hostname.split(".")[0]
        : null;
      const storageOrigin = projectId
        ? `https://${projectId}.storage.supabase.co`
        : parsedUrl.origin;
      const endpoint = `${storageOrigin}/storage/v1/upload/resumable`;

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let noProgressTimer: ReturnType<typeof setTimeout>;
        const finish = (callback: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(noProgressTimer);
          activeUploadsRef.current.delete(upload);
          callback();
        };
        const resetNoProgressTimer = () => {
          clearTimeout(noProgressTimer);
          noProgressTimer = setTimeout(() => {
            void upload.abort(true);
            finish(() =>
              reject(new Error("Upload stopped making progress. Check your connection and retry.")),
            );
          }, 60_000);
        };
        const upload = new tus.Upload(file, {
          endpoint,
          retryDelays: [0, 3000, 5000, 10_000, 20_000],
          headers: {
            authorization: `Bearer ${accessToken}`,
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
            finish(() => reject(error));
          },
          onProgress(bytesUploaded) {
            uploadedByIndex[index] = bytesUploaded;
            resetNoProgressTimer();
            onProgress();
          },
          onSuccess() {
            uploadedByIndex[index] = file.size;
            onProgress();
            finish(resolve);
          },
        });
        activeUploadsRef.current.add(upload);
        resetNoProgressTimer();
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
    [],
  );

  const runUpload = useCallback(
    async (files: File[], presentation: UploadPresentation, existingId?: string) => {
      validateFiles(files);
      if (batch?.status === "uploading") {
        throw new Error("Wait for the current upload or cancel it");
      }

      cancelledRef.current = false;
      onUploadStateChange?.(true);
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

      try {
        const [intents, authResult] = await Promise.all([
          createUploadIntents(
            spaceId,
            files.map((file) => ({
              name: file.name,
              size: file.size,
              type: file.type,
            })),
          ),
          supabaseBrowser.auth.getSession(),
        ]);
        const session = authResult.data.session;
        if (!session) throw new Error("Your anonymous session expired. Refresh and retry.");

        const workerResults = await Promise.allSettled(
          Array.from({ length: Math.min(CONCURRENT_UPLOADS, files.length) }, async () => {
            while (!cancelledRef.current) {
              const index = nextIndex++;
              if (index >= files.length) return;
              uploaded[index] = await uploadOne(
                files[index],
                intents[index],
                session.access_token,
                uploadedByIndex,
                index,
                reportProgress,
              );
            }
          }),
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
        onUploadStateChange?.(false);
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
      onUploadStateChange,
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
    onUploadStateChange?.(false);
    clearPreviews();
    toast.message("Upload cancelled");
  }, [batch, clearPreviews, onRemoveEntry, onUploadStateChange]);

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
      const itemFiles = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      const files =
        itemFiles.length > 0
          ? itemFiles
          : Array.from(event.clipboardData?.files || []);
      if (!files.length) return;
      event.preventDefault();
      receiveFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [receiveFiles]);

  useEffect(() => {
    let dragDepth = 0;
    const containsFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types || []).includes("Files");

    const onDragEnter = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      dragDepth += 1;
      setIsDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (event.relatedTarget === null) dragDepth = 0;
      if (dragDepth === 0) setIsDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      dragDepth = 0;
      setIsDragging(false);
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length) receiveFiles(files);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [receiveFiles]);

  return (
    <>
      <div
        className={`group relative transition-all duration-300 ${
          centered
            ? "overflow-hidden rounded-[28px] border border-black/10 bg-white/95 shadow-[0_20px_65px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:border-white/[0.12] dark:bg-[#0b0b0b]/80 dark:shadow-[0_24px_80px_rgba(0,0,0,0.4)]"
            : "rounded-[24px] border border-zinc-200/85 bg-white/90 px-3.5 py-2.5 shadow-xl shadow-black/5 backdrop-blur-xl hover:border-zinc-300 hover:shadow-2xl hover:shadow-black/10 dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:hover:border-zinc-700/80"
        } ${
          isDragging
            ? "border-orange-500 ring-4 ring-orange-500/10"
            : ""
        }`}
      >
        {centered && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(255,90,0,0.12),transparent_45%),radial-gradient(circle_at_70%_0%,rgba(255,90,0,0.08),transparent_34%),radial-gradient(circle_at_100%_100%,rgba(255,90,0,0.06),transparent_30%)] dark:bg-[radial-gradient(circle_at_0%_0%,rgba(255,90,0,0.22),transparent_45%),radial-gradient(circle_at_70%_0%,rgba(255,90,0,0.18),transparent_34%),radial-gradient(circle_at_100%_100%,rgba(255,90,0,0.12),transparent_30%)]" />
            <svg
              className="pointer-events-none absolute left-0 top-0 z-10 h-48 w-48"
              viewBox="0 0 192 192"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M 1,192 L 1,29 A 28,28 0 0,1 29,1 L 192,1"
                stroke="url(#composer-orange-glow)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient
                  id="composer-orange-glow"
                  x1="0"
                  y1="0"
                  x2="192"
                  y2="192"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="#f97316" stopOpacity="0.7" />
                  <stop offset="55%" stopColor="#f59e0b" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </>
        )}

        {isDragging && (
          <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-6 backdrop-blur">
            <div className="rounded-3xl border-2 border-dashed border-orange-500 bg-background px-10 py-8 text-center shadow-2xl">
              <p className="text-base font-semibold text-orange-600">Drop files to upload</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Release anywhere in this space
              </p>
            </div>
          </div>
        )}

        {batch && (
          <div
            className={`relative z-20 rounded-xl border border-border bg-background/80 p-3 ${
              centered ? "mx-5 mt-5 sm:mx-7" : "mb-2"
            }`}
          >
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
          placeholder={centered ? "What's on your mind?" : "Write something…"}
          className={`relative z-10 w-full resize-none bg-transparent outline-none ${
            centered
              ? "min-h-[180px] px-8 pb-3 pt-7 text-lg leading-relaxed text-neutral-900 placeholder:text-neutral-500/50 sm:px-10 sm:pt-8 sm:text-xl dark:text-white dark:placeholder:text-white/35"
              : "max-h-36 min-h-[42px] px-1 py-1 text-[15px] leading-relaxed text-zinc-850 caret-orange-500 placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          }`}
          aria-label="Message"
        />

        <div
          className={`relative z-20 flex items-center justify-between gap-2 ${
            centered
              ? "border-t border-black/[0.06] px-5 pb-4 pt-3 sm:px-7 dark:border-white/[0.08]"
              : "pt-1"
          }`}
        >
          <div className="flex items-center gap-1">
            <button
              onClick={() => photoInputRef.current?.click()}
              className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-zinc-500 transition hover:bg-orange-500/10 hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400"
              aria-label="Upload photos"
            >
              <ImageIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Photos</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-zinc-500 transition hover:bg-orange-500/10 hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400"
              aria-label="Upload files"
            >
              <Paperclip className="h-4 w-4" />
              <span className="hidden sm:inline">Files</span>
            </button>
            <button
              onClick={() => setDrawingOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-zinc-500 transition hover:bg-orange-500/10 hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400"
              aria-label="Open drawing canvas"
            >
              <PenLine className="h-4 w-4" />
              <span className="hidden md:inline">Draw</span>
            </button>
            <button
              onClick={() => void createNote()}
              className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-zinc-500 transition hover:bg-orange-500/10 hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400"
              aria-label="Create note"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden md:inline">Note</span>
            </button>
          </div>
          <button
            onClick={() => void sendText()}
            disabled={!text.trim() || isPosting}
            className="cta-button-glow flex h-9 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold text-white shadow-[0_4px_12px_rgba(255,90,0,0.2)] transition hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
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
