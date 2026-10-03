"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Upload } from "tus-js-client";
import {
  Code2,
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
import { formatBytes } from "@/lib/utils";
import type { Entry } from "./entry-card";

const DrawingCanvas = dynamic(
  () => import("./digital-canvas").then((module) => module.DrawingCanvas),
  { ssr: false },
);

interface ComposerProps {
  spaceId: string;
  spaceSlug?: string;
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

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_BATCH_FILES = 20;
const CONCURRENT_UPLOADS = 3;
let uploadLibrary: Promise<typeof import("tus-js-client")> | undefined;
const loadUploadLibrary = () => (uploadLibrary ||= import("tus-js-client").catch((error) => { uploadLibrary = undefined; throw error; }));
const warmUploadLibrary = () => { void loadUploadLibrary().catch(() => undefined); };

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
  spaceSlug,
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
  const [noteCreationStage, setNoteCreationStage] = useState<"creating" | "opening" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [batch, setBatch] = useState<BatchState | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const activeUploadsRef = useRef<Set<Upload>>(new Set());
  const cancelTransfersRef = useRef<Set<() => void>>(new Set());
  const retainedBatchRef = useRef<{ id: string; intents: { path: string; bucket: string }[]; uploaded: Awaited<ReturnType<typeof uploadOne>>[] } | null>(null);
  const batchControllerRef = useRef<AbortController | null>(null);
  const publishingRef = useRef(false);
  const previewUrlsRef = useRef<string[]>([]);
  const isPostingRef = useRef(false);
  const isSavingDrawingRef = useRef(false);
  const isCreatingNoteRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectionToolbar, setSelectionToolbar] = useState<{
    visible: boolean;
    start: number;
    end: number;
    top: number;
    left: number;
  } | null>(null);

  const updateSelectionToolbar = useCallback(
    (clientCoords?: { x: number; y: number }) => {
      const textarea = textareaRef.current;
      const container = containerRef.current;
      if (!textarea || !container) {
        setSelectionToolbar(null);
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      if (start === end || end - start <= 0) {
        setSelectionToolbar(null);
        return;
      }

      const selected = textarea.value.substring(start, end).trim();
      if (!selected) {
        setSelectionToolbar(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      let top: number;
      let left: number;

      if (clientCoords) {
        left = Math.max(
          12,
          Math.min(clientCoords.x - containerRect.left - 35, containerRect.width - 95),
        );
        top = Math.max(8, clientCoords.y - containerRect.top - 42);
      } else {
        const textBefore = textarea.value.slice(0, start);
        const lineCount = textBefore.split("\n").length;
        const lineHeight = centered ? 28 : 22;
        top = Math.max(
          8,
          textarea.offsetTop + lineCount * lineHeight - textarea.scrollTop - 40,
        );
        left = Math.max(16, Math.min(textarea.offsetLeft + 16, containerRect.width - 95));
      }

      setSelectionToolbar({
        visible: true,
        start,
        end,
        top,
        left,
      });
    },
    [centered],
  );

  const handleWrapSelectionWithCode = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = selectionToolbar?.start ?? textarea.selectionStart;
    const end = selectionToolbar?.end ?? textarea.selectionEnd;

    if (start === end) {
      // Empty selection: insert empty code block at cursor
      const before = text.substring(0, start);
      const after = text.substring(end);
      const needsPrefix = before.length > 0 && !before.endsWith("\n");
      const needsSuffix = after.length > 0 && !after.startsWith("\n");
      const snippet = (needsPrefix ? "\n" : "") + "```\n\n```" + (needsSuffix ? "\n" : "");
      const nextText = before + snippet + after;
      setText(nextText);
      setSelectionToolbar(null);
      requestAnimationFrame(() => {
        textarea.focus();
        const insidePos = before.length + (needsPrefix ? 1 : 0) + 4;
        textarea.setSelectionRange(insidePos, insidePos);
      });
      return;
    }

    const before = text.substring(0, start);
    const selected = text.substring(start, end);
    const after = text.substring(end);

    // Check if already enclosed in ``` (toggle off)
    const trimmedSelected = selected.trim();
    if (
      trimmedSelected.startsWith("```") &&
      trimmedSelected.endsWith("```") &&
      trimmedSelected.length >= 6
    ) {
      const unwrapped = trimmedSelected
        .replace(/^```[^\n]*\n?/, "")
        .replace(/\n?```$/, "");
      const nextText = before + unwrapped + after;
      setText(nextText);
      setSelectionToolbar(null);
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(start, start + unwrapped.length);
      });
      return;
    }

    // Format selected portion as code block enclosed in ```
    const needsPrefixNewline = before.length > 0 && !before.endsWith("\n");
    const needsSuffixNewline = after.length > 0 && !after.startsWith("\n");
    const cleanBlock = selected.replace(/^\r?\n+|\r?\n+$/g, "");
    const wrapped =
      (needsPrefixNewline ? "\n" : "") +
      "```\n" +
      cleanBlock +
      "\n```" +
      (needsSuffixNewline ? "\n" : "");

    const nextText = before + wrapped + after;
    setText(nextText);
    setSelectionToolbar(null);

    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = before.length + wrapped.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [selectionToolbar, text]);

  const clearPreviews = useCallback(() => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
  }, []);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const minHeight = centered ? 180 : 42;
    const maxHeight = centered ? 450 : 280;
    const scrollH = el.scrollHeight;
    if (scrollH > minHeight) {
      el.style.height = `${Math.min(scrollH, maxHeight)}px`;
    } else {
      el.style.height = `${minHeight}px`;
    }
  }, [centered]);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  useEffect(() => {
    const activeUploads = activeUploadsRef.current;
    const cancelTransfers = cancelTransfersRef.current;
    return () => {
      batchControllerRef.current?.abort();
      activeUploads.forEach((upload) => void upload.abort(true));
      cancelTransfers.forEach((cancel) => cancel());
      const paths = retainedBatchRef.current?.uploaded.filter(Boolean).map((item) => item.path) || [];
      if (paths.length && !publishingRef.current) void supabaseBrowser.storage.from("files").remove(paths);
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
      throw new Error(`${tooLarge.name} exceeds the 50 MB file limit`);
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
      const dimensions = getImageDimensions(file);
      const tus = await loadUploadLibrary();
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
          cancelTransfersRef.current.delete(cancel);
          callback();
        };
        const cancel = () => finish(() => reject(new DOMException("Upload cancelled", "AbortError")));
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
        cancelTransfersRef.current.add(cancel);
        resetNoProgressTimer();
        upload.start();
      });

      return {
        path: intent.path,
        url: localFileUrl(intent.path),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        ...(await dimensions),
      };
    },
    [],
  );

  const runUpload = useCallback(
    async (files: File[], presentation: UploadPresentation, existingId?: string) => {
      validateFiles(files);
      if (batchControllerRef.current || batch?.status === "uploading") {
        throw new Error("Wait for the current upload or cancel it");
      }

      const controller = new AbortController();
      batchControllerRef.current = controller;
      warmUploadLibrary();
      if (!existingId && retainedBatchRef.current) {
        const previous = retainedBatchRef.current;
        retainedBatchRef.current = null;
        onRemoveEntry(previous.id);
        const paths = previous.uploaded.filter(Boolean).map((item) => item.path);
        if (paths.length) void supabaseBrowser.storage.from("files").remove(paths);
      }
      onUploadStateChange?.(true);
      const batchId = existingId || `placeholder-${crypto.randomUUID()}`;
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      const uploadedByIndex = files.map(() => 0);
      clearPreviews();

      const placeholderMeta =
        presentation === "photos"
          ? {
              type: "photos",
              previewUrls: files.map((file) => {
                const url = URL.createObjectURL(file);
                previewUrlsRef.current.push(url);
                return url;
              }),
              count: files.length,
              items: files.map((file) => ({
                name: file.name,
                type: file.type,
                size: file.size,
              })),
            }
          : presentation === "drawing"
            ? (() => {
                const previewUrl = URL.createObjectURL(files[0]);
                previewUrlsRef.current.push(previewUrl);
                return { type: "drawing", previewUrl };
              })()
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

      let lastProgress = -1;
      const reportProgress = () => {
        const bytesUploaded = uploadedByIndex.reduce((sum, value) => sum + value, 0);
        const progress = Math.min(99, Math.round((bytesUploaded / totalBytes) * 100));
        if (lastProgress === progress || controller.signal.aborted) return;
        lastProgress = progress;
        setBatch((current) => (current ? { ...current, progress } : current));
        onUpdateEntry(batchId, { uploadProgress: progress });
      };

      const cached = existingId && retainedBatchRef.current?.id === existingId ? retainedBatchRef.current : null;
      let uploaded: Awaited<ReturnType<typeof uploadOne>>[] = cached?.uploaded || new Array(files.length);
      let nextIndex = 0;

      try {
        let retainedIntents = cached?.intents;
        if (retainedIntents) {
          const { data, error } = await supabaseBrowser.from("upload_intents").select("path").in("path", retainedIntents.map((item) => item.path)).gt("expires_at", new Date(Date.now() + 60_000).toISOString());
          if (error || data?.length !== retainedIntents.length) {
            const paths = uploaded.filter(Boolean).map((item) => item.path);
            if (paths.length) await supabaseBrowser.storage.from("files").remove(paths);
            uploaded = new Array(files.length);
            retainedIntents = undefined;
          }
        }
        const [intents, authResult] = await Promise.all([
          retainedIntents ? Promise.resolve(retainedIntents) : createUploadIntents(
            spaceId,
            files.map((file) => ({
              name: file.name,
              size: file.size,
              type: file.type,
            })),
          ),
          supabaseBrowser.auth.getSession(),
        ]);
        retainedBatchRef.current = { id: batchId, intents, uploaded };
        uploaded.forEach((item, index) => { if (item) uploadedByIndex[index] = files[index].size; });
        reportProgress();
        const session = authResult.data.session;
        if (!session) throw new Error("Your anonymous session expired. Refresh and retry.");

        const workerResults = await Promise.allSettled(
          Array.from({ length: Math.min(CONCURRENT_UPLOADS, files.length) }, async () => {
            while (!controller.signal.aborted) {
              const index = nextIndex++;
              if (index >= files.length) return;
              if (uploaded[index]) continue;
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
        if (controller.signal.aborted) {
          if (uploadedPaths.length) {
            await supabaseBrowser.storage.from("files").remove(uploadedPaths);
          }
          return;
        }
        const failedWorker = workerResults.find(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        if (failedWorker) {
          throw failedWorker.reason;
        }

        // One database commit after every object succeeds. Remote participants
        // never see a partially completed batch.
        publishingRef.current = true;
        const entry = await createUploadedEntry(spaceId, uploaded, presentation).finally(() => { publishingRef.current = false; });
        onUpdateEntry(batchId, { uploadProgress: 100 });
        onReplaceEntry(batchId, entry as Entry);
        retainedBatchRef.current = null;
        setBatch(null);
        onUploadStateChange?.(false);
        clearPreviews();
        toast.success(files.length === 1 ? "Upload complete" : `${files.length} files uploaded`);
      } catch (error) {
        if (controller.signal.aborted) return;
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
      } finally {
        if (batchControllerRef.current === controller) batchControllerRef.current = null;
      }
    },
    [
      batch?.status,
      clearPreviews,
      currentDeviceId,
      onNewEntry,
      onReplaceEntry,
      onRemoveEntry,
      onUploadStateChange,
      onUpdateEntry,
      spaceId,
      uploadOne,
      validateFiles,
    ],
  );

  const cancelUpload = useCallback(async () => {
    if (publishingRef.current) { toast.message("Finishing this upload. Please wait a moment."); return; }
    batchControllerRef.current?.abort();
    // Rejecting the transfer promise removes it from the active set. Capture
    // the transports first so cancellation also stops their requests/retries.
    const uploads = [...activeUploadsRef.current];
    const aborts = uploads.map((upload) => upload.abort(true).catch(() => undefined));
    cancelTransfersRef.current.forEach((cancel) => cancel());
    await Promise.all(aborts);
    activeUploadsRef.current.clear();
    const paths = retainedBatchRef.current?.uploaded.filter(Boolean).map((item) => item.path) || [];
    retainedBatchRef.current = null;
    if (paths.length) await supabaseBrowser.storage.from("files").remove(paths);
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
    if (!message || isPosting || isPostingRef.current) return;
    isPostingRef.current = true;
    setIsPosting(true);

    // Instantly clear input and collapse auto-height
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const tempId = `temp-${crypto.randomUUID()}`;
    const optimisticEntry: Entry = {
      id: tempId,
      space_id: spaceId,
      kind: "text",
      text: message,
      meta: null,
      created_by_device_id: currentDeviceId || null,
      created_at: new Date().toISOString(),
      isLoading: true,
    };

    // Show immediately in timeline
    onNewEntry(optimisticEntry);

    try {
      const entry = await createEntry(spaceId, "text", message);
      onReplaceEntry(tempId, entry as Entry);
    } catch (error) {
      onUpdateEntry(tempId, { isError: true, isLoading: false });
      toast.error(error instanceof Error ? error.message : "Unable to send message");
    } finally {
      isPostingRef.current = false;
      setIsPosting(false);
    }
  };

  const createNote = async () => {
    if (isPosting || noteCreationStage || isCreatingNoteRef.current) return;
    isCreatingNoteRef.current = true;
    setNoteCreationStage("creating");
    void import("./note-editor").catch(() => undefined);
    try {
      const result = await createNoteEntry(spaceId);
      const noteHref = spaceSlug
        ? `/${spaceSlug}/${result.noteSlug}`
        : `/n/${result.noteSlug}`;
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
          space_slug: spaceSlug,
        },
        created_by_device_id: currentDeviceId || null,
        created_at: new Date().toISOString(),
      });
      setNoteCreationStage("opening");
      router.prefetch(noteHref);
      router.push(noteHref);
    } catch (error) {
      setNoteCreationStage(null);
      toast.error(error instanceof Error ? error.message : "Unable to create note");
    } finally {
      isCreatingNoteRef.current = false;
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
    async (blob: Blob) => {
      if (isSavingDrawingRef.current || batch?.status === "uploading") {
        throw new Error("Wait for the current upload or cancel it");
      }
      isSavingDrawingRef.current = true;
      try {
        const file = new File([blob], `drawing-${Date.now()}.png`, { type: "image/png" });
        const upload = runUpload([file], "drawing");
        void upload.catch((error) => {
          toast.error(error instanceof Error ? error.message : "Unable to send drawing");
        });
        // runUpload creates the visible timeline placeholder synchronously before
        // its first network wait. Yield once so the canvas closes only after that
        // handoff is visible to the user.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      } finally {
        isSavingDrawingRef.current = false;
      }
    },
    [batch?.status, runUpload],
  );

  useEffect(() => {
    const pending = (window as any).__pending_dragged_files as File[] | undefined;
    if (pending?.length) {
      delete (window as any).__pending_dragged_files;
      receiveFiles(pending);
    }
  }, [receiveFiles]);

  const isModalOrOverlayActive = useCallback(() => {
    if (drawingOpen) return true;
    if (typeof document === "undefined") return false;
    return Boolean(
      document.querySelector(
        '[role="dialog"], [data-woff-canvas="true"], [data-woff-modal="true"], [data-radix-portal]',
      ),
    );
  }, [drawingOpen]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isModalOrOverlayActive()) return;

      const activeEl = document.activeElement;
      if (
        activeEl &&
        activeEl !== textareaRef.current &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      const itemFiles = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      const files =
        itemFiles.length > 0
          ? itemFiles
          : Array.from(event.clipboardData?.files || []);
      if (files.length > 0) {
        event.preventDefault();
        receiveFiles(files);
        return;
      }

      // If user pasted text while focused outside any input/textarea, populate composer
      if (activeEl !== textareaRef.current) {
        const textData = event.clipboardData?.getData("text/plain");
        if (textData) {
          event.preventDefault();
          setText((prev) => (prev ? `${prev}\n${textData}` : textData));
          textareaRef.current?.focus();
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [isModalOrOverlayActive, receiveFiles]);

  useEffect(() => {
    let dragDepth = 0;
    const containsFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types || []).includes("Files");

    const onDragEnter = (event: DragEvent) => {
      if (containsFiles(event)) warmUploadLibrary();
      if (isModalOrOverlayActive()) return;
      if (!containsFiles(event)) return;
      event.preventDefault();
      dragDepth += 1;
      setIsDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (isModalOrOverlayActive()) {
        setIsDragging(false);
        return;
      }
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
      if (isModalOrOverlayActive()) {
        setIsDragging(false);
        return;
      }
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
  }, [isModalOrOverlayActive, receiveFiles]);

  return (
    <>
      <div
        ref={containerRef}
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

        {noteCreationStage &&
          typeof document !== "undefined" &&
          createPortal(
            <div className="fixed inset-0 z-[9998] flex h-dvh w-screen items-center justify-center bg-background/80 p-6 backdrop-blur-sm">
              <div
                className="w-full max-w-sm rounded-3xl border bg-background p-6 text-center shadow-2xl"
                role="status"
                aria-live="polite"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
                <p className="mt-4 text-base font-semibold">
                  {noteCreationStage === "creating" ? "Creating your note…" : "Opening the editor…"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {noteCreationStage === "creating"
                    ? "This usually takes just a moment. You only need to click once."
                    : "Your note is ready. Loading the writing space now."}
                </p>
                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full bg-orange-500 transition-all duration-500 ${
                      noteCreationStage === "creating" ? "w-1/2 animate-pulse" : "w-full"
                    }`}
                  />
                </div>
              </div>
            </div>,
            document.body,
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

        {selectionToolbar && selectionToolbar.visible && (
          <div
            style={{
              top: `${selectionToolbar.top}px`,
              left: `${selectionToolbar.left}px`,
            }}
            className="absolute z-40 animate-in fade-in zoom-in-95 duration-150"
          >
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={handleWrapSelectionWithCode}
              className="flex items-center gap-1.5 rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white shadow-2xl ring-1 ring-white/20 backdrop-blur-md transition hover:scale-105 hover:bg-neutral-900 active:scale-95 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              title="Format as code block (```)"
            >
              <Code2 className="h-3.5 w-3.5 text-orange-500" />
              <span>Code</span>
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSelectionToolbar(null);
          }}
          onMouseUp={(e) => updateSelectionToolbar({ x: e.clientX, y: e.clientY })}
          onKeyUp={() => updateSelectionToolbar()}
          onSelect={() => updateSelectionToolbar()}
          onScroll={() => setSelectionToolbar(null)}
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              const target = event.currentTarget;
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const currentVal = target.value;
              const nextVal = currentVal.substring(0, start) + "  " + currentVal.substring(end);
              setText(nextVal);
              requestAnimationFrame(() => {
                target.selectionStart = target.selectionEnd = start + 2;
              });
              return;
            }
            if (event.key === "Enter") {
              if (event.metaKey || event.ctrlKey) {
                event.preventDefault();
                void sendText();
              } else if (!centered && !event.shiftKey && typeof window !== "undefined" && window.innerWidth >= 640) {
                // If message contains multiple lines or starts with a code fence, allow Enter to insert a newline.
                // Fast-send only applies to single-line messages.
                if (!text.includes("\n") && !text.startsWith("```")) {
                  event.preventDefault();
                  void sendText();
                }
              }
            }
          }}
          rows={centered ? 4 : 2}
          maxLength={50_000}
          placeholder={centered ? "What's on your mind?" : "Write something…"}
          className={`relative z-10 w-full resize-none bg-transparent outline-none overflow-y-auto ${
            centered
              ? "min-h-[180px] px-8 pb-3 pt-7 text-lg leading-relaxed text-neutral-900 placeholder:text-neutral-500/50 sm:px-10 sm:pt-8 sm:text-xl dark:text-white dark:placeholder:text-white/35"
              : "min-h-[42px] px-1 py-1 text-[15px] leading-relaxed text-zinc-850 caret-orange-500 placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
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
              onClick={() => { warmUploadLibrary(); fileInputRef.current?.click(); }}
              className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-zinc-500 transition hover:bg-orange-500/10 hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400"
              aria-label="Upload files"
            >
              <Paperclip className="h-4 w-4" />
              <span className="hidden sm:inline">Files</span>
            </button>
            <button
              onClick={() => setDrawingOpen(true)}
              disabled={Boolean(noteCreationStage)}
              className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-zinc-500 transition hover:bg-orange-500/10 hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400"
              aria-label="Open drawing canvas"
            >
              <PenLine className="h-4 w-4" />
              <span className="hidden md:inline">Draw</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={handleWrapSelectionWithCode}
              disabled={Boolean(noteCreationStage) || isPosting}
              className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-zinc-500 transition hover:bg-orange-500/10 hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400"
              aria-label="Format as code block"
              title="Code block (```)"
            >
              <Code2 className="h-4 w-4" />
              <span className="hidden md:inline">Code</span>
            </button>
            <button
              onClick={() => void createNote()}
              disabled={Boolean(noteCreationStage) || isPosting}
              className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-zinc-500 transition hover:bg-orange-500/10 hover:text-orange-600 disabled:cursor-wait disabled:opacity-60 dark:text-zinc-400 dark:hover:text-orange-400"
              aria-label="Create note"
            >
              {noteCreationStage ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span className="hidden md:inline">
                {noteCreationStage ? "Opening…" : "Note"}
              </span>
            </button>
          </div>
          <button
            onClick={() => void sendText()}
            disabled={!text.trim() || isPosting || Boolean(noteCreationStage)}
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

      {drawingOpen && <DrawingCanvas
        isOpen={drawingOpen}
        onClose={() => setDrawingOpen(false)}
        onSave={saveDrawing}
      />}
    </>
  );
}
