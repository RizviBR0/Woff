"use client";

import { useState, useRef, useEffect } from "react";
import NextImage from "next/image";
import { Plus, Send, X, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { DrawingCanvas } from "./drawing-canvas";
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
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const anyFileInputRef = useRef<HTMLInputElement>(null);
  const lastUploadSignatureRef = useRef<string>("");
  const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per image

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewBg, setPreviewBg] = useState("bg-black/90");

  // Upload/compress modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadStage, setUploadStage] = useState<
    "Preparing" | "Compressing" | "Uploading" | "Done" | "Error"
  >("Preparing");
  const [uploadProcessed, setUploadProcessed] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadMessage, setUploadMessage] = useState<string>("");

  const analyzeImageBrightness = (dataUrl: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(false);
            return;
          }
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          let totalBrightness = 0;
          let pixelCount = 0;
          for (let i = 0; i < data.length; i += 40) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            if (a > 0) {
              const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
              totalBrightness += brightness;
              pixelCount++;
            }
          }
          const averageBrightness =
            pixelCount > 0 ? totalBrightness / pixelCount : 0;
          resolve(averageBrightness > 128);
        } catch (error) {
          resolve(false);
        }
      };
      img.onerror = () => resolve(false);
      img.src = dataUrl;
    });
  };

  const handlePreview = async (url: string) => {
    setPreviewUrl(url);
    setPreviewOpen(true);
    try {
      const isBright = await analyzeImageBrightness(url);
      setPreviewBg(isBright ? "bg-gray-800/95" : "bg-gray-100/95");
    } catch {
      setPreviewBg("bg-black/90");
    }
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

  const handleGenericFilesSelected = (files: FileList | null) => {
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
      console.error("Failed to create entry:", error);
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
    setPopoverOpen(false);
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
      console.error("Failed to save drawing:", error);
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
    setPopoverOpen(false);
    if (multiFileInputRef.current) {
      multiFileInputRef.current.click();
    }
  };

  const handlePhoto = () => {
    setPopoverOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileUploadClick = () => {
    setPopoverOpen(false);
    if (anyFileInputRef.current) {
      anyFileInputRef.current.value = "";
      anyFileInputRef.current.click();
    }
  };

  const handleNewNote = async () => {
    setPopoverOpen(false);

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
      console.error("Failed to create note entry:", error);
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
        console.error("Failed to save photo:", error);
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
      console.error("Failed to process image:", error);
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
      const MAX_GROUP_CHARS = 4.5 * 1024 * 1024; // ~4.5MB headroom for JSON overhead
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
          console.error("Group upload failed", groupErr);
        }
      }

      // Clean up preview URLs
      previewUrls.forEach((url) => URL.revokeObjectURL(url));

      // If no entries were created, remove the placeholder
      if (createdCount === 0) {
        onRemoveEntry?.(placeholder.id);
      }
    } catch (error) {
      console.error("Failed to process photos:", error);
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
          console.error("Unexpected upload failure", e);
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
      console.error("File upload error:", error);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {uploadStage === "Compressing" && "Preparing images"}
            {uploadStage === "Uploading" && "Uploading"}
            {uploadStage === "Done" && "All set"}
            {uploadStage === "Error" && "Something went wrong"}
          </DialogTitle>
          <DialogDescription>
            {uploadStage === "Compressing" &&
              (uploadTotal > 1
                ? "We are optimizing your images before upload."
                : "Optimizing your photo before upload.")}
            {uploadStage === "Uploading" && "Sending to your space..."}
            {uploadStage === "Done" && "Upload complete."}
            {uploadStage === "Error" &&
              "Please try again or choose smaller images."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {uploadTotal > 0 && (
              <span>
                {uploadStage === "Compressing" && (
                  <>
                    {uploadProcessed} / {uploadTotal} processed
                  </>
                )}
                {uploadStage !== "Compressing" && uploadTotal > 0 && (
                  <>
                    {uploadTotal} {uploadTotal === 1 ? "item" : "items"}
                  </>
                )}
              </span>
            )}
          </div>

          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-2 rounded-full transition-all",
                uploadStage === "Error"
                  ? "bg-red-500"
                  : uploadStage === "Done"
                    ? "bg-green-500"
                    : "bg-primary",
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
          </div>

          {uploadMessage && (
            <div className="text-xs text-muted-foreground">{uploadMessage}</div>
          )}
        </div>
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

  if (centered) {
    // Large centered composer for first post - Enhanced Design
    return (
      <div className="w-full max-w-3xl mx-auto">
        {/* Welcome Message */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-3">
            Welcome to your space
          </h2>
          <p className="text-muted-foreground">
            Start by sharing a thought, creating a note, or adding media
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative group">
            {/* Main Input Area */}
            <div className="relative overflow-hidden rounded-3xl border-2 border-border/60 dark:border-border/80 bg-background/80 dark:bg-background/95 backdrop-blur-sm shadow-lg shadow-black/10 dark:shadow-black/40 hover:shadow-xl hover:shadow-black/15 dark:hover:shadow-black/50 transition-all duration-300 group-focus-within:border-primary/50 group-focus-within:shadow-xl group-focus-within:shadow-black/15 dark:group-focus-within:shadow-black/50 ring-1 ring-inset ring-white/5 dark:ring-white/10">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="What's on your mind?"
                className="min-h-[140px] resize-none border-0 bg-transparent p-8 text-lg leading-relaxed placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
                disabled={isSubmitting}
              />

              {/* Gradient overlay for visual depth */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between mt-4 px-2">
              {/* Left: Add Content Options */}
              <div className="flex items-center gap-2">
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-10 px-4 rounded-full border border-border/60 dark:border-border/80 bg-background/90 dark:bg-background/95 hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 shadow-sm shadow-black/10 dark:shadow-black/30 hover:shadow-md hover:shadow-black/15 dark:hover:shadow-black/40"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add content
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-56 p-3 rounded-2xl border-2 shadow-xl shadow-black/10 dark:shadow-black/50"
                    side="top"
                    align="start"
                    sideOffset={8}
                    alignOffset={-8}
                    avoidCollisions={true}
                    collisionPadding={16}
                  >
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 pb-1">
                        Create
                      </div>
                      <button
                        onClick={handleNewNote}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-accent/80 transition-colors group"
                      >
                        <span className="text-lg">📝</span>
                        <div className="text-left">
                          <div className="font-medium">Rich Text Note</div>
                          <div className="text-xs text-muted-foreground">
                            Create a formatted document
                          </div>
                        </div>
                      </button>
                      <button
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-accent/80 transition-colors group"
                        onClick={handleFileUploadClick}
                      >
                        <span className="text-lg">📄</span>
                        <div className="text-left">
                          <div className="font-medium">File Upload</div>
                          <div className="text-xs text-muted-foreground">
                            Share documents & files
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={handlePhoto}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-accent/80 transition-colors group"
                      >
                        <span className="text-lg">📷</span>
                        <div className="text-left">
                          <div className="font-medium">Photo</div>
                          <div className="text-xs text-muted-foreground">
                            Capture photo instantly
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={handleImages}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-accent/80 transition-colors group"
                      >
                        <span className="text-lg">🖼️</span>
                        <div className="text-left">
                          <div className="font-medium">Images</div>
                          <div className="text-xs text-muted-foreground">
                            Select multiple or single images
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={handleDrawing}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-accent/80 transition-colors group"
                      >
                        <span className="text-lg">✏️</span>
                        <div className="text-left">
                          <div className="font-medium">Drawing</div>
                          <div className="text-xs text-muted-foreground">
                            Create with digital canvas
                          </div>
                        </div>
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Right: Send Button */}
              {text.trim() && (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-10 px-6 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-black/20 dark:shadow-black/40 hover:shadow-xl hover:shadow-black/25 dark:hover:shadow-black/50 transition-all duration-200 font-medium"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {isSubmitting ? "Posting..." : "Post"}
                </Button>
              )}
            </div>

            {/* Shortcut Badges */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mt-8 px-2 max-w-full">
              <button
                onClick={handleNewNote}
                className="group flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-medium bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 transition-all duration-200 border border-blue-200/60 dark:border-blue-800/60 hover:border-blue-300 dark:hover:border-blue-700 shadow-sm hover:shadow-lg hover:shadow-blue-500/20 hover:-translate-y-1 backdrop-blur-sm"
              >
                <span className="text-sm sm:text-base group-hover:scale-110 transition-transform duration-200">
                  📝
                </span>
                <span className="whitespace-nowrap">Create note</span>
              </button>
              <button
                onClick={handlePhoto}
                className="group flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-medium bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 transition-all duration-200 border border-green-200/60 dark:border-green-800/60 hover:border-green-300 dark:hover:border-green-700 shadow-sm hover:shadow-lg hover:shadow-green-500/20 hover:-translate-y-1 backdrop-blur-sm"
              >
                <span className="text-sm sm:text-base group-hover:scale-110 transition-transform duration-200">
                  📷
                </span>
                <span className="whitespace-nowrap">Photo</span>
              </button>
              <button
                onClick={handleImages}
                className="group flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-medium bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 transition-all duration-200 border border-blue-200/60 dark:border-blue-800/60 hover:border-blue-300 dark:hover:border-blue-700 shadow-sm hover:shadow-lg hover:shadow-blue-500/20 hover:-translate-y-1 backdrop-blur-sm"
              >
                <span className="text-sm sm:text-base group-hover:scale-110 transition-transform duration-200">
                  🖼️
                </span>
                <span className="whitespace-nowrap">Images</span>
              </button>
              <button
                onClick={handleDrawing}
                className="group flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-medium bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 transition-all duration-200 border border-purple-200/60 dark:border-purple-800/60 hover:border-purple-300 dark:hover:border-purple-700 shadow-sm hover:shadow-lg hover:shadow-purple-500/20 hover:-translate-y-1 backdrop-blur-sm"
              >
                <span className="text-sm sm:text-base group-hover:scale-110 transition-transform duration-200">
                  ✏️
                </span>
                <span className="whitespace-nowrap">Draw</span>
              </button>
            </div>
          </div>

          <DrawingCanvas
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

          {/* Full screen image preview modal */}
          {previewOpen && previewUrl && (
            <div
              className={`fixed inset-0 ${previewBg} z-[60] flex items-center justify-center transition-colors duration-300`}
              onClick={() => setPreviewOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setPreviewOpen(false);
              }}
              tabIndex={-1}
            >
              <div
                className="relative w-full h-full max-w-7xl max-h-full flex items-center justify-center px-2 sm:px-4 py-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative w-full h-full max-w-[95vw] max-h-[95vh] flex items-center justify-center">
                  <NextImage
                    src={previewUrl}
                    alt="Image - full view"
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 95vw, 90vw"
                    className="object-contain rounded-lg shadow-2xl"
                  />
                </div>
                {/* Control buttons */}
                <div className="fixed top-4 right-4 flex gap-3 z-50">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-10 w-10 md:h-11 md:w-11 rounded-full shadow-2xl border border-black/40 bg-black/80 text-white backdrop-blur-md hover:bg-black hover:scale-105 transition-all duration-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      const link = document.createElement("a");
                      link.href = previewUrl;
                      link.download = "preview.png";
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    title="Download image"
                  >
                    <Download className="h-6 w-6" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-10 w-10 md:h-11 md:w-11 rounded-full shadow-2xl border border-black/40 bg-black/80 text-white backdrop-blur-md hover:bg-black hover:scale-105 transition-all duration-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewOpen(false);
                    }}
                    title="Close (Esc)"
                  >
                    <X className="h-6 w-6" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    );
  }

  // Compact bottom composer with dynamic border radius
  const isExpanded = text.includes("\n") || text.length > 50;

  return (
    <div
      className={`flex items-start gap-3 bg-background/85 dark:bg-background/95 border-2 border-border/50 dark:border-border/80 px-3 py-2 shadow-lg shadow-black/10 dark:shadow-black/40 backdrop-blur-md transition-all duration-300 hover:shadow-xl hover:shadow-black/15 dark:hover:shadow-black/50 hover:border-primary/20 ring-1 ring-inset ring-white/5 dark:ring-white/10 ${
        isExpanded ? "rounded-2xl" : "rounded-full"
      }`}
    >
      {/* Plus button */}
      <div className="flex-shrink-0 pt-0.5">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary transition-all duration-200 border border-transparent hover:border-primary/20"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-52 p-2 rounded-2xl border-2 shadow-xl shadow-black/10 dark:shadow-black/50"
            side="top"
            align="start"
            sideOffset={8}
            alignOffset={-8}
            avoidCollisions={true}
            collisionPadding={16}
          >
            <div className="space-y-1">
              <button
                onClick={handleNewNote}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-accent/80 transition-colors group"
              >
                <span className="text-base">📝</span>
                <span className="font-medium">Rich Text Note</span>
              </button>
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-accent/80 transition-colors group"
                onClick={handleFileUploadClick}
              >
                <span className="text-base">📄</span>
                <span className="font-medium">File Upload</span>
              </button>
              <button
                onClick={handlePhoto}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-accent/80 transition-colors group"
              >
                <span className="text-base">📷</span>
                <span className="font-medium">Photo</span>
              </button>
              <button
                onClick={handleImages}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-accent/80 transition-colors group"
              >
                <span className="text-base">🖼️</span>
                <span className="font-medium">Images</span>
              </button>
              <button
                onClick={handleDrawing}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-accent/80 transition-colors group"
              >
                <span className="text-base">✏️</span>
                <span className="font-medium">Draw</span>
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Input area */}
      <div className="flex-1 min-w-0 relative">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Write something..."
          className="min-h-[32px] max-h-24 resize-none border-0 bg-transparent px-3 py-1.5 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
          disabled={isSubmitting}
          rows={1}
          style={{
            height: "auto",
            minHeight: "32px",
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = Math.min(target.scrollHeight, 96) + "px";
          }}
        />
      </div>

      {/* Send button */}
      {text.trim() && (
        <div className="flex-shrink-0 pt-0.5">
          <Button
            type="submit"
            size="icon"
            disabled={isSubmitting}
            className="h-7 w-7 rounded-full bg-primary hover:bg-primary/90 shadow-md shadow-black/20 dark:shadow-black/40 hover:shadow-lg hover:shadow-black/25 dark:hover:shadow-black/50 transition-all duration-200"
            onClick={handleSubmit}
          >
            <Send className="h-3 w-3" />
          </Button>
        </div>
      )}

      <DrawingCanvas
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
                        {pf.file.type.startsWith("image/") && pf.previewUrl ? (
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
                              {pf.name.split(".").pop()?.slice(0, 3) || "FILE"}
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

      {/* Full screen image preview modal */}
      {previewOpen && previewUrl && (
        <div
          className={`fixed inset-0 -top-[25px] ${previewBg} z-[60] flex items-center justify-center transition-colors duration-300`}
          onClick={() => setPreviewOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setPreviewOpen(false);
          }}
          tabIndex={-1}
        >
          <div
            className="relative w-full h-full max-w-7xl max-h-full flex items-center justify-center px-2 sm:px-4 py-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full h-full max-w-[95vw] max-h-[95vh] flex items-center justify-center">
              <NextImage
                src={previewUrl}
                alt="Image - full view"
                fill
                unoptimized
                sizes="(max-width: 768px) 95vw, 90vw"
                className="object-contain rounded-lg shadow-2xl"
              />
            </div>
            {/* Control buttons */}
            <div className="fixed top-4 right-4 flex gap-3 z-50">
              <Button
                size="icon"
                variant="secondary"
                className="h-10 w-10 md:h-11 md:w-11 rounded-full shadow-2xl border border-black/40 bg-black/80 text-white backdrop-blur-md hover:bg-black hover:scale-105 transition-all duration-300"
                onClick={(e) => {
                  e.stopPropagation();
                  // For local blobs, we can just download
                  const link = document.createElement("a");
                  link.href = previewUrl;
                  link.download = "preview.png";
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                title="Download image"
              >
                <Download className="h-6 w-6" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="h-10 w-10 md:h-11 md:w-11 rounded-full shadow-2xl border border-black/40 bg-black/80 text-white backdrop-blur-md hover:bg-black hover:scale-105 transition-all duration-300"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewOpen(false);
                }}
                title="Close (Esc)"
              >
                <X className="h-6 w-6" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
