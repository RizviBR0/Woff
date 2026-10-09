"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Entry } from "./entry-types";

interface NoteEntryCardProps {
  entry: Entry;
  currentDeviceId?: string | null;
  spaceSlug?: string;
}

export function NoteEntryCard({ entry, currentDeviceId, spaceSlug }: NoteEntryCardProps) {
  const [lockedModalOpen, setLockedModalOpen] = useState(false);

  const isMine =
    Boolean(entry.created_by_device_id) &&
    Boolean(currentDeviceId) &&
    entry.created_by_device_id === currentDeviceId;

  const noteSlug = (() => {
    if (entry.meta?.note_slug) return entry.meta.note_slug;
    if (entry.text?.startsWith("NOTE:")) {
      const parts = entry.text.replace("NOTE:", "").split(":");
      return parts[0];
    }
    return null;
  })();

  const title = (() => {
    if (entry.meta?.title) return entry.meta.title;
    if (entry.text?.startsWith("NOTE:")) {
      const parts = entry.text.replace("NOTE:", "").split(":");
      return parts.slice(2).join(":") || "Untitled Note";
    }
    return "Untitled Note";
  })();

  const isLocked = Boolean(entry.meta?.is_locked);

  const handleOpenNote = (e: React.MouseEvent) => {
    // If locked and user is NOT the creator, display informative locked modal
    if (isLocked && !isMine) {
      e.preventDefault();
      setLockedModalOpen(true);
    }
  };

  if (!noteSlug) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border bg-card text-muted-foreground text-sm">
        <FileText className="h-5 w-5" />
        <span>Unavailable Note</span>
      </div>
    );
  }

  const noteUrl = spaceSlug
    ? `/${spaceSlug}/${noteSlug}`
    : entry.meta?.space_slug
      ? `/${entry.meta.space_slug}/${noteSlug}`
      : `/n/${noteSlug}`;

  return (
    <>
      <Link
        href={noteUrl}
        onClick={handleOpenNote}
        className="group block rounded-2xl border bg-card/80 p-4 transition-all hover:bg-card hover:shadow-md hover:border-primary/40 active:scale-[0.99]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-[#ff5a00] group-hover:scale-105 transition-transform">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h4 className="font-semibold text-sm truncate text-foreground group-hover:text-primary transition-colors">
                {title}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                {isLocked ? (
                  <>
                    <Lock className="h-3 w-3 text-amber-500" />
                    <span>{isMine ? "Locked Note (Author Access)" : "Author Locked Note"}</span>
                  </>
                ) : (
                  <span>Shared rich note</span>
                )}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
            <ExternalLink className="h-4 w-4" />
          </div>
        </div>
      </Link>

      {/* Informative Locked Note Dialog for Non-Authors */}
      <Dialog open={lockedModalOpen} onOpenChange={setLockedModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
              <Lock className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center">This Note is Locked</DialogTitle>
            <DialogDescription className="text-center">
              This note was set to private by its author. Only the creator has permission to view and edit its contents.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="sm:justify-center pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLockedModalOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
