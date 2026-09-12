"use client";

import { DrawingCanvas } from "@/components/digital-canvas";

interface ImageMarkupEditorProps {
  imageUrl: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSend: (blob: Blob) => Promise<void>;
}

export function ImageMarkupEditor({
  imageUrl,
  isOpen,
  onClose,
  onSend,
}: ImageMarkupEditorProps) {
  return (
    <DrawingCanvas
      isOpen={isOpen}
      onClose={onClose}
      onSave={onSend}
      initialImageUrl={imageUrl}
      title="Mark up image"
      saveButtonLabel="Send edited"
    />
  );
}

