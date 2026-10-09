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
      <div className="flex items-center gap-1">
        {isMine && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setDeleteDialogOpen(true)}
            className="h-7 w-7 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-500/10 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/20 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 hover:!opacity-100 transition-all focus:opacity-100"
            title="Delete message"
            aria-label="Delete message"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground opacity-70 sm:opacity-0 sm:group-hover:opacity-100 data-[state=open]:opacity-100 hover:!opacity-100 transition-all focus:opacity-100"
              aria-label="More options"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {entry.text && !isNote && (
              <DropdownMenuItem onClick={handleCopy} className="gap-2 cursor-pointer">
                <Copy className="h-4 w-4" />
                <span>Copy text</span>
              </DropdownMenuItem>
            )}

            <DropdownMenuItem onClick={handleReport} className="gap-2 text-muted-foreground cursor-pointer">
              <Flag className="h-4 w-4" />
              <span>Report entry</span>
            </DropdownMenuItem>

            {isMine && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteDialogOpen(true)}
                  className="gap-2 text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-950/40 cursor-pointer font-medium"
                >
                  <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <span>Delete</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="sm:max-w-md rounded-2xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <AlertDialogTitle className="text-lg font-bold">
                  Delete item
                </AlertDialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This action cannot be undone
                </p>
              </div>
            </div>
            <AlertDialogDescription className="text-sm text-foreground/80 pt-2 leading-relaxed">
              Are you sure you want to delete this item? It and any attached files will be permanently removed from this room.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2 sm:gap-0">
            <AlertDialogCancel disabled={isDeleting} className="rounded-xl">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold rounded-xl"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1.5" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
