"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function splitUrlTrailingPunctuation(raw: string): { url: string; trailing: string } {
  let url = raw;
  let trailing = "";
  while (url.length > 0) {
    const last = url[url.length - 1];
    if (/[.,;:!?'"\]]/.test(last)) {
      trailing = last + trailing;
      url = url.slice(0, -1);
      continue;
    }
    if (last === ")") {
      const opens = (url.match(/\(/g) || []).length;
      const closes = (url.match(/\)/g) || []).length;
      if (closes > opens) {
        trailing = last + trailing;
        url = url.slice(0, -1);
        continue;
      }
    }
    break;
  }
  return { url, trailing };
}

export function TextEntry({ entry, isMine, onUpdate, onReplace }: TextEntryProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(entry.text || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

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
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
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

  // Inline code takes precedence over URL linkification so backticks stay intact
  const renderFormattedText = (content: string) => {
    const inlineCodeRegex = /(`[^`]+`)/g;
    const urlSplitRegex = /(https?:\/\/[^\s]+)/g;
    const lines = content.split("\n");

    return lines.map((line, lineIdx) => {
      const codeParts = line.split(inlineCodeRegex);
      return (
        <span key={lineIdx} className="block min-h-[1.25rem]">
          {codeParts.map((part, partIdx) => {
            if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
              return (
                <code
                  key={partIdx}
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground font-medium"
                >
                  {part.slice(1, -1)}
                </code>
              );
            }
            const urlParts = part.split(urlSplitRegex);
            return urlParts.map((sub, subIdx) => {
              if (/^https?:\/\//.test(sub)) {
                const { url, trailing } = splitUrlTrailingPunctuation(sub);
                if (url) {
                  return (
                    <span key={`${partIdx}-${subIdx}`}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-primary underline underline-offset-2 hover:opacity-80"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {url}
                      </a>
                      {trailing}
                    </span>
                  );
                }
              }
              return sub;
            });
          })}
          {line === "" && <br />}
        </span>
      );
    });
  };

  const canEdit =
    isMine &&
    !entry.isLoading &&
    !entry.isError &&
    !entry.id.startsWith("temp-") &&
    !entry.id.startsWith("placeholder-");

  return (
    <div
      className={`group/text relative ${canEdit ? "pr-14" : "pr-7"} text-sm leading-relaxed transition-opacity ${
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

      {/* Quick copy and edit actions */}
      {!entry.isLoading && (
        <div className="absolute right-0 top-0 flex items-center gap-0.5 opacity-80 sm:opacity-0 sm:group-hover/text:opacity-100 sm:focus-within:opacity-100 transition-opacity">
          {canEdit && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 rounded-md hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                setEditText(entry.text || "");
                setIsEditing(true);
              }}
              aria-label="Edit message"
              title="Edit message"
            >
              <Edit className="h-3 w-3 text-muted-foreground" />
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 rounded-md hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              void handleCopy();
            }}
            aria-label="Copy text"
            title="Copy text"
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
