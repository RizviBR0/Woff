"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Edit, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createEntry, updateTextEntry } from "@/lib/actions";
import { parseMessageSegments } from "./code-detector";
import { CodeBlock } from "./code-block";
import type { Entry } from "./entry-types";

interface TextEntryProps {
  entry: Entry;
  isMine: boolean;
  onUpdate?: (entryId: string, updates: Partial<Entry>) => void;
  onReplace?: (placeholderId: string, realEntry: Entry) => void;
}

export function TextEntry({ entry, isMine, onUpdate, onReplace }: TextEntryProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(entry.text || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [copied, setCopied] = useState(false);

  // Memoized parsed message segments (text + code blocks)
  const segments = useMemo(() => {
    return entry.text ? parseMessageSegments(entry.text) : [];
  }, [entry.text]);

  const handleSave = async () => {
    const cleanText = editText.trim();
    if (!cleanText || cleanText === entry.text || isSaving) {
      if (cleanText === entry.text) setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      const updated = await updateTextEntry(entry.id, cleanText);
      onUpdate?.(entry.id, updated as Entry);
      setIsEditing(false);
      toast.success("Message updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to edit this message",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!entry.text) return;
    try {
      await navigator.clipboard.writeText(entry.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy text");
    }
  };

  if (isEditing) {
    return (
      <div className="w-full space-y-2">
        <Textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              const target = e.currentTarget;
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const nextVal = editText.substring(0, start) + "  " + editText.substring(end);
              setEditText(nextVal);
              requestAnimationFrame(() => {
                target.selectionStart = target.selectionEnd = start + 2;
              });
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSave();
            }
          }}
          rows={Math.min(12, Math.max(3, editText.split("\n").length))}
          className="w-full rounded-lg p-3 text-sm font-mono focus-visible:ring-primary"
          placeholder="Edit message…"
          autoFocus
        />
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditText(entry.text || "");
              setIsEditing(false);
            }}
            disabled={isSaving}
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || !editText.trim()}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>
    );
  }

  // URL regex for simple clickable link conversion + inline code
  const renderFormattedText = (content: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const inlineCodeRegex = /(`[^`]+`)/g;
    const lines = content.split("\n");

    return lines.map((line, lineIdx) => {
      const parts = line.split(urlRegex);
      return (
        <span key={lineIdx} className="block min-h-[1.25rem]">
          {parts.map((part, partIdx) => {
            if (part.match(urlRegex)) {
              return (
                <a
                  key={partIdx}
                  href={part}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-primary underline underline-offset-2 hover:opacity-80"
                  onClick={(e) => e.stopPropagation()}
                >
                  {part}
                </a>
              );
            }
            // Check for inline code like `foo`
            const subParts = part.split(inlineCodeRegex);
            return subParts.map((sub, subIdx) => {
              if (sub.startsWith("`") && sub.endsWith("`") && sub.length > 2) {
                return (
                  <code
                    key={subIdx}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground font-medium"
                  >
                    {sub.slice(1, -1)}
                  </code>
                );
              }
              return sub;
            });
          })}
          {line === "" && <br />}
        </span>
      );
    });
  };

  return (
    <div
      className={`group/text relative pr-7 text-sm leading-relaxed transition-opacity ${
        entry.isLoading ? "opacity-60" : ""
      } ${entry.isError ? "text-destructive" : ""}`}
    >
      {segments.map((segment, idx) => {
        if (segment.type === "code") {
          return (
            <CodeBlock
              key={idx}
              code={segment.code}
              language={segment.language}
            />
          );
        }
        return (
          <div key={idx} className="whitespace-pre-wrap break-words">
            {renderFormattedText(segment.content)}
          </div>
        );
      })}

      {entry.isLoading && (
        <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground animate-pulse">
          <Loader2 className="h-3 w-3 animate-spin" /> Sending…
        </span>
      )}

      {entry.isError && (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[11px] font-medium text-destructive">
            Failed to send
          </span>
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={isRetrying}
            onClick={async (e) => {
              e.stopPropagation();
              if (!entry.text || isRetrying) return;
              setIsRetrying(true);
              try {
                const res = await createEntry(entry.space_id, "text", entry.text);
                if (onReplace) {
                  onReplace(entry.id, res as Entry);
                } else {
                  onUpdate?.(entry.id, { ...res, isLoading: false, isError: false } as Entry);
                }
                toast.success("Message sent");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Retry failed");
              } finally {
                setIsRetrying(false);
              }
            }}
            className="h-auto p-0 text-[11px] font-semibold text-primary underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
          >
            {isRetrying ? "Retrying…" : "Retry"}
          </Button>
        </div>
      )}

      {/* Quick copy on hover */}
      {!entry.isLoading && (
        <div className="absolute right-0 top-0 opacity-0 group-hover/text:opacity-100 transition-opacity">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 rounded-md hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            aria-label="Copy text"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3 text-muted-foreground" />
            )}
          </Button>
        </div>
      )}

      {entry.meta?.edited_at && (
        <span className="mt-1 block text-[10px] text-muted-foreground">
          (edited)
        </span>
      )}
    </div>
  );
}
