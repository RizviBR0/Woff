"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import NextImage from "next/image";
import {
  Plus,
  Send,
  X,
  Upload,
  FileText,
  Camera,
  Image as ImageIcon,
  Paintbrush,
  FileUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { createEntry } from "@/lib/actions";
import { compressImageAdaptive } from "@/lib/image-compression";
import { cn } from "@/lib/utils";
import { type Entry } from "./entry-card";
import { DynamicDrawingCanvas } from "./ui/dynamic-imports";
import { GlobalImageViewer } from "./global-image-viewer";
import { supabaseBrowser } from "@/lib/supabase-browser";

interface ComposerProps {
  spaceId: string;
  onNewEntry: (entry: Entry) => void;
  onUpdateEntry?: (entryId: string, updates: Partial<Entry>) => void;
  onReplaceEntry?: (placeholderId: string, realEntry: Entry) => void;
  onRemoveEntry?: (entryId: string) => void;
  currentDeviceId?: string | null;
  centered: boolean;
}

export function Composer({
  spaceId,
  onNewEntry,
  onUpdateEntry,
  onReplaceEntry,
  onRemoveEntry,
  currentDeviceId,
  centered,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const anyFileInputRef = useRef<HTMLInputElement>(null);
  const lastUploadSignatureRef = useRef<string>("");
  const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per image

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const composerRef = useRef<HTMLDivElement>(null);

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  // Upload/compress modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadStage, setUploadStage] = useState<
    "Preparing" | "Compressing" | "Uploading" | "Done" | "Error"
  >("Preparing");
  const [uploadProcessed, setUploadProcessed] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadMessage, setUploadMessage] = useState<string>("");

  const handlePreview = (url: string) => {
    setPreviewUrl(url);
    setPreviewOpen(true);
  };

  // ----- Generic file upload state -----
  type PendingFile = {
    id: string;
    file: File;
    name: string;
    size: number;
    type: string;
    progress: number; // 0-100
    status: "pending" | "uploading" | "done" | "error";
    previewUrl?: string;
  };
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [fileUploading, setFileUploading] = useState(false);
  // Caps are configurable to match plan limits
  const MAX_FILE_BYTES =
    parseInt(process.env.NEXT_PUBLIC_MAX_FILE_UPLOAD_BYTES || "") ||
    100 * 1024 * 1024;
  const COMBINED_CAP_BYTES =
    parseInt(process.env.NEXT_PUBLIC_MAX_FILE_COMBINED_BYTES || "") ||
    100 * 1024 * 1024;

  const totalFileSize = pendingFiles.reduce((sum, f) => sum + f.size, 0);
  const hasOversizeFile = pendingFiles.some((f) => f.size > MAX_FILE_BYTES);
  const overCombinedLimit = totalFileSize > COMBINED_CAP_BYTES;

  // Helper to create a placeholder entry for optimistic UI
  const createPlaceholderEntry = (
    kind: Entry["kind"],
    meta: any,
    message?: string,
  ): Entry => {
    const placeholderId = `placeholder-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    return {
      id: placeholderId,
      space_id: spaceId,
      kind,
      text: null,
      meta,
      created_by_device_id: currentDeviceId || null,
      created_at: new Date().toISOString(),
      isLoading: true,
      uploadProgress: 0,
      uploadMessage: message || "Uploading...",
    };
  };

  const uploadSingleFile = async (pf: PendingFile) => {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    // Sanitize filename to avoid weird characters
    const sanitizedName = pf.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniquePath = `${spaceId}/${timestamp}-${randomSuffix}-${sanitizedName}`;

    // 1. Get signed upload URL
    const { data: signData, error: signErr } = await supabaseBrowser.storage
      .from("files") // Ensure you have this bucket or use 'wuff-files'
      .createSignedUploadUrl(uniquePath);

    if (signErr) throw signErr;
    if (!signData) throw new Error("No signed upload URL");

    const { token, path } = signData;

    // 2. Upload file
    const { data: uploadData, error: uploadErr } = await supabaseBrowser.storage
      .from("files")
      .uploadToSignedUrl(path, token, pf.file);

    if (uploadErr) throw uploadErr;

    // 3. Get public URL
    const { data: publicData } = supabaseBrowser.storage
      .from("files")
      .getPublicUrl(path);

    // Update status to done
    setPendingFiles((prev) =>
      prev.map((p) =>
        p.id === pf.id ? { ...p, status: "done", progress: 100 } : p,
      ),
    );

    return {
      name: pf.name,
      size: pf.size,
      type: pf.type,
      url: publicData.publicUrl,
    };
  };

  const handleGenericFilesSelected = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const items = Array.from(files).map((f, i) => {
      let previewUrl = undefined;
      if (f.type.startsWith("image/")) {
        previewUrl = URL.createObjectURL(f);
      }
      return {
        id: `${Date.now()}-${i}-${f.name}`,
        file: f,
        name: f.name,
        size: f.size,
        type: f.type || "application/octet-stream",
        progress: 0,
        status: "pending" as const,
        previewUrl,
      };
    });
    setPendingFiles((prev) => [...prev, ...items]);
    setFileModalOpen(true);
    // Reset inputs
    if (anyFileInputRef.current) anyFileInputRef.current.value = "";
  };

  const formatBytes = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(mb < 1 ? 2 : 1)} MB`;
  };
  const combinedCapLabel = (COMBINED_CAP_BYTES / (1024 * 1024)).toFixed(1);

  // Adaptive compression wrapper returning only dataUrl for legacy usage
  const getCompressedDataUrl = async (file: File) => {
    const result = await compressImageAdaptive(file);
    // Update upload message with compression details when we are in a compression stage
    setUploadMessage(
      result.wasCompressed
        ? `Optimized ${(result.originalBytes / 1024).toFixed(0)}KB → ${(
            result.finalBytes / 1024
          ).toFixed(0)}KB @ q=${result.qualityUsed.toFixed(2)}`
        : `Image ${(result.originalBytes / 1024).toFixed(
            0,
          )}KB did not need compression`,
    );
    return result.dataUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const entry = await createEntry(spaceId, "text", text.trim());
      onNewEntry(entry);
      setText("");

      // Reset textarea height after clearing text
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = "32px";
      }
    } catch (error) {
      /* console.error("Failed to create entry:", error); */
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleDrawing = () => {
    setDropdownOpen(false);
    setDrawingOpen(true);
  };

  const handleDrawingSave = async (dataUrl: string) => {
    // Create placeholder entry immediately for optimistic UI
    const placeholder = createPlaceholderEntry(
      "text",
      { type: "drawing", previewUrl: dataUrl },
      "Saving drawing...",
    );
    onNewEntry(placeholder);
    setDrawingOpen(false);

    try {
      setIsSubmitting(true);
      // Store the drawing as a text entry with the data URL
      const entry = await createEntry(spaceId, "text", `DRAWING:${dataUrl}`);
      // Replace placeholder with real entry
      onReplaceEntry?.(placeholder.id, entry);
    } catch (error) {
      /* console.error("Failed to save drawing:", error); */
      onUpdateEntry?.(placeholder.id, {
        isLoading: false,
        uploadMessage: "Failed to save drawing",
      });
      setTimeout(() => onRemoveEntry?.(placeholder.id), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImages = () => {
    setDropdownOpen(false);
    if (multiFileInputRef.current) {
      multiFileInputRef.current.click();
    }
  };

  const handlePhoto = () => {
    setDropdownOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileUploadClick = () => {
    setDropdownOpen(false);
    if (anyFileInputRef.current) {
      anyFileInputRef.current.value = "";
      anyFileInputRef.current.click();
    }
  };

  const handleNewNote = async () => {
    setDropdownOpen(false);

    // Generate a random note slug and public code
    const noteSlug = Math.random().toString(36).substring(2, 8);
    const publicCode = Math.random().toString(36).substring(2, 7).toUpperCase();

    // Create placeholder entry immediately for optimistic UI
    const placeholder = createPlaceholderEntry(
      "text",
      { type: "note", noteSlug, publicCode },
      "Creating note...",
    );
    onNewEntry(placeholder);

    try {
      setIsSubmitting(true);

      // Create a chat entry for the note
      const entry = await createEntry(
        spaceId,
        "text",
        `NOTE:${noteSlug}:${publicCode}:Untitled Note`,
      );

      // Replace placeholder with real entry
      onReplaceEntry?.(placeholder.id, entry);

      // Navigate to the note editor
      window.location.href = `/n/${noteSlug}`;
    } catch (error) {
      /* console.error("Failed to create note entry:", error); */
      onUpdateEntry?.(placeholder.id, {
        isLoading: false,
        uploadMessage: "Failed to create note",
      });
      setTimeout(() => onRemoveEntry?.(placeholder.id), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleImageCapture = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (isSubmitting) {
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if it's an image file
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      event.target.value = "";
      return;
    }

    // Check size limit
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(2);
      alert(`Image is too large (${mb} MB). Max size is 10 MB.`);
      event.target.value = "";
      return;
    }

    // Create a temporary preview URL for optimistic UI
    const tempPreviewUrl = URL.createObjectURL(file);

    // Create placeholder entry immediately for optimistic UI
    const placeholder = createPlaceholderEntry(
      "text",
      { type: "photo", previewUrl: tempPreviewUrl },
      "Preparing photo...",
    );
    onNewEntry(placeholder);

    try {
      setIsSubmitting(true);

      // Update progress: Compressing
      onUpdateEntry?.(placeholder.id, {
        uploadProgress: 20,
        uploadMessage: "Optimizing photo...",
      });

      // Adaptive compression only if above threshold
      const compressed = await getCompressedDataUrl(file);

      // Update progress: Uploading
      onUpdateEntry?.(placeholder.id, {
        uploadProgress: 60,
        uploadMessage: "Uploading...",
      });

      try {
        const entry = await createEntry(spaceId, "text", `PHOTO:${compressed}`);

        // Replace placeholder with real entry
        onReplaceEntry?.(placeholder.id, entry);

        // Clean up temp URL
        URL.revokeObjectURL(tempPreviewUrl);
      } catch (error: any) {
        /* console.error("Failed to save photo:", error); */
        // Update placeholder to show error
        onUpdateEntry?.(placeholder.id, {
          isLoading: false,
          uploadMessage: "Upload failed. Please try again.",
        });
        // Remove after a delay so user can see the error
        setTimeout(() => onRemoveEntry?.(placeholder.id), 3000);
      } finally {
        setIsSubmitting(false);
      }
    } catch (error) {
      /* console.error("Failed to process image:", error); */
      onUpdateEntry?.(placeholder.id, {
        isLoading: false,
        uploadMessage: "Failed to process image",
      });
      setTimeout(() => onRemoveEntry?.(placeholder.id), 3000);
      setIsSubmitting(false);
    }

    // Reset the input
    event.target.value = "";
  };

  const handleMultiplePhotos = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (isSubmitting) {
      return;
    }
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const filesArr = Array.from(files);
    const nonImages = filesArr.filter((f) => !f.type.startsWith("image/"));
    const oversize = filesArr.filter(
      (f) => f.type.startsWith("image/") && f.size > MAX_IMAGE_SIZE_BYTES,
    );
    const imageFiles = filesArr.filter(
      (f) => f.type.startsWith("image/") && f.size <= MAX_IMAGE_SIZE_BYTES,
    );

    if (nonImages.length > 0 && oversize.length > 0) {
      alert(
        `${nonImages.length} non-image file(s) and ${oversize.length} over 10 MB were skipped`,
      );
    } else if (nonImages.length > 0) {
      alert(`${nonImages.length} non-image file(s) were skipped`);
    } else if (oversize.length > 0) {
      alert(`${oversize.length} image(s) over 10 MB were skipped`);
    }

    if (imageFiles.length === 0) {
      alert("No valid images under 10 MB were selected");
      event.target.value = "";
      return;
    }

    const signature = imageFiles.map((f) => `${f.name}:${f.size}`).join("|");
    if (signature === lastUploadSignatureRef.current) {
      // Prevent duplicate processing of same file selection
      event.target.value = "";
      return;
    }
    lastUploadSignatureRef.current = signature;

    // Create temporary preview URLs for optimistic UI
    const previewUrls = imageFiles.map((f) => URL.createObjectURL(f));

    // Create placeholder entry immediately for optimistic UI
    const placeholder = createPlaceholderEntry(
      "text",
      { type: "photos", previewUrls, count: imageFiles.length },
      `Preparing ${imageFiles.length} photo${
        imageFiles.length > 1 ? "s" : ""
      }...`,
    );
    onNewEntry(placeholder);

    setIsSubmitting(true);

    try {
      // Update progress: Compressing
      onUpdateEntry?.(placeholder.id, {
        uploadProgress: 10,
        uploadMessage: `Optimizing ${imageFiles.length} photo${
          imageFiles.length > 1 ? "s" : ""
        }...`,
      });

      // Compress each image sequentially to update progress
      const successes: string[] = [];
      let failedCount = 0;
      for (let i = 0; i < imageFiles.length; i++) {
        const f = imageFiles[i];
        try {
          const dataUrl = await getCompressedDataUrl(f);
          successes.push(dataUrl);
        } catch (e) {
          failedCount++;
        }
        // Update progress based on compression
        const progress = 10 + Math.round(((i + 1) / imageFiles.length) * 50);
        onUpdateEntry?.(placeholder.id, {
          uploadProgress: progress,
          uploadMessage: `Optimizing ${i + 1}/${imageFiles.length}...`,
        });
      }

      if (failedCount > 0) {
        onUpdateEntry?.(placeholder.id, {
          uploadMessage: `${failedCount} image(s) failed to process`,
        });
      }

      if (successes.length === 0) {
        onUpdateEntry?.(placeholder.id, {
          isLoading: false,
          uploadMessage:
            "No images could be processed. Try smaller or different images.",
        });
        setTimeout(() => onRemoveEntry?.(placeholder.id), 3000);
        // Clean up preview URLs
        previewUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      // Chunking logic to avoid oversized server action payloads
      const MAX_GROUP_CHARS = 3.2 * 1024 * 1024; // ~3.2MB headroom for JSON overhead to safely be below 5MB Next.js limit
      const groups: string[][] = [];
      let current: string[] = [];
      let currentLen = 0;

      for (const img of successes) {
        const imgLen = img.length;
        if (current.length > 0 && currentLen + imgLen > MAX_GROUP_CHARS) {
          groups.push(current);
          current = [];
          currentLen = 0;
        }
        current.push(img);
        currentLen += imgLen;
      }
      if (current.length > 0) groups.push(current);

      onUpdateEntry?.(placeholder.id, {
        uploadProgress: 70,
        uploadMessage: `Uploading...`,
      });

      let createdCount = 0;
      let firstEntry: Entry | null = null;

      for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi];
        try {
          let entry;
          if (group.length === 1) {
            entry = await createEntry(spaceId, "text", `PHOTO:${group[0]}`);
          } else {
            entry = await createEntry(
              spaceId,
              "text",
              `PHOTOS:${JSON.stringify(group)}`,
            );
          }

          if (gi === 0) {
            // Replace placeholder with the first real entry
            firstEntry = entry;
            onReplaceEntry?.(placeholder.id, entry);
          } else {
            // Additional entries get added normally
            onNewEntry(entry);
          }
          createdCount += group.length;

          const progress = 70 + Math.round(((gi + 1) / groups.length) * 30);
          if (gi === 0 && firstEntry) {
            // Update the newly replaced entry (it's no longer loading)
          }
        } catch (groupErr: any) {
          /* console.error("Group upload failed", groupErr); */
        }
      }

      // Clean up preview URLs
      previewUrls.forEach((url) => URL.revokeObjectURL(url));

      // If no entries were created, remove the placeholder
      if (createdCount === 0) {
        onRemoveEntry?.(placeholder.id);
      }
    } catch (error) {
      /* console.error("Failed to process photos:", error); */
      onUpdateEntry?.(placeholder.id, {
        isLoading: false,
        uploadMessage: "We couldn't process your images. Please try again.",
      });
      setTimeout(() => onRemoveEntry?.(placeholder.id), 3000);
    } finally {
      setIsSubmitting(false);
      // Reset the file input
      if (multiFileInputRef.current) {
        multiFileInputRef.current.value = "";
      }
    }
  };

  const removePendingFile = (id: string) => {
    setPendingFiles((prev) => {
      const file = prev.find((p) => p.id === id);
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const retryFile = (id: string) => {
    setPendingFiles((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: "pending", progress: 0 } : p,
      ),
    );
  };

  const handleFileUpload = async () => {
    if (
      pendingFiles.length === 0 ||
      hasOversizeFile ||
      overCombinedLimit ||
      fileUploading
    )
      return;

    // Create placeholder entry immediately for optimistic UI
    // For placeholder, use local preview URLs if available
    const itemsForMeta = pendingFiles.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
      url: f.previewUrl || "", // Use local preview for placeholder
    }));

    const placeholder = createPlaceholderEntry(
      "file",
      {
        type: "files",
        items: itemsForMeta,
      },
      `Uploading ${pendingFiles.length} file${
        pendingFiles.length > 1 ? "s" : ""
      }...`,
    );
    onNewEntry(placeholder);

    // Close modal immediately for better UX
    setFileModalOpen(false);
    const filesToUpload = [...pendingFiles];
    // Don't clear pendingFiles yet? actually we do, but we need to revoke URLs later
    // We can't revoke immediately if we use them for placeholder...
    // But placeholder renders in EntryCard, which can handle blob URLs (if passed through).
    // However, we are clearing pendingFiles state.
    setPendingFiles([]);

    try {
      setFileUploading(true);

      const uploaded: {
        name: string;
        size: number;
        type: string;
        url: string;
      }[] = [];
      const failedIds: string[] = [];

      for (let i = 0; i < filesToUpload.length; i++) {
        const pf = filesToUpload[i];
        try {
          const progress = Math.round((i / filesToUpload.length) * 80) + 10;
          onUpdateEntry?.(placeholder.id, {
            uploadProgress: progress,
            uploadMessage: `Uploading ${pf.name}... (${i + 1}/${
              filesToUpload.length
            })`,
          });

          const res = await uploadSingleFile(pf);
          uploaded.push(res);
        } catch (e) {
          /* console.error("Unexpected upload failure", e); */
          failedIds.push(pf.id);
        }
      }

      if (uploaded.length > 0) {
        const meta = { type: "files", items: uploaded } as const;
        const entry = await createEntry(spaceId, "file", "FILE_ENTRY", meta);

        // Replace placeholder with real entry
        onReplaceEntry?.(placeholder.id, entry);

        if (failedIds.length > 0) {
          toast.message(
            `${uploaded.length} file(s) uploaded, ${failedIds.length} failed`,
          );
        }
      } else {
        // All failed - show error on placeholder then remove
        onUpdateEntry?.(placeholder.id, {
          isLoading: false,
          uploadMessage: "All uploads failed. Please try again.",
        });
        setTimeout(() => onRemoveEntry?.(placeholder.id), 3000);
      }
    } catch (error) {
      /* console.error("File upload error:", error); */
      onUpdateEntry?.(placeholder.id, {
        isLoading: false,
        uploadMessage: "Upload failed. Please try again.",
      });
      setTimeout(() => onRemoveEntry?.(placeholder.id), 3000);
    } finally {
      setFileUploading(false);
      // Clean up object URLs
      filesToUpload.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    }
  };

  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") {
      e.preventDefault();
      handleFileUpload();
    }
  };

  // Shared upload/compression dialog UI
  const uploadDialog = (
    <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
      <DialogContent className="sm:max-w-md overflow-hidden border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl shadow-black/20 dark:shadow-black/50">
        <DialogHeader className="sr-only">
          <DialogTitle>
            {uploadStage === "Compressing" && "Preparing images"}
            {uploadStage === "Uploading" && "Uploading"}
            {uploadStage === "Done" && "All set"}
            {uploadStage === "Error" && "Something went wrong"}
          </DialogTitle>
          <DialogDescription>
            {uploadStage === "Compressing" && "Optimizing your images"}
            {uploadStage === "Uploading" && "Sending to your space"}
            {uploadStage === "Done" && "Upload complete"}
            {uploadStage === "Error" && "Please try again"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5 py-6 px-2">
          {/* Animated icon */}
          <div className="relative flex items-center justify-center">
            {uploadStage === "Compressing" && (
              <div className="relative">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-orange-500/10 to-amber-500/10 dark:from-orange-500/20 dark:to-amber-500/20 flex items-center justify-center border border-orange-500/10 dark:border-orange-500/20">
                  <svg
                    className="h-7 w-7 text-orange-500 dark:text-orange-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                {/* Pulsing rings */}
                <div className="absolute inset-0 rounded-2xl border border-orange-500/20 dark:border-orange-400/30 animate-ping" style={{ animationDuration: '2s' }} />
                <div className="absolute -inset-2 rounded-3xl border border-orange-500/10 dark:border-orange-400/15 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }} />
              </div>
            )}
            {uploadStage === "Uploading" && (
              <div className="relative">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/10 to-blue-500/10 dark:from-primary/20 dark:to-blue-500/20 flex items-center justify-center border border-primary/10 dark:border-primary/20">
                  <Upload className="h-7 w-7 text-primary" />
                </div>
                {/* Orbiting dot */}
                <div className="absolute inset-[-8px] animate-spin" style={{ animationDuration: '2s' }}>
                  <div className="h-2.5 w-2.5 rounded-full bg-primary shadow-lg shadow-primary/50 absolute top-0 left-1/2 -translate-x-1/2" />
                </div>
                {/* Subtle glow */}
                <div className="absolute inset-0 rounded-2xl bg-primary/5 dark:bg-primary/10 animate-pulse" />
              </div>
            )}
            {uploadStage === "Done" && (
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-green-500/10 dark:from-emerald-500/20 dark:to-green-500/20 flex items-center justify-center border border-emerald-500/10 dark:border-emerald-500/20">
                <svg
                  className="h-8 w-8 text-emerald-500 dark:text-emerald-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    strokeDasharray: 30,
                    strokeDashoffset: 0,
                    animation: 'checkmark-draw 0.4s ease-out',
                  }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
            {uploadStage === "Error" && (
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-red-500/10 to-rose-500/10 dark:from-red-500/20 dark:to-rose-500/20 flex items-center justify-center border border-red-500/10 dark:border-red-500/20">
                <X className="h-8 w-8 text-red-500 dark:text-red-400" />
              </div>
            )}
            {uploadStage === "Preparing" && (
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center border border-border/50 animate-pulse">
                <Upload className="h-7 w-7 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Title + description */}
          <div className="text-center space-y-1.5">
            <h3 className="text-base font-semibold text-foreground">
              {uploadStage === "Compressing" && "Preparing images"}
              {uploadStage === "Uploading" && "Uploading"}
              {uploadStage === "Done" && "All set!"}
              {uploadStage === "Error" && "Something went wrong"}
              {uploadStage === "Preparing" && "Getting ready..."}
            </h3>
            <p className="text-sm text-muted-foreground">
              {uploadStage === "Compressing" &&
                (uploadTotal > 1
                  ? "Optimizing your images before upload"
                  : "Optimizing your photo before upload")}
              {uploadStage === "Uploading" && "Sending to your space..."}
              {uploadStage === "Done" && "Upload complete"}
              {uploadStage === "Error" &&
                "Please try again or choose smaller images"}
              {uploadStage === "Preparing" && "Preparing your files..."}
            </p>
          </div>

          {/* Progress section */}
          <div className="w-full space-y-2.5 px-2">
            {/* Counter */}
            {uploadTotal > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {uploadStage === "Compressing" && (
                    <>
                      {uploadProcessed} of {uploadTotal} processed
                    </>
                  )}
                  {uploadStage !== "Compressing" && uploadTotal > 0 && (
                    <>
                      {uploadTotal} {uploadTotal === 1 ? "item" : "items"}
                    </>
                  )}
                </span>
                {uploadStage === "Compressing" && uploadTotal > 0 && (
                  <span className="font-medium tabular-nums">
                    {Math.round((uploadProcessed / uploadTotal) * 100)}%
                  </span>
                )}
              </div>
            )}

            {/* Progress bar */}
            <div className="relative h-1.5 w-full rounded-full bg-muted/80 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500 ease-out",
                  uploadStage === "Error"
                    ? "bg-gradient-to-r from-red-500 to-rose-500"
                    : uploadStage === "Done"
                      ? "bg-gradient-to-r from-emerald-500 to-green-500"
                      : "bg-gradient-to-r from-primary via-primary to-orange-500",
                )}
                style={{
                  width:
                    uploadStage === "Compressing" && uploadTotal > 0
                      ? `${Math.round((uploadProcessed / uploadTotal) * 100)}%`
                      : uploadStage === "Uploading"
                        ? "100%"
                        : uploadStage === "Done"
                          ? "100%"
                          : uploadStage === "Error"
                            ? "100%"
                            : "0%",
                }}
              />
              {/* Shimmer effect on active upload */}
              {(uploadStage === "Uploading" || uploadStage === "Compressing") && (
                <div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                  style={{
                    animation: 'shimmer 1.5s ease-in-out infinite',
                  }}
                />
              )}
            </div>

            {uploadMessage && (
              <div className="text-xs text-muted-foreground/80 text-center">
                {uploadMessage}
              </div>
            )}
          </div>
        </div>

        {/* Inject keyframes */}
        <style>{`
          @keyframes checkmark-draw {
            from { stroke-dashoffset: 30; }
            to { stroke-dashoffset: 0; }
          }
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );

  const processPastedFiles = (files: File[]) => {
    const items = files.map((f, i) => {
      let previewUrl = undefined;
      if (f.type.startsWith("image/")) {
        previewUrl = URL.createObjectURL(f);
      }
      return {
        id: `${Date.now()}-${i}-${f.name || "image.png"}`,
        file: f,
        name:
          f.name ||
          `pasted-image-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.png`,
        size: f.size,
        type: f.type || "application/octet-stream",
        progress: 0,
        status: "pending" as const,
        previewUrl,
      };
    });
    setPendingFiles((prev) => [...prev, ...items]);
    setFileModalOpen(true);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      processPastedFiles(Array.from(e.clipboardData.files));
    }
  };

  // Global paste handler for when input is not focused
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Skip if event target is our textarea (already handled by onPaste)
      if (e.target === textareaRef.current) return;

      // Skip if target is another input/textarea/contentEditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.clipboardData && e.clipboardData.files.length > 0) {
        e.preventDefault();
        processPastedFiles(Array.from(e.clipboardData.files));
      }
    };

    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, []);

  // Check for auto-uploaded files from homepage drag/drop
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      (window as any).__pending_dragged_files
    ) {
      const files = (window as any).__pending_dragged_files;
      // Clear immediately to prevent double-execution
      (window as any).__pending_dragged_files = undefined;

      // Queue these files for upload in the file modal
      handleGenericFilesSelected(files);
    }
  }, []);

  // ---- Drag and Drop handlers ----
  const handleDragEnter = useCallback((e: React.DragEvent | DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.types?.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent | DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent | DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent | DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleGenericFilesSelected(files);
    }
  }, []);

  // Global drag/drop listener for the compact (non-centered) composer
  // so users can drag files anywhere on the page
  useEffect(() => {
    if (centered) return; // Centered composer handles it within its own div

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      if (e.dataTransfer?.types?.includes("Files")) {
        setIsDragging(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDragging(false);
      }
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleGenericFilesSelected(files);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [centered]);

  // Drag overlay component — rendered via portal so it escapes any
  // stacking-context created by the fixed bottom bar's backdrop-blur.
  const dragOverlay = isDragging
    ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm transition-all duration-200"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-4 p-10 rounded-3xl border-2 border-dashed border-primary/50 bg-primary/5 dark:bg-primary/10 shadow-2xl shadow-primary/10 animate-in fade-in zoom-in-95 duration-200">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">
                Drop files here
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Release to upload any file
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  if (centered) {
    // Large centered composer for first post - Enhanced Design
    return (
      <div
        className="w-full max-w-4xl mx-auto relative"
        ref={composerRef}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Welcome Message */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-3">
            Welcome to your space
          </h2>
          <p className="text-muted-foreground">
            Start by sharing a thought, creating a note, or adding media
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 relative">
          <div className="relative group">
            {/* Outer glowing border from user design - adjusted with dynamic gradients for light/dark mode */}
            <div className="pointer-events-none absolute -inset-px rounded-[28px] bg-gradient-to-r from-black/5 via-[#ff5a00]/30 to-black/5 dark:from-white/15 dark:via-[#ff5a00]/45 dark:to-white/10 opacity-70 blur-[1px]" />

            {/* Inset Main Input Area with exact ComposerBox styling - dynamic backgrounds and shadows */}
            <div className="relative overflow-hidden rounded-[28px] border border-black/10 dark:border-white/12 bg-white/95 dark:bg-[#0b0b0b]/80 backdrop-blur-xl transition-all duration-300">
              {/* Radial gradient background splashes adjusted dynamically for light and dark modes */}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(255,90,0,0.12),transparent_45%),radial-gradient(circle_at_70%_0%,rgba(255,90,0,0.08),transparent_34%),radial-gradient(circle_at_100%_100%,rgba(255,90,0,0.06),transparent_30%)] dark:bg-[radial-gradient(circle_at_0%_0%,rgba(255,90,0,0.22),transparent_45%),radial-gradient(circle_at_70%_0%,rgba(255,90,0,0.18),transparent_34%),radial-gradient(circle_at_100%_100%,rgba(255,90,0,0.12),transparent_30%)]" />

              {/* Top-left corner glowing SVG accents - matching the rounded-[28px] curve perfectly */}
              <svg
                className="absolute top-0 left-0 w-48 h-48 pointer-events-none z-10"
                viewBox="0 0 192 192"
                fill="none"
              >
                <path
                  d="M 1,192 L 1,29 A 28,28 0 0,1 29,1 L 192,1"
                  stroke="url(#orange-glow-curve)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient
                    id="orange-glow-curve"
                    x1="0"
                    y1="0"
                    x2="192"
                    y2="192"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor="#f97316" stopOpacity="0.6" />
                    <stop offset="50%" stopColor="#f59e0b" stopOpacity="0" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute top-0 left-0 w-16 h-16 bg-orange-500/5 dark:bg-orange-500/10 blur-xl rounded-full pointer-events-none z-10" />

              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="What's on your mind?"
                className="relative z-10 min-h-[180px] w-full resize-none border-0 bg-transparent px-8 pt-7 pb-2 text-xl text-neutral-900 dark:text-white outline-none placeholder:text-neutral-500/50 dark:placeholder:text-white/35 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none sm:px-10 sm:pt-8"
                disabled={isSubmitting}
              />

              {/* Bottom toolbar inside input box */}
              <div className="relative z-10 flex items-center justify-between px-5 pb-4 pt-1 sm:px-7">
                {/* Left: Add Content */}
                <DropdownMenu
                  open={dropdownOpen}
                  onOpenChange={setDropdownOpen}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="rounded-full shadow-none"
                      aria-label="Add content"
                    >
                      <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="pb-2"
                    side="top"
                    align="start"
                    sideOffset={8}
                  >
                    <DropdownMenuLabel>Add content</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={handleNewNote}>
                      <div
                        className="flex size-8 items-center justify-center rounded-lg border border-blue-500/10 dark:border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        aria-hidden="true"
                      >
                        <FileText size={16} strokeWidth={2} />
                      </div>
                      <div>
                        <div className="text-sm font-medium">
                          Rich Text Note
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Create formatted document
                        </div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={handleFileUploadClick}>
                      <div
                        className="flex size-8 items-center justify-center rounded-lg border border-amber-500/10 dark:border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        aria-hidden="true"
                      >
                        <FileUp size={16} strokeWidth={2} />
                      </div>
                      <div>
                        <div className="text-sm font-medium">File Upload</div>
                        <div className="text-xs text-muted-foreground">
                          Share documents & files
                        </div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={handlePhoto}>
                      <div
                        className="flex size-8 items-center justify-center rounded-lg border border-emerald-500/10 dark:border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        aria-hidden="true"
                      >
                        <Camera size={16} strokeWidth={2} />
                      </div>
                      <div>
                        <div className="text-sm font-medium">Photo</div>
                        <div className="text-xs text-muted-foreground">
                          Capture photo instantly
                        </div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={handleImages}>
                      <div
                        className="flex size-8 items-center justify-center rounded-lg border border-indigo-500/10 dark:border-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                        aria-hidden="true"
                      >
                        <ImageIcon size={16} strokeWidth={2} />
                      </div>
                      <div>
                        <div className="text-sm font-medium">Images</div>
                        <div className="text-xs text-muted-foreground">
                          Select multiple photos
                        </div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={handleDrawing}>
                      <div
                        className="flex size-8 items-center justify-center rounded-lg border border-purple-500/10 dark:border-purple-500/20 bg-purple-500/5 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400"
                        aria-hidden="true"
                      >
                        <Paintbrush size={16} strokeWidth={2} />
                      </div>
                      <div>
                        <div className="text-sm font-medium">Drawing</div>
                        <div className="text-xs text-muted-foreground">
                          Create on digital canvas
                        </div>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Right: Send Button + Spark */}
                <div className="flex items-center gap-2">
                  <div className="pointer-events-none text-[#ff7a1a] opacity-70">
                    <SparkIcon />
                  </div>
                  {text.trim() && (
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      size="sm"
                      className="h-9 px-5 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-black/20 dark:shadow-black/40 hover:shadow-xl transition-all duration-200 font-medium"
                    >
                      {isSubmitting ? (
                        <div className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1.5" />
                      ) : (
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {isSubmitting ? "Posting..." : "Post"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>          {/* Shortcut Badges */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-8 px-2 max-w-full">
            {/* Create Note Badge */}
            <button
              onClick={handleNewNote}
              type="button"
              className="group relative flex items-center gap-2.5 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 bg-blue-500/[0.04] dark:bg-blue-500/[0.02] hover:bg-blue-600 dark:hover:bg-blue-500 text-blue-600 hover:text-white dark:text-blue-400 dark:hover:text-white border border-blue-500/25 dark:border-blue-500/15 shadow-sm hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:-translate-y-0.5 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="relative flex items-center gap-2.5">
                <div className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-blue-500/10 group-hover:bg-white/20 text-blue-500 group-hover:text-white dark:text-blue-400 dark:group-hover:text-white transition-colors duration-300">
                  <FileText className="h-3.5 w-3.5 group-hover:scale-110 transition-transform duration-300" />
                </div>
                <span className="whitespace-nowrap">Create note</span>
              </div>
            </button>

            {/* Photo Badge */}
            <button
              onClick={handlePhoto}
              type="button"
              className="group relative flex items-center gap-2.5 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.02] hover:bg-emerald-600 dark:hover:bg-emerald-500 text-emerald-600 hover:text-white dark:text-emerald-400 dark:hover:text-white border border-emerald-500/25 dark:border-emerald-500/15 shadow-sm hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="relative flex items-center gap-2.5">
                <div className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-emerald-500/10 group-hover:bg-white/20 text-emerald-500 group-hover:text-white dark:text-emerald-400 dark:group-hover:text-white transition-colors duration-300">
                  <Camera className="h-3.5 w-3.5 group-hover:scale-110 transition-transform duration-300" />
                </div>
                <span className="whitespace-nowrap">Photo</span>
              </div>
            </button>

            {/* Images Badge */}
            <button
              onClick={handleImages}
              type="button"
              className="group relative flex items-center gap-2.5 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 bg-indigo-500/[0.04] dark:bg-indigo-500/[0.02] hover:bg-indigo-600 dark:hover:bg-indigo-500 text-indigo-600 hover:text-white dark:text-indigo-400 dark:hover:text-white border border-indigo-500/25 dark:border-indigo-500/15 shadow-sm hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:-translate-y-0.5 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-violet-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="relative flex items-center gap-2.5">
                <div className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-indigo-500/10 group-hover:bg-white/20 text-indigo-500 group-hover:text-white dark:text-indigo-400 dark:group-hover:text-white transition-colors duration-300">
                  <ImageIcon className="h-3.5 w-3.5 group-hover:scale-110 transition-transform duration-300" />
                </div>
                <span className="whitespace-nowrap">Images</span>
              </div>
            </button>

            {/* Draw Badge */}
            <button
              onClick={handleDrawing}
              type="button"
              className="group relative flex items-center gap-2.5 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 bg-purple-500/[0.04] dark:bg-purple-500/[0.02] hover:bg-purple-600 dark:hover:bg-purple-500 text-purple-600 hover:text-white dark:text-purple-400 dark:hover:text-white border border-purple-500/25 dark:border-purple-500/15 shadow-sm hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:-translate-y-0.5 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="relative flex items-center gap-2.5">
                <div className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-purple-500/10 group-hover:bg-white/20 text-purple-500 group-hover:text-white dark:text-purple-400 dark:group-hover:text-white transition-colors duration-300">
                  <Paintbrush className="h-3.5 w-3.5 group-hover:scale-110 transition-transform duration-300" />
                </div>
                <span className="whitespace-nowrap">Draw</span>
              </div>
            </button>
          </div>

          {/* Force HMR update */}
          <DynamicDrawingCanvas
            isOpen={drawingOpen}
            onClose={() => setDrawingOpen(false)}
            onSave={handleDrawingSave}
          />

          {/* Hidden inputs for centered composer (camera + multi images) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageCapture}
            className="hidden"
          />
          <input
            ref={multiFileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleMultiplePhotos}
            className="hidden"
          />
          {/* Hidden input for any files */}
          <input
            ref={anyFileInputRef}
            type="file"
            multiple
            onChange={(e) => handleGenericFilesSelected(e.target.files)}
            className="hidden"
          />
          {uploadDialog}
          {/* File upload modal */}
          <Dialog open={fileModalOpen} onOpenChange={setFileModalOpen}>
            <DialogContent
              className="sm:max-w-lg w-full max-h-[85vh] overflow-hidden"
              onKeyDown={handleModalKeyDown}
            >
              <DialogHeader>
                <DialogTitle>Upload files</DialogTitle>
                <DialogDescription>
                  Max 100MB per file and combined per upload.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 min-h-0">
                {pendingFiles.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No files selected.
                  </div>
                ) : (
                  <div className="flex-1 min-h-[96px] max-h-[50vh] overflow-auto divide-y rounded-md border">
                    {pendingFiles.map((pf) => (
                      <div
                        key={pf.id}
                        className="flex items-center justify-between p-2"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Image preview or file icon */}
                          <div
                            className={cn(
                              "relative h-10 w-10 flex-shrink-0 bg-muted rounded overflow-hidden border",
                              pf.file.type.startsWith("image/") &&
                                pf.previewUrl &&
                                "cursor-zoom-in hover:opacity-90 transition-opacity",
                            )}
                            onClick={() => {
                              if (
                                pf.file.type.startsWith("image/") &&
                                pf.previewUrl
                              ) {
                                handlePreview(pf.previewUrl);
                              }
                            }}
                          >
                            {pf.file.type.startsWith("image/") &&
                            pf.previewUrl ? (
                              <NextImage
                                src={pf.previewUrl}
                                alt="Preview"
                                fill
                                unoptimized
                                className="object-cover"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                <span className="text-xs uppercase font-bold">
                                  {pf.name.split(".").pop()?.slice(0, 3) ||
                                    "FILE"}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div
                              className="text-sm font-medium truncate max-w-[180px] sm:max-w-[300px]"
                              title={pf.name}
                            >
                              {pf.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatBytes(pf.size)} • {pf.type || "file"}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pl-2">
                          {pf.status !== "pending" && (
                            <div className="text-xs text-muted-foreground w-12 text-right">
                              {pf.progress}%
                            </div>
                          )}
                          {pf.status === "error" && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-7 px-2"
                              onClick={() => retryFile(pf.id)}
                            >
                              Retry
                            </Button>
                          )}
                          <button
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent disabled:opacity-50"
                            onClick={() => removePendingFile(pf.id)}
                            title="Remove"
                            disabled={fileUploading}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-sm flex items-center justify-between">
                  <div
                    className={
                      hasOversizeFile ? "text-red-600" : "text-muted-foreground"
                    }
                  >
                    Combined: {formatBytes(totalFileSize)} / {combinedCapLabel}{" "}
                    MB
                  </div>
                  {overCombinedLimit && (
                    <div className="text-red-600">Over combined limit</div>
                  )}
                </div>

                {hasOversizeFile && (
                  <div className="text-xs text-red-600">
                    One or more files exceed 100MB.
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setFileModalOpen(false);
                      pendingFiles.forEach((f) => {
                        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                      });
                      setPendingFiles([]);
                    }}
                    disabled={fileUploading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleFileUpload}
                    disabled={
                      fileUploading ||
                      pendingFiles.length === 0 ||
                      hasOversizeFile ||
                      overCombinedLimit
                    }
                  >
                    {fileUploading ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Drag and drop overlay (portal-based, full viewport) */}
          {dragOverlay}
        </form>
      </div>
    );
  }

  // Compact bottom composer with dynamic border radius
  const isExpanded = text.includes("\n") || text.length > 50;

  return (
    <>
      {/* Global drag overlay for compact composer */}
      {dragOverlay}

      <div
        ref={composerRef}
        className="w-full flex flex-col gap-1.5 bg-white/90 dark:bg-zinc-950/90 border border-zinc-200/85 dark:border-zinc-800/80 px-3.5 py-2.5 shadow-xl shadow-black/5 rounded-[24px] backdrop-blur-xl transition-all duration-300 hover:shadow-2xl hover:shadow-black/10 hover:border-zinc-300 dark:hover:border-zinc-700/80 group"
      >
        {/* Top: Input area */}
        <div className="flex-1 min-w-0 relative">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Write something..."
            className="w-full min-h-[36px] max-h-36 resize-none border-0 bg-transparent px-1 py-0.5 text-[15px] placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none caret-orange-500 text-zinc-850 dark:text-zinc-100 font-normal leading-relaxed"
            disabled={isSubmitting}
            rows={1}
            style={{
              height: "auto",
              minHeight: "36px",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 144) + "px";
            }}
          />
        </div>

        {/* Bottom row: Actions & Buttons */}
        <div className="flex items-center justify-between">
          {/* Left: Plus button */}
          <div className="flex-shrink-0">
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-[12px] border border-zinc-200/80 dark:border-zinc-850 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-450 dark:text-zinc-500 hover:text-zinc-650 dark:hover:text-zinc-350 transition-all duration-200"
                  aria-label="Add content"
                >
                  <Plus size={18} strokeWidth={1.8} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="pb-2"
                side="top"
                align="start"
                sideOffset={12}
              >
                <DropdownMenuLabel>Add content</DropdownMenuLabel>
                <DropdownMenuItem onSelect={handleNewNote}>
                  <div
                    className="flex size-8 items-center justify-center rounded-lg border border-blue-500/10 dark:border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    aria-hidden="true"
                  >
                    <FileText size={16} strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Rich Text Note</div>
                    <div className="text-xs text-muted-foreground">
                      Create formatted document
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleFileUploadClick}>
                  <div
                    className="flex size-8 items-center justify-center rounded-lg border border-amber-500/10 dark:border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    aria-hidden="true"
                  >
                    <FileUp size={16} strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-sm font-medium">File Upload</div>
                    <div className="text-xs text-muted-foreground">
                      Share documents & files
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handlePhoto}>
                  <div
                    className="flex size-8 items-center justify-center rounded-lg border border-emerald-500/10 dark:border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  >
                    <Camera size={16} strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Photo</div>
                    <div className="text-xs text-muted-foreground">
                      Capture photo instantly
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleImages}>
                  <div
                    className="flex size-8 items-center justify-center rounded-lg border border-indigo-500/10 dark:border-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                    aria-hidden="true"
                  >
                    <ImageIcon size={16} strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Images</div>
                    <div className="text-xs text-muted-foreground">
                      Select multiple photos
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleDrawing}>
                  <div
                    className="flex size-8 items-center justify-center rounded-lg border border-purple-500/10 dark:border-purple-500/20 bg-purple-500/5 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400"
                    aria-hidden="true"
                  >
                    <Paintbrush size={16} strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Drawing</div>
                    <div className="text-xs text-muted-foreground">
                      Create on digital canvas
                    </div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Right: Close and Send buttons */}
          <div className="flex items-center gap-3">
            {/* Close / Clear button */}
            {text.trim() && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8.5 w-8.5 rounded-full text-zinc-400 hover:text-zinc-650 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all duration-200"
                onClick={() => setText("")}
                aria-label="Clear text"
              >
                <X size={16} strokeWidth={1.8} />
              </Button>
            )}

            {/* Send button */}
            <Button
              type="submit"
              size="icon"
              disabled={!text.trim() || isSubmitting}
              className={`h-9 w-9 rounded-[12px] transition-all duration-300 flex items-center justify-center ${
                text.trim() && !isSubmitting
                  ? "cta-button-glow text-white border-none shadow-[0_4px_12px_rgba(255,90,0,0.2)] hover:scale-[1.04] active:scale-[0.96]"
                  : "bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200/50 dark:border-zinc-800/80 text-zinc-400 dark:text-zinc-600 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
              onClick={handleSubmit}
              aria-label="Send"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </Button>
          </div>
        </div>

        <DynamicDrawingCanvas
          isOpen={drawingOpen}
          onClose={() => setDrawingOpen(false)}
          onSave={handleDrawingSave}
        />

        {/* Hidden file input for camera/image capture */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageCapture}
          className="hidden"
        />

        {/* Hidden file input for multiple photos */}
        <input
          ref={multiFileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleMultiplePhotos}
          className="hidden"
        />
        {/* Hidden input for any files */}
        <input
          ref={anyFileInputRef}
          type="file"
          multiple
          onChange={(e) => handleGenericFilesSelected(e.target.files)}
          className="hidden"
        />
        {uploadDialog}
        {/* File upload modal for compact composer */}
        <Dialog
          open={fileModalOpen}
          onOpenChange={(open) => {
            setFileModalOpen(open);
            if (!open) {
              // Clean up URLs and clear selection when modal is dismissed
              pendingFiles.forEach((f) => {
                if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
              });
              setPendingFiles([]);
              if (anyFileInputRef.current) anyFileInputRef.current.value = "";
            }
          }}
        >
          <DialogContent
            className="sm:max-w-lg w-full max-h-[85vh] overflow-hidden"
            onKeyDown={handleModalKeyDown}
          >
            <DialogHeader>
              <DialogTitle>Upload files</DialogTitle>
              <DialogDescription>
                Max 100MB per file and combined per upload.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 min-h-0">
              {pendingFiles.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No files selected.
                </div>
              ) : (
                <div className="flex-1 min-h-[96px] max-h-[50vh] overflow-auto divide-y rounded-md border">
                  {pendingFiles.map((pf) => (
                    <div
                      key={pf.id}
                      className="flex items-center justify-between p-2"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Image preview or file icon */}
                        <div
                          className={cn(
                            "relative h-10 w-10 flex-shrink-0 bg-muted rounded overflow-hidden border",
                            pf.file.type.startsWith("image/") &&
                              pf.previewUrl &&
                              "cursor-zoom-in hover:opacity-90 transition-opacity",
                          )}
                          onClick={() => {
                            if (
                              pf.file.type.startsWith("image/") &&
                              pf.previewUrl
                            ) {
                              handlePreview(pf.previewUrl);
                            }
                          }}
                        >
                          {pf.file.type.startsWith("image/") &&
                          pf.previewUrl ? (
                            <NextImage
                              src={pf.previewUrl}
                              alt="Preview"
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                              <span className="text-xs uppercase font-bold">
                                {pf.name.split(".").pop()?.slice(0, 3) ||
                                  "FILE"}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm font-medium truncate max-w-[180px] sm:max-w-[300px]"
                            title={pf.name}
                          >
                            {pf.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatBytes(pf.size)} • {pf.type || "file"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {pf.status !== "pending" && (
                          <div className="text-xs text-muted-foreground w-12 text-right">
                            {pf.progress}%
                          </div>
                        )}
                        {pf.status === "error" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-7 px-2"
                            onClick={() => retryFile(pf.id)}
                          >
                            Retry
                          </Button>
                        )}
                        <button
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent disabled:opacity-50"
                          onClick={() => removePendingFile(pf.id)}
                          title="Remove"
                          disabled={fileUploading}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-sm flex items-center justify-between">
                <div
                  className={
                    hasOversizeFile ? "text-red-600" : "text-muted-foreground"
                  }
                >
                  Combined: {formatBytes(totalFileSize)} / {combinedCapLabel} MB
                </div>
                {overCombinedLimit && (
                  <div className="text-red-600">Over combined limit</div>
                )}
              </div>
              {hasOversizeFile && (
                <div className="text-xs text-red-600">
                  One or more files exceed 100MB.
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setFileModalOpen(false);
                    setPendingFiles([]);
                  }}
                  disabled={fileUploading}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleFileUpload}
                  disabled={
                    fileUploading ||
                    pendingFiles.length === 0 ||
                    hasOversizeFile ||
                    overCombinedLimit
                  }
                >
                  {fileUploading ? "Uploading..." : "Upload"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

function SparkIcon() {
  return (
    <svg
      className="h-7 w-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
    </svg>
  );
}
