"use client";

import { memo } from "react";
import { displayNameForDevice } from "@/lib/display-name";
import {
  AVATAR_COLORS,
  getAvatarColorIndex,
  getEntryCategory,
  type Entry,
} from "./entries/entry-types";
import { TextEntry } from "./entries/text-entry";
import { NoteEntryCard } from "./entries/note-entry-card";
import { MediaEntryCard } from "./entries/media-entry-card";
import { FileEntryCard } from "./entries/file-entry-card";
import { EntryContextMenu } from "./entries/entry-context-menu";

export type { Entry } from "./entries/entry-types";

interface EntryCardProps {
  entry: Entry;
  currentDeviceId?: string | null;
  onDelete?: (entryId: string) => void;
  onUpdate?: (entryId: string, updates: Partial<Entry>) => void;
  onNewEntry?: (entry: Entry) => void;
}

function formatTime(dateString: string) {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

export const EntryCard = memo(function EntryCard({
  entry,
  currentDeviceId = null,
  onDelete,
  onUpdate,
  onNewEntry,
}: EntryCardProps) {
  const isMine =
    Boolean(entry.created_by_device_id) &&
    Boolean(currentDeviceId) &&
    entry.created_by_device_id === currentDeviceId;

  const category = getEntryCategory(entry);

  const nameLabel = isMine
    ? "You"
    : displayNameForDevice(entry.created_by_device_id || entry.id);

  const colorIndex = getAvatarColorIndex(
    entry.created_by_device_id || entry.id,
  );

  const firstLetter = nameLabel.charAt(0).toUpperCase();

  // Loading overlay for optimistic UI
  const loadingOverlay = entry.id.startsWith("placeholder-") ? (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-[2px] transition-all">
      <div className="flex flex-col items-center gap-2 p-3 text-center">
        {entry.isLoading ? (
          <div className="h-7 w-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive/10 text-destructive font-bold text-sm">
            !
          </div>
        )}
        {entry.uploadMessage && (
          <span
            className={`text-xs font-medium ${
              entry.isLoading ? "text-muted-foreground" : "text-destructive"
            }`}
          >
            {entry.uploadMessage}
          </span>
        )}
        {entry.isLoading &&
          typeof entry.uploadProgress === "number" &&
          entry.uploadProgress > 0 && (
            <div className="w-24 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${entry.uploadProgress}%` }}
              />
            </div>
          )}
      </div>
    </div>
  ) : null;

  return (
    <div
      id={`entry-${entry.id}`}
      className={`group relative flex w-full gap-3 p-3 sm:p-4 rounded-2xl transition-colors hover:bg-muted/30 ${
        isMine ? "bg-muted/15" : "bg-transparent"
      }`}
    >
      {loadingOverlay}

      {/* Avatar */}
      <div
        className={`flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full font-bold text-xs text-white shadow-sm ${
          isMine ? "bg-blue-600" : AVATAR_COLORS[colorIndex]
        }`}
        aria-label={nameLabel}
      >
        {firstLetter}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Header: Sender Name & Timestamp & Context Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-xs font-semibold truncate text-foreground">
              {nameLabel}
            </span>
            <time className="text-[10px] text-muted-foreground shrink-0">
              {formatTime(entry.created_at)}
            </time>
          </div>

          <EntryContextMenu
            entry={entry}
            isMine={isMine}
            onDelete={onDelete}
          />
        </div>

        {/* Dynamic Entry Content Subcomponent */}
        <div className="pt-0.5">
          {category === "note" && (
            <NoteEntryCard entry={entry} currentDeviceId={currentDeviceId} />
          )}
          {category === "media" && (
            <MediaEntryCard entry={entry} onNewEntry={onNewEntry} />
          )}
          {category === "file" && <FileEntryCard entry={entry} />}
          {category === "text" && (
            <TextEntry
              entry={entry}
              isMine={isMine}
              onUpdate={onUpdate}
            />
          )}
        </div>
      </div>
    </div>
  );
});
