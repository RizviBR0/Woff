"use client";

import { useState } from "react";
import {
  Copy,
  Flag,
  Loader2,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteEntry, reportEntry } from "@/lib/actions";
import { getEntryCategory, type Entry } from "./entry-types";

interface EntryContextMenuProps {
  entry: Entry;
  isMine: boolean;
  onDelete?: (entryId: string) => void;
}

export function EntryContextMenu({
  entry,
  isMine,
  onDelete,
}: EntryContextMenuProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // If optimistic placeholder, disable actions
  if (entry.id.startsWith("placeholder-") || entry.id.startsWith("temp-") || entry.isLoading) return null;

  const isNote = getEntryCategory(entry) === "note";

  const handleCopy = async () => {
    if (!entry.text || isNote) return;
    try {
      await navigator.clipboard.writeText(entry.text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleReport = async () => {
    try {
      await reportEntry(entry.id);
      toast.success("Entry reported to moderators");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit report");
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteEntry(entry.id);
      onDelete?.(entry.id);
      toast.success("Entry removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete entry");
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity"
            aria-label="More options"
          >
            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {entry.text && !isNote && (
            <DropdownMenuItem onClick={handleCopy} className="gap-2">
              <Copy className="h-4 w-4" />
              <span>Copy text</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={handleReport} className="gap-2 text-muted-foreground">
            <Flag className="h-4 w-4" />
            <span>Report entry</span>
          </DropdownMenuItem>

          {isMine && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this item and any attached files from the space. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
