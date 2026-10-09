"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Extension } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TiptapLink from "@tiptap/extension-link";
import TiptapImage from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  ChevronDown,
  CloudOff,
  Code2,
  Copy,
  Download,
  FileDown,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Info,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  Minus,
  MoreHorizontal,
  Printer,
  Quote,
  Redo2,
  RefreshCw,
  Save,
  Share2,
  Strikethrough,
  Tag,
  Trash2,
  Type,
  UnderlineIcon,
  Undo2,
  Unlink,
  WrapText,
  AlertTriangle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import TurndownService from "turndown";
import { marked } from "marked";
import type { Note, Space } from "@/lib/actions";
import { prepareNoteShare } from "@/lib/note-sharing-actions";
import { readBrowserValue, rememberSpaceInvitation } from "@/lib/space-recovery";
import {
  createUploadIntents,
  registerNoteAsset,
  saveNoteSnapshot,
  getNote,
  setNotePrivacy,
  cancelUploadIntents,
} from "@/lib/actions";
import {
  downloadMarkdownNote,
  downloadPlainTextNote,
  triggerPrintNote,
  copyTextToClipboard,
} from "@/lib/note-export";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";

interface NoteEditorProps {
  noteSlug: string;
  initialNote?: Note | null;
  invitation?: { space: Pick<Space, "id" | "slug" | "access_version">; token: string };
}

type SaveState = "saved" | "unsaved" | "saving" | "offline" | "error" | "conflict";
type ImageAlignment = "left" | "center" | "right";

interface LocalDraft {
  html?: string;
  json?: Record<string, unknown>;
  rawContent?: string;
  title?: string;
  savedAt: number;
}

const imageUploadPlaceholderKey = new PluginKey<DecorationSet>(
  "imageUploadPlaceholder",
);

const ImageUploadPlaceholder = Extension.create({
  name: "imageUploadPlaceholder",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: imageUploadPlaceholderKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, decorations) {
            let next = decorations.map(transaction.mapping, transaction.doc);
            const action = transaction.getMeta(imageUploadPlaceholderKey) as
              | {
                  add?: {
                    id: string;
                    pos: number;
                    previewUrl: string;
                    name: string;
                    order: number;
                    retry: () => void;
                  };
                  remove?: { id: string };
                }
              | undefined;

            if (action?.add) {
              const { id, pos, previewUrl, name, order, retry } = action.add;
              const widget = Decoration.widget(
                pos,
                () => {
                  const container = document.createElement("span");
                  container.className = "note-image-upload-placeholder";
                  container.dataset.imageUploadId = id;
                  container.setAttribute("role", "status");
                  container.setAttribute("aria-label", `Uploading ${name} here`);

                  const preview = document.createElement("img");
                  preview.src = previewUrl;
                  preview.alt = `Preview of ${name}`;

                  const previewContainer = document.createElement("span");
                  previewContainer.className = "note-image-upload-placeholder__preview";

                  const overlay = document.createElement("span");
                  overlay.className = "note-image-upload-placeholder__overlay";

                  const spinner = document.createElement("span");
                  spinner.className = "note-image-upload-placeholder__spinner";
                  spinner.setAttribute("aria-hidden", "true");

                  const retryButton = document.createElement("button");
                  retryButton.type = "button";
                  retryButton.className = "note-image-upload-placeholder__retry";
                  retryButton.title = "Retry image upload";
                  retryButton.setAttribute("aria-label", `Retry uploading ${name}`);
                  retryButton.textContent = "↻";
                  retryButton.addEventListener("mousedown", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  });
                  retryButton.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    retry();
                  });

                  overlay.append(spinner, retryButton);
                  previewContainer.append(preview, overlay);
                  container.append(previewContainer);
                  return container;
                },
                { id, side: order + 1 },
              );
              next = next.add(transaction.doc, [widget]);
            }

            if (action?.remove) {
              next = next.remove(
                next.find(
                  undefined,
                  undefined,
                  (spec) => spec.id === action.remove?.id,
                ),
              );
            }
            return next;
          },
        },
        props: {
          decorations(state) {
            return imageUploadPlaceholderKey.getState(state);
          },
        },
      }),
    ];
  },
});

const NoteImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "left",
        parseHTML: (element) =>
          (element.getAttribute("data-align") as ImageAlignment | null) || "left",
        renderHTML: (attributes) => ({
          "data-align": attributes.align || "left",
        }),
      },
    };
  },
});

function getClipboardImages(data: DataTransfer | null): File[] {
  const itemFiles = Array.from(data?.items || [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  return (
    itemFiles.length > 0
      ? itemFiles
      : Array.from(data?.files || []).filter((file) =>
          file.type.startsWith("image/"),
        )
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
  shortcut,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs transition ${
        active
          ? "bg-foreground text-background shadow-xs font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      } disabled:cursor-not-allowed disabled:opacity-30`}
    >
      {children}
    </button>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Robust Turndown configuration with fidelity rules
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "_",
});

turndownService.addRule("taskListItem", {
  filter: (node) =>
    node.nodeName === "LI" &&
    (node.getAttribute("data-type") === "taskItem" ||
      node.classList.contains("task-list-item")),
  replacement: (content, node) => {
    const isChecked =
      (node as HTMLElement).getAttribute("data-checked") === "true" ||
      node.querySelector('input[type="checkbox"]:checked') !== null;
    return `${isChecked ? "- [x]" : "- [ ]"} ${content.trim()}\n`;
  },
});

turndownService.addRule("strikethrough", {
  filter: (node) =>
    node.nodeName === "S" ||
    node.nodeName === "DEL" ||
    node.nodeName === "STRIKE",
  replacement: (content) => `~~${content}~~`,
});

turndownService.addRule("underline", {
  filter: (node) => node.nodeName === "U" || node.nodeName === "INS",
  replacement: (content) => `<u>${content}</u>`,
});

turndownService.addRule("extendedImage", {
  filter: "img",
  replacement: (_content, node) => {
    const element = node as HTMLImageElement;
    const alt = element.getAttribute("alt") || "";
    const src = element.getAttribute("src") || "";
    const width = element.getAttribute("width");
    const align = element.getAttribute("data-align");

    if (!width && !align) {
      return `![${alt}](${src})`;
    }
    const styleAttr = align ? ` style="text-align: ${align}"` : "";
    const widthAttr = width ? ` width="${width}"` : "";
    return `<img src="${src}" alt="${alt}"${widthAttr}${styleAttr} />`;
  },
});

export function NoteEditor({ noteSlug, initialNote, invitation }: NoteEditorProps) {
  const router = useRouter();
  const note = initialNote!;
  const [roomSlug, setRoomSlug] = useState(note?.space_slug || "");
  const [roomAccessVersion, setRoomAccessVersion] = useState(invitation?.space.access_version ?? 0);
  const roomIdentityRef = useRef({ slug: note?.space_slug || "", accessVersion: invitation?.space.access_version ?? 0 });
  const canEdit = Boolean(note?.can_edit ?? note?.is_owner);
  const [title, setTitle] = useState(note?.title || "Untitled Note");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [mode, setMode] = useState<"rich" | "raw">("rich");
  const [rawContent, setRawContent] = useState("");
  const modeRef = useRef<"rich" | "raw">("rich");
  const rawContentRef = useRef("");
  const rawBaselineRef = useRef("");
  const [wordWrap, setWordWrap] = useState(true);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const rawTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [shareError, setShareError] = useState("");
  const [shareGrantsRoomAccess, setShareGrantsRoomAccess] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [stats, setStats] = useState({ words: 0, characters: 0 });
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isWideWidth, setIsWideWidth] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [altDialogOpen, setAltDialogOpen] = useState(false);
  const [altTextValue, setAltTextValue] = useState("");
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<LocalDraft | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<void> | null>(null);
  const revisionRef = useRef(0);
  const titleRef = useRef(title);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{
    title: string;
    html: string;
    json: Record<string, unknown>;
    revision: number;
  } | null>(null);
  const versionRef = useRef(note?.version || 1);
  const mutationRef = useRef<Promise<void> | null>(null);
  const dirtyRef = useRef(false);
  const mountedRef = useRef(false);
  const imageUploadBusyRef = useRef(false);
  const pendingImagePreviewsRef = useRef<Map<string, string>>(new Map());
  const pasteImageHandlerRef = useRef<(files: File[]) => void>(() => undefined);
  const draftKey = `woff-note-draft:${noteSlug}`;

  useEffect(() => {
    const slug = note?.space_slug || "";
    roomIdentityRef.current = { slug, accessVersion: 0 };
    setRoomSlug(slug);
    setRoomAccessVersion(0);
  }, [note?.space_id, note?.space_slug]);

  useEffect(() => {
    const roomId = note?.space_id;
    if (!roomId) return;
    let disposed = false;
    let refreshing = false;
    let refreshAgain = false;
    const refreshRoomIdentity = () => {
      if (disposed) return;
      if (refreshing) { refreshAgain = true; return; }
      refreshing = true;
      // Resolve the already-authorized room by UUID; a retired URL must never
      // select another room or replace the note's unsaved document.
      void Promise.resolve(supabaseBrowser.from("spaces").select("id,slug,access_version")
        .eq("id", roomId).maybeSingle()).then(({ data: room, error }) => {
          if (disposed || error) return;
          if (!room || room.id !== roomId) {
            roomIdentityRef.current = { slug: "", accessVersion: -1 };
            setRoomSlug("");
            setRoomAccessVersion(-1);
            return;
          }
          const previousSlug = roomIdentityRef.current.slug;
          if (previousSlug && previousSlug !== room.slug &&
            readBrowserValue(`woff_invite_room_${previousSlug}`) === roomId &&
            readBrowserValue(`woff_invite_version_${previousSlug}`) === String(room.access_version)) {
            const token = readBrowserValue(`woff_invite_${previousSlug}`) || "";
            if (/^[a-f0-9]{64}$/.test(token)) rememberSpaceInvitation(room, token);
          }
          roomIdentityRef.current = { slug: room.slug, accessVersion: room.access_version };
          setRoomSlug(room.slug);
          setRoomAccessVersion(room.access_version);
          if (previousSlug && previousSlug !== room.slug &&
            window.location.pathname === `/${previousSlug}/${noteSlug}`) {
            window.history.replaceState(window.history.state, "",
              `/${room.slug}/${noteSlug}${window.location.search}${window.location.hash}`);
          }
        }).catch(() => { /* Keep the authorized identity during a network interruption. */ })
        .finally(() => {
          refreshing = false;
          if (refreshAgain) { refreshAgain = false; refreshRoomIdentity(); }
        });
    };
    const channel = supabaseBrowser.channel(`note-room:${roomId}:${noteSlug}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "spaces", filter: `id=eq.${roomId}`,
      }, ({ new: room }) => {
        if (room.slug !== roomIdentityRef.current.slug ||
          room.access_version !== roomIdentityRef.current.accessVersion) refreshRoomIdentity();
      })
      .on("system", { event: "*" }, (payload) => {
        if (payload.extension === "postgres_changes" && payload.status === "ok") refreshRoomIdentity();
      })
      .subscribe((status) => { if (status === "SUBSCRIBED") refreshRoomIdentity(); });
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshRoomIdentity();
    };
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      disposed = true;
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabaseBrowser.removeChannel(channel);
    };
  }, [note?.space_id, noteSlug]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
        underline: false,
      }),
      Underline,
      TiptapLink.configure({
        openOnClick: !canEdit,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      NoteImage.configure({
        allowBase64: false,
        resize: canEdit
          ? {
              enabled: true,
              directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
              minWidth: 80,
              minHeight: 48,
              alwaysPreserveAspectRatio: true,
            }
          : false,
        HTMLAttributes: { class: "note-image" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ImageUploadPlaceholder,
      Placeholder.configure({
        placeholder: canEdit ? "Start writing…" : "",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: note?.content ?? "",
    editorProps: {
      handlePaste(_view, event) {
        if (!canEdit) return false;
        const images = getClipboardImages(event.clipboardData);
        if (!images.length) return false;
        event.preventDefault();
        pasteImageHandlerRef.current(images);
        return true;
      },
    },
    onUpdate({ editor: currentEditor }) {
      if (!mountedRef.current || !canEdit) return;
      dirtyRef.current = true;
      revisionRef.current += 1;
      setSaveState(navigator.onLine ? "unsaved" : "offline");
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => serializeDraft(currentEditor), 300);
      scheduleSave();
    },
  });

  const rawLines = useMemo(() => (rawContent || " ").split("\n"), [rawContent]);

  // Non-destructive mode switcher
  const handleSwitchMode = (targetMode: "rich" | "raw") => {
    if (targetMode === mode) return;

    if (targetMode === "raw") {
      const currentHtml = editor?.getHTML() || "";
      try {
        const md = turndownService.turndown(currentHtml);
        rawBaselineRef.current = md;
        rawContentRef.current = md;
        setRawContent(md);
      } catch {
        rawBaselineRef.current = currentHtml;
        rawContentRef.current = currentHtml;
        setRawContent(currentHtml);
      }
      modeRef.current = "raw";
      setMode("raw");
    } else {
      // If raw content was not edited, switch back non-destructively
      if (rawContentRef.current !== rawBaselineRef.current) {
        try {
          const html = marked.parse(rawContentRef.current) as string;
          editor?.commands.setContent(html);
          dirtyRef.current = true;
          revisionRef.current += 1;
          scheduleSave();
        } catch {
          // preserve current state on parse failure
        }
      }
      modeRef.current = "rich";
      setMode("rich");
    }
  };

  const handleRawContentChange = (newVal: string) => {
    if (!canEdit) return;
    rawContentRef.current = newVal;
    setRawContent(newVal);
    dirtyRef.current = true;
    revisionRef.current += 1;
    setSaveState(navigator.onLine ? "unsaved" : "offline");
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => serializeDraft(), 300);
    scheduleSave();
  };

  const serializeDraft = useCallback(
    (source = editor) => {
      if (!source || !canEdit || !dirtyRef.current) return;
      const isRaw = modeRef.current === "raw";
      const text = isRaw ? rawContentRef.current : source.getText();
      setStats({
        words: text.trim() ? text.trim().split(/\s+/).length : 0,
        characters: text.length,
      });
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            html: isRaw
              ? (marked.parse(rawContentRef.current) as string)
              : source.getHTML(),
            json: isRaw ? undefined : source.getJSON(),
            rawContent: isRaw ? rawContentRef.current : undefined,
            title: titleRef.current,
            savedAt: Date.now(),
          }),
        );
      } catch {
        // Fallback silently if storage quota exceeded
      }
    },
    [canEdit, draftKey, editor],
  );

  const performSave = useCallback(
    (snapshot?: {
      title: string;
      html: string;
      json: Record<string, unknown>;
    }): Promise<void> => {
      if (!editor || !canEdit) return Promise.resolve();
      if (mutationRef.current) return mutationRef.current.catch(() => undefined).then(() => performSave(snapshot));
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!dirtyRef.current) return saveQueueRef.current || Promise.resolve();

      const current =
        snapshot ||
        ({
          title: titleRef.current,
          html:
            modeRef.current === "raw"
              ? (marked.parse(rawContentRef.current) as string)
              : editor.getHTML(),
          json: modeRef.current === "raw" ? {} : editor.getJSON(),
        } as const);

      serializeDraft();
      pendingSaveRef.current = { ...current, revision: revisionRef.current };
      if (saveQueueRef.current) return saveQueueRef.current;

      saveQueueRef.current = (async () => {
        while (pendingSaveRef.current) {
          const saving = pendingSaveRef.current;
          pendingSaveRef.current = null;
          if (!navigator.onLine) {
            setSaveState("offline");
            return;
          }
          setSaveState("saving");
          try {
            const updated = await saveNoteSnapshot(noteSlug, {
              title: saving.title,
              content: saving.html,
              content_json: saving.json,
              version: versionRef.current,
            });
            if (updated.error) throw new Error(updated.error);
            versionRef.current = updated.version || versionRef.current + 1;
            if (saving.revision === revisionRef.current) {
              dirtyRef.current = false;
              setSaveState("saved");
              try {
                localStorage.removeItem(draftKey);
              } catch {}
            } else {
              setSaveState("unsaved");
            }
          } catch (error) {
            dirtyRef.current = true;
            const message =
              error instanceof Error ? error.message : "Unable to save note";
            if (
              message.includes("changed elsewhere") ||
              message.includes("Reload before saving again")
            ) {
              setSaveState("conflict");
              setConflictOpen(true);
            } else {
              setSaveState("error");
              toast.error(message);
            }
            pendingSaveRef.current = null;
            break;
          }
        }
      })().finally(() => {
        saveQueueRef.current = null;
      });
      return saveQueueRef.current;
    },
    [canEdit, draftKey, editor, noteSlug, serializeDraft],
  );

  const scheduleSave = useCallback(() => {
    if (!canEdit) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!editor) return;
      void performSave();
    }, 1000);
  }, [canEdit, editor, performSave]);

  // Draft recovery check on mount
  useEffect(() => {
    mountedRef.current = true;
    const pendingImagePreviews = pendingImagePreviewsRef.current;
    if (editor) {
      const text = editor.getText();
      setStats({
        words: text.trim() ? text.trim().split(/\s+/).length : 0,
        characters: text.length,
      });
    }

    if (canEdit && editor) {
      try {
        const rawDraft = localStorage.getItem(draftKey);
        const draft: LocalDraft | null = rawDraft ? JSON.parse(rawDraft) : null;
        if (
          draft &&
          draft.savedAt > new Date(note.updated_at).getTime() &&
          (draft.title !== (note.title || "Untitled Note") ||
            (draft.rawContent
              ? draft.rawContent !== rawContentRef.current
              : draft.html !== note.content))
        ) {
          setRecoveryDraft(draft);
        }
      } catch {
        localStorage.removeItem(draftKey);
      }
    }

    return () => {
      mountedRef.current = false;
      serializeDraft();
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      pendingImagePreviews.forEach((url) => URL.revokeObjectURL(url));
      pendingImagePreviews.clear();
    };
  }, [canEdit, draftKey, editor, note.content, note.title, note.updated_at, serializeDraft]);

  // Keyboard shortcuts and window lifecycle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;

      if (cmdOrCtrl && event.key.toLowerCase() === "s") {
        event.preventDefault();
        toast.info("Saving note…");
        void performSave();
      } else if (cmdOrCtrl && event.key.toLowerCase() === "p") {
        event.preventDefault();
        triggerPrintNote();
      } else if (cmdOrCtrl && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setIsFocusMode((prev) => !prev);
      } else if (event.key === "Escape" && isFocusMode) {
        setIsFocusMode(false);
      }
    };

    const beforeUnload = (event: BeforeUnloadEvent) => {
      serializeDraft();
      if (!dirtyRef.current && pendingImagePreviewsRef.current.size === 0) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    const online = () => {
      if (dirtyRef.current) {
        setSaveState("unsaved");
        scheduleSave();
      }
    };
    const offline = () => setSaveState("offline");
    const flush = () => {
      serializeDraft();
      if (dirtyRef.current && navigator.onLine) void performSave();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visibility);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [isFocusMode, performSave, scheduleSave, serializeDraft]);

  useEffect(() => {
    if (invitation) rememberSpaceInvitation(invitation.space, invitation.token);
  }, [invitation]);

  // Prepare one validated URL for both the clipboard and QR code.
  useEffect(() => {
    if (!shareOpen) return;
    let cancelled = false;
    setShareUrl("");
    setQrCode("");
    setShareError("");
    setQrFailed(false);
    setCopied(false);
    if (note.is_locked) {
      setShareError("This note is private. Choose Share Note with Room in Note options first.");
      return;
    }
    if (!roomSlug) {
      setShareError("Room access is unavailable. Reopen the room before sharing this note.");
      return;
    }
    const slug = roomSlug;
    const cached = {
      token: readBrowserValue(`woff_invite_${slug}`) || "",
      roomId: readBrowserValue(`woff_invite_room_${slug}`) || "",
      accessVersion: Number(readBrowserValue(`woff_invite_version_${slug}`)),
    };
    void (async () => {
      try {
        const share = await prepareNoteShare(noteSlug, cached);
        if (cancelled) return;
        if (share.token) rememberSpaceInvitation(share.room, share.token);
        const url = new URL(share.path, process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).toString();
        setShareUrl(url);
        setShareGrantsRoomAccess(share.grantsRoomAccess);
        try {
          const { default: QRCode } = await import("qrcode");
          const qr = await QRCode.toDataURL(url, { width: 220, margin: 1 });
          if (!cancelled) setQrCode(qr);
        } catch {
          if (!cancelled) setQrFailed(true);
        }
      } catch {
        if (!cancelled) setShareError("Unable to prepare this link. Check room access and try again.");
      }
    })();
    return () => { cancelled = true; };
  }, [shareOpen, noteSlug, note.is_locked, roomSlug, roomAccessVersion]);

  const updateTitle = (value: string) => {
    const clean = value.slice(0, 120);
    titleRef.current = clean;
    revisionRef.current += 1;
    setTitle(clean);
    dirtyRef.current = true;
    setSaveState(navigator.onLine ? "unsaved" : "offline");
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => serializeDraft(), 300);
    scheduleSave();
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    const ok = await copyTextToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy link");
    }
  };

  const applyLink = () => {
    if (!editor) return;
    const href = linkValue.trim();
    if (!href) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
    setLinkValue("");
  };

  const handleOpenAltDialog = () => {
    if (!editor) return;
    const currentAlt = editor.getAttributes("image").alt || "";
    setAltTextValue(currentAlt);
    setAltDialogOpen(true);
  };

  const handleApplyAltText = () => {
    if (!editor) return;
    editor.chain().focus().updateAttributes("image", { alt: altTextValue.trim() }).run();
    setAltDialogOpen(false);
    dirtyRef.current = true;
    revisionRef.current += 1;
    scheduleSave();
    toast.success("Image description updated");
  };

  const handleToggleLock = async () => {
    if (mutationRef.current) return;
    setPrivacyBusy(true);
    try {
      const nextLocked = !note.is_locked;
      const saving = performSave();
      const mutation = saving.then(async () => {
        if (dirtyRef.current) throw new Error("Save your changes before changing privacy.");
        const updated = await setNotePrivacy(noteSlug, nextLocked, versionRef.current);
        versionRef.current = updated.version;
        note.is_locked = updated.is_locked;
      });
      mutationRef.current = mutation;
      await mutation;
      setLockDialogOpen(false);
      toast.success(nextLocked ? "Note is now private to you" : "Note is shared with the room");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update privacy";
      if (message.includes("changed elsewhere")) {
        setSaveState("conflict"); setLockDialogOpen(false); setConflictOpen(true);
      } else { toast.error(message); }
    } finally {
      mutationRef.current = null;
      setPrivacyBusy(false);
      if (dirtyRef.current) scheduleSave();
    }
  };

  const restoreDraft = () => {
    if (!recoveryDraft || !editor) return;
    if (recoveryDraft.json || recoveryDraft.html) {
      editor.commands.setContent(recoveryDraft.json || recoveryDraft.html || "");
    }
    if (typeof recoveryDraft.rawContent === "string") {
      rawContentRef.current = recoveryDraft.rawContent;
      setRawContent(recoveryDraft.rawContent);
      modeRef.current = "raw";
      setMode("raw");
    }
    if (recoveryDraft.title) {
      setTitle(recoveryDraft.title);
      titleRef.current = recoveryDraft.title;
    }
    revisionRef.current += 1;
    dirtyRef.current = true;
    setSaveState("unsaved");
    setRecoveryDraft(null);
    scheduleSave();
    toast.success("Draft restored from browser storage");
  };

  const discardDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    setRecoveryDraft(null);
    toast.info("Draft discarded");
  };

  const handleDownloadMarkdown = () => {
    const mdContent =
      mode === "raw"
        ? rawContent
        : turndownService.turndown(editor?.getHTML() || "");
    downloadMarkdownNote(title, mdContent);
    toast.success("Downloaded as Markdown (.md)");
  };

  const handleDownloadPlainText = () => {
    const textContent =
      mode === "raw"
        ? rawContent
        : editor?.getText() || "";
    downloadPlainTextNote(title, textContent);
    toast.success("Downloaded as Plain Text (.txt)");
  };

  const handleCopyMarkdown = async () => {
    const mdContent =
      mode === "raw"
        ? rawContent
        : turndownService.turndown(editor?.getHTML() || "");
    const ok = await copyTextToClipboard(mdContent);
    if (ok) {
      toast.success("Markdown copied to clipboard");
    } else {
      toast.error("Failed to copy");
    }
  };

  const handleCopyPlainText = async () => {
    const textContent =
      mode === "raw" ? rawContent : editor?.getText() || "";
    const ok = await copyTextToClipboard(textContent);
    if (ok) {
      toast.success("Text copied to clipboard");
    } else {
      toast.error("Failed to copy");
    }
  };

  const handleForceOverwrite = async () => {
    if (mutationRef.current) return;
    try {
      const mutation = (saveQueueRef.current || Promise.resolve()).then(async () => {
        const latest = await getNote(noteSlug);
        if (!latest?.is_owner || !latest.version) throw new Error("Unable to read the current note version.");
        versionRef.current = latest.version;
        dirtyRef.current = true;
      });
      mutationRef.current = mutation;
      await mutation;
      mutationRef.current = null;
      setConflictOpen(false);
      await performSave();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to overwrite note");
    } finally {
      mutationRef.current = null;
    }
  };

  // Inline Image Upload logic
  const uploadInlineImages = useCallback(
    async (files: File[]) => {
      if (!editor || !canEdit || !files.length) return;
      if (files.length > 20) {
        toast.error("Paste at most 20 images at once");
        return;
      }
      if (imageUploadBusyRef.current) {
        toast.info("Another image is uploading in the background");
        return;
      }
      const invalid = files.find((file) => !file.type.startsWith("image/"));
      if (invalid) {
        toast.error("Only images can be pasted into a note");
        return;
      }
      const tooLarge = files.find((file) => file.size > 50 * 1024 * 1024);
      if (tooLarge) {
        toast.error(`${tooLarge.name || "An image"} is larger than 50 MB`);
        return;
      }

      const insertionPos = editor.state.selection.from;
      type PendingImage = {
        id: string;
        previewUrl: string;
        file: File;
        index: number;
        status: "pending" | "uploading" | "failed" | "complete";
        intent?: { path: string; bucket: string };
        ready?: { url: string; width?: number; height?: number };
      };
      const placeholders: PendingImage[] = [];
      let processQueue: (startIndex: number) => Promise<void>;

      const setPlaceholderStatus = (
        placeholder: PendingImage,
        status: PendingImage["status"],
      ) => {
        placeholder.status = status;
        const container = editor.view.dom.querySelector<HTMLElement>(
          `[data-image-upload-id="${placeholder.id}"]`,
        );
        if (!container) return;
        container.classList.toggle("is-failed", status === "failed");
        container.classList.toggle("is-uploading", status === "uploading");
        if (status === "failed") {
          container.setAttribute("role", "alert");
          container.setAttribute(
            "aria-label",
            `${placeholder.file.name || "Image"} failed to upload. Select retry.`,
          );
        } else {
          container.setAttribute("role", "status");
          container.setAttribute(
            "aria-label",
            `Uploading ${placeholder.file.name || "image"} in the background`,
          );
        }
      };

      const removePlaceholder = (placeholder: PendingImage) => {
        const decorations = imageUploadPlaceholderKey.getState(editor.state);
        const position =
          decorations?.find(
            undefined,
            undefined,
            (spec) => spec.id === placeholder.id,
          )[0]?.from ?? editor.state.selection.from;
        editor.view.dispatch(
          editor.state.tr.setMeta(imageUploadPlaceholderKey, {
            remove: { id: placeholder.id },
          }),
        );
        pendingImagePreviewsRef.current.delete(placeholder.id);
        URL.revokeObjectURL(placeholder.previewUrl);
        return position;
      };

      files.forEach((file, index) => {
        const id = `image-upload-${crypto.randomUUID()}`;
        const previewUrl = URL.createObjectURL(file);
        pendingImagePreviewsRef.current.set(id, previewUrl);
        const placeholder: PendingImage = {
          id,
          previewUrl,
          file,
          index,
          status: "pending",
        };
        placeholders.push(placeholder);
        editor.view.dispatch(
          editor.state.tr.setMeta(imageUploadPlaceholderKey, {
            add: {
              id,
              pos: insertionPos,
              previewUrl,
              name: file.name || `Image ${index + 1}`,
              order: index,
              retry: () => {
                if (placeholder.status !== "failed") return;
                void processQueue(index);
              },
            },
          }),
        );
      });

      const uploadOne = async (placeholder: PendingImage) => {
        const { file } = placeholder;
        setPlaceholderStatus(placeholder, "uploading");
        try {
          const intent = placeholder.intent!;
          const dimensionsPromise = createImageBitmap(file)
            .then((bitmap) => {
              const dimensions = { width: bitmap.width, height: bitmap.height };
              bitmap.close();
              return dimensions;
            })
            .catch(() => ({}));
          const { error } = await supabaseBrowser.storage
            .from(intent.bucket)
            .upload(intent.path, await file.arrayBuffer(), {
              contentType: file.type,
              cacheControl: "0",
              upsert: false,
            });
          if (error) throw error;
          const dimensions = await dimensionsPromise;
          await registerNoteAsset(noteSlug, {
            path: intent.path,
            type: file.type,
            size: file.size,
            ...dimensions,
          });
          const url = `/api/files/${intent.path
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`;
          placeholder.ready = { url, ...dimensions };
          return true;
        } catch (error) {
          if (placeholder.intent) await cancelUploadIntents(note.space_id, [placeholder.intent.path]).catch(() => undefined);
          setPlaceholderStatus(placeholder, "failed");
          toast.error(
            error instanceof Error
              ? `${error.message}. Select retry on the image.`
              : "Image upload failed. Select retry on the image.",
          );
          return false;
        }
      };

      processQueue = async (startIndex: number) => {
        if (imageUploadBusyRef.current) {
          toast.info("Another image is uploading in the background");
          return;
        }
        imageUploadBusyRef.current = true;
        setIsUploadingImage(true);
        let allComplete = true;
        try {
          const pending = placeholders
            .slice(startIndex)
            .filter((item) => item.status !== "complete" && !item.ready);
          const intents = await createUploadIntents(
            note.space_id,
            pending.map(({ file }) => ({
              name: file.name || "pasted-image.png",
              size: file.size,
              type: file.type,
            })),
          );
          pending.forEach((item, index) => {
            item.intent = intents[index];
          });
          let next = 0;
          const flushReady = () => {
            if (
              editor.isDestroyed ||
              placeholders.some(
                (item) => item.status !== "complete" && !item.ready,
              )
            )
              return;
            const pendingInsertion = placeholders.filter(
              (item) => item.status !== "complete",
            );
            if (!pendingInsertion.length) return;
            const position = removePlaceholder(pendingInsertion[0]);
            pendingInsertion.slice(1).forEach(removePlaceholder);
            editor
              .chain()
              .insertContentAt(
                position,
                pendingInsertion.map((item) => ({
                  type: "image",
                  attrs: {
                    src: item.ready!.url,
                    alt: item.file.name || "Pasted image",
                    align: "left",
                    width: item.ready!.width,
                    height: item.ready!.height,
                  },
                })),
              )
              .run();
            pendingInsertion.forEach((item) => {
              item.status = "complete";
            });
          };
          await Promise.all(
            Array.from({ length: Math.min(3, pending.length) }, async () => {
              while (next < pending.length && !editor.isDestroyed) {
                const item = pending[next++];
                if (!(await uploadOne(item))) allComplete = false;
                flushReady();
              }
            }),
          );
          flushReady();
        } catch (error) {
          allComplete = false;
          placeholders
            .filter((item) => item.status !== "complete" && !item.ready)
            .forEach((item) => setPlaceholderStatus(item, "failed"));
          toast.error(
            error instanceof Error
              ? error.message
              : "Image reservation failed. Select retry.",
          );
        } finally {
          imageUploadBusyRef.current = false;
          setIsUploadingImage(false);
        }

        if (
          allComplete &&
          placeholders.every((item) => item.status === "complete")
        ) {
          toast.success(
            placeholders.length === 1
              ? "Image uploaded"
              : `${placeholders.length} images uploaded in order`,
          );
        }
      };

      await processQueue(0);
    },
    [canEdit, editor, note.space_id, noteSlug],
  );

  useEffect(() => {
    pasteImageHandlerRef.current = (files) => {
      void uploadInlineImages(files);
    };
    return () => {
      pasteImageHandlerRef.current = () => undefined;
    };
  }, [uploadInlineImages]);

  // Drag and drop event listeners
  useEffect(() => {
    if (!canEdit || !editor) return;

    let dragDepth = 0;
    const containsFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types || []).includes("Files");

    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      const images = getClipboardImages(event.clipboardData);
      if (!images.length) return;
      event.preventDefault();
      void uploadInlineImages(images);
    };
    const onDragEnter = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      dragDepth += 1;
      setIsDraggingImage(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (event.relatedTarget === null) dragDepth = 0;
      if (dragDepth === 0) setIsDraggingImage(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      dragDepth = 0;
      setIsDraggingImage(false);

      const files = Array.from(event.dataTransfer?.files || []);
      const images = files.filter((file) => file.type.startsWith("image/"));
      if (!images.length) {
        toast.error("Only images can be dropped into a note");
        return;
      }
      if (images.length !== files.length) {
        toast.info("Only image files were added to the note");
      }

      const position = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      })?.pos;
      if (position !== undefined) {
        editor.chain().focus().setTextSelection(position).run();
      }
      void uploadInlineImages(images);
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [canEdit, editor, uploadInlineImages]);

  const setContentAlignment = (align: ImageAlignment) => {
    if (!editor) return;
    if (editor.isActive("image")) {
      editor.chain().focus().updateAttributes("image", { align }).run();
      requestAnimationFrame(() => {
        const selectedImage = editor.view.dom.querySelector(
          '[data-resize-container].ProseMirror-selectednode .note-image, .note-image.ProseMirror-selectednode',
        );
        selectedImage?.setAttribute("data-align", align);
      });
      return;
    }
    editor.chain().focus().setTextAlign(align).run();
  };

  const isAlignmentActive = (align: ImageAlignment) =>
    Boolean(
      editor?.isActive("image", { align }) ||
        editor?.isActive({ textAlign: align }),
    );

  const currentStyleLabel = useMemo(() => {
    if (!editor) return "Normal text";
    if (editor.isActive("heading", { level: 1 })) return "Heading 1";
    if (editor.isActive("heading", { level: 2 })) return "Heading 2";
    if (editor.isActive("heading", { level: 3 })) return "Heading 3";
    return "Normal text";
  }, [editor]);

  // Locked Note Guard
  if (note.is_locked && !note.is_owner) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 bg-background">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold">This note is private</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Only its creator can open and edit it.
          </p>
          <Button
            className="mt-5"
            variant="outline"
            onClick={() => router.push(`/${roomSlug}`)}
          >
            Back to room
          </Button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors selection:bg-orange-500/20">
      {/* Dragging Image Drop Overlay */}
      {isDraggingImage && canEdit && (
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-6 backdrop-blur">
          <div className="rounded-3xl border-2 border-dashed border-orange-500 bg-background px-10 py-8 text-center shadow-2xl">
            <ImagePlus className="mx-auto h-7 w-7 text-orange-600 dark:text-orange-400" />
            <p className="mt-3 text-base font-semibold text-orange-600 dark:text-orange-400">
              Drop images into this note
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Release anywhere to insert them
            </p>
          </div>
        </div>
      )}

      {/* Focus Mode Exit Pill */}
      {isFocusMode && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsFocusMode(false)}
            className="h-8 gap-1.5 rounded-full px-3 text-xs shadow-md border bg-background/90 backdrop-blur hover:bg-muted"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            <span>Exit Focus (Esc)</span>
          </Button>
        </div>
      )}

      {/* Top Application Header (Hidden in Focus Mode) */}
      {!isFocusMode && (
        <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur-xl shadow-2xs">
          <header className="border-b border-border/40">
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-3 sm:px-6">
              {/* Left: Unified Navigation Breadcrumb */}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Link
                  href={`/${roomSlug}`}
                  className="flex min-w-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Back to room"
                  title={roomSlug ? `Room ${roomSlug}` : "Back to space"}
                  onClick={() => {
                    serializeDraft();
                    if (dirtyRef.current) void performSave();
                  }}
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {roomSlug ? `Room ${roomSlug}` : "Back to space"}
                  </span>
                </Link>
              </div>

              {/* Right: Status badge, Share CTA, Theme, and Note Options */}
              <div className="flex shrink-0 items-center gap-2">
                {/* Truthful Save Status Indicator */}
                {canEdit ? (
                  <div className="flex items-center">
                    {saveState === "saving" && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground animate-pulse">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
                        <span className="hidden sm:inline">Saving…</span>
                      </span>
                    )}
                    {saveState === "unsaved" && (
                      <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                        <span className="hidden sm:inline">Changes pending</span>
                      </span>
                    )}
                    {saveState === "saved" && (
                      <span
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                        title="Saved to room. Saved outside Woff to keep indefinitely."
                      >
                        <Check className="h-3.5 w-3.5 text-green-500" />
                        <span className="hidden sm:inline">Saved in this space</span>
                      </span>
                    )}
                    {saveState === "offline" && (
                      <span
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                        title="Device is offline. Edits are saved on this computer."
                      >
                        <CloudOff className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="hidden sm:inline">Saved locally</span>
                      </span>
                    )}
                    {saveState === "error" && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={() => void performSave()}
                        className="h-auto p-0 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                        title="Click to retry saving"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span>Couldn&apos;t save · Retry</span>
                      </Button>
                    )}
                    {saveState === "conflict" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setConflictOpen(true)}
                        className="h-auto flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/20"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Conflict · Resolve</span>
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <Lock className="h-3.5 w-3.5" />
                    <span>Read only</span>
                  </span>
                )}

                {/* Theme Toggler */}
                <AnimatedThemeToggler className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" />

                {/* Primary Action: Share */}
                <Button
                  size="sm"
                  className="h-8 gap-1.5 px-3 font-medium shadow-xs"
                  onClick={() => setShareOpen(true)}
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Share</span>
                </Button>

                {/* Note Options Dropdown */}
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      aria-label="Note options"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-56"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                  >
                    {canEdit && (
                      <>
                        <DropdownMenuItem
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void performSave()}
                          className="flex items-center justify-between"
                        >
                          <span className="flex items-center gap-2">
                            <Save className="h-4 w-4 text-muted-foreground" />
                            <span>Save now</span>
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Ctrl+S
                          </span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}

                    {/* Export Submenu */}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger
                        onMouseDown={(e) => e.preventDefault()}
                        className="flex items-center gap-2"
                      >
                        <Download className="h-4 w-4 text-muted-foreground" />
                        <span>Export</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-52">
                        <DropdownMenuItem
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={handleDownloadMarkdown}
                        >
                          <FileDown className="h-4 w-4 text-muted-foreground" />
                          <span>Markdown (.md)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={handleDownloadPlainText}
                        >
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span>Plain Text (.txt)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={triggerPrintNote}
                          className="flex items-center justify-between"
                        >
                          <span className="flex items-center gap-2">
                            <Printer className="h-4 w-4 text-muted-foreground" />
                            <span>Print / PDF</span>
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Ctrl+P
                          </span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void handleCopyMarkdown()}
                        >
                          <Copy className="h-4 w-4 text-muted-foreground" />
                          <span>Copy as Markdown</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void handleCopyPlainText()}
                        >
                          <Copy className="h-4 w-4 text-muted-foreground" />
                          <span>Copy Plain Text</span>
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator />

                    {/* Mode Toggle */}
                    <DropdownMenuItem
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSwitchMode(mode === "rich" ? "raw" : "rich")}
                      className="flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        {mode === "rich" ? (
                          <>
                            <Code2 className="h-4 w-4 text-muted-foreground" />
                            <span>Raw Markdown</span>
                          </>
                        ) : (
                          <>
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span>Rich Text Editor</span>
                          </>
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Ctrl+/
                      </span>
                    </DropdownMenuItem>

                    {/* Width Toggle */}
                    <DropdownMenuItem
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setIsWideWidth((w) => !w)}
                    >
                      <span className="flex items-center gap-2">
                        <Type className="h-4 w-4 text-muted-foreground" />
                        <span>{isWideWidth ? "Standard Width (768px)" : "Wide Width (1024px)"}</span>
                      </span>
                    </DropdownMenuItem>

                    {/* Focus Mode */}
                    <DropdownMenuItem
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setIsFocusMode((f) => !f)}
                      className="flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <Maximize2 className="h-4 w-4 text-muted-foreground" />
                        <span>Focus Mode</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Ctrl+Shift+F
                      </span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    {/* Note Information */}
                    <DropdownMenuItem
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setInfoOpen(true)}
                    >
                      <Info className="h-4 w-4 text-muted-foreground" />
                      <span>Note Information</span>
                    </DropdownMenuItem>

                    {/* Lock Note */}
                    {canEdit && (
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setLockDialogOpen(true)}
                      >
                        <Lock className="h-4 w-4 text-muted-foreground" />
                        <span>{note.is_locked ? "Share Note with Room" : "Make Note Private"}</span>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          {/* Grouped Formatting Toolbar */}
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-1.5 sm:px-6">
            {mode === "rich" && canEdit && editor ? (
              <div className="flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex min-w-max items-center gap-1">
                  {/* Group 1: Undo / Redo */}
                  <ToolbarButton
                    label="Undo"
                    shortcut="Ctrl+Z"
                    disabled={!editor.can().undo()}
                    onClick={() => editor.chain().focus().undo().run()}
                  >
                    <Undo2 className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton
                    label="Redo"
                    shortcut="Ctrl+Y"
                    disabled={!editor.can().redo()}
                    onClick={() => editor.chain().focus().redo().run()}
                  >
                    <Redo2 className="h-4 w-4" />
                  </ToolbarButton>

                  <span className="mx-1 h-4 w-px bg-border/60" />

                  {/* Group 2: Text Style Dropdown */}
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        className="h-8 flex items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Text style"
                      >
                        <span>{currentStyleLabel}</span>
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="w-44"
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().setParagraph().run()}
                        className="flex items-center justify-between text-xs"
                      >
                        <span>Normal text</span>
                        <span className="font-mono text-[10px] text-muted-foreground">Ctrl+Alt+0</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        className="flex items-center justify-between text-xs font-bold"
                      >
                        <span>Heading 1</span>
                        <span className="font-mono text-[10px] text-muted-foreground">Ctrl+Alt+1</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        className="flex items-center justify-between text-xs font-semibold"
                      >
                        <span>Heading 2</span>
                        <span className="font-mono text-[10px] text-muted-foreground">Ctrl+Alt+2</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                        className="flex items-center justify-between text-xs font-medium"
                      >
                        <span>Heading 3</span>
                        <span className="font-mono text-[10px] text-muted-foreground">Ctrl+Alt+3</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <span className="mx-1 h-4 w-px bg-border/60" />

                  {/* Group 3: Bold / Italic */}
                  <ToolbarButton
                    label="Bold"
                    shortcut="Ctrl+B"
                    active={editor.isActive("bold")}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                  >
                    <Bold className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton
                    label="Italic"
                    shortcut="Ctrl+I"
                    active={editor.isActive("italic")}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                  >
                    <Italic className="h-4 w-4" />
                  </ToolbarButton>

                  <span className="mx-1 h-4 w-px bg-border/60" />

                  {/* Group 4: Lists Dropdown */}
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        className={`h-8 flex items-center gap-1 rounded-md px-2 text-xs ${
                          editor.isActive("bulletList") ||
                          editor.isActive("orderedList") ||
                          editor.isActive("taskList")
                            ? "bg-foreground text-background font-medium hover:bg-foreground hover:text-background"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                        title="Lists"
                      >
                        <List className="h-4 w-4" />
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="w-44"
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className="flex items-center gap-2 text-xs"
                      >
                        <List className="h-4 w-4 text-muted-foreground" />
                        <span>Bullet list</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        className="flex items-center gap-2 text-xs"
                      >
                        <ListOrdered className="h-4 w-4 text-muted-foreground" />
                        <span>Numbered list</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().toggleTaskList().run()}
                        className="flex items-center gap-2 text-xs"
                      >
                        <ListChecks className="h-4 w-4 text-muted-foreground" />
                        <span>Checklist</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Group 5: Link */}
                  <ToolbarButton
                    label="Add link"
                    shortcut="Ctrl+K"
                    active={editor.isActive("link")}
                    onClick={() => {
                      setLinkValue(editor.getAttributes("link").href || "");
                      setLinkOpen(true);
                    }}
                  >
                    <Link2 className="h-4 w-4" />
                  </ToolbarButton>
                  {editor.isActive("link") && (
                    <ToolbarButton
                      label="Remove link"
                      onClick={() => editor.chain().focus().unsetLink().run()}
                    >
                      <Unlink className="h-4 w-4 text-orange-500" />
                    </ToolbarButton>
                  )}

                  <span className="mx-1 h-4 w-px bg-border/60" />

                  {/* Group 6: Insert Menu */}
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        className="h-8 flex items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Insert block"
                      >
                        <span>Insert</span>
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="w-44"
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => imageInputRef.current?.click()}
                        disabled={isUploadingImage}
                        className="flex items-center gap-2 text-xs"
                      >
                        <ImagePlus className="h-4 w-4 text-muted-foreground" />
                        <span>Image</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        className="flex items-center gap-2 text-xs"
                      >
                        <Quote className="h-4 w-4 text-muted-foreground" />
                        <span>Quote</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                        className="flex items-center gap-2 text-xs"
                      >
                        <Code2 className="h-4 w-4 text-muted-foreground" />
                        <span>Code block</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().setHorizontalRule().run()}
                        className="flex items-center gap-2 text-xs"
                      >
                        <Minus className="h-4 w-4 text-muted-foreground" />
                        <span>Horizontal rule</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Group 7: More Formatting Dropdown */}
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        className="h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="More formatting"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="w-48"
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="flex items-center gap-2">
                          <UnderlineIcon className="h-4 w-4 text-muted-foreground" />
                          <span>Underline</span>
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">Ctrl+U</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="flex items-center gap-2">
                          <Strikethrough className="h-4 w-4 text-muted-foreground" />
                          <span>Strikethrough</span>
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">Ctrl+Shift+X</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor.chain().focus().toggleCode().run()}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="flex items-center gap-2">
                          <Code2 className="h-4 w-4 text-muted-foreground" />
                          <span>Inline code</span>
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">Ctrl+E</span>
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setContentAlignment("left")}
                        className="flex items-center gap-2 text-xs"
                      >
                        <AlignLeft className="h-4 w-4 text-muted-foreground" />
                        <span>Align left</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setContentAlignment("center")}
                        className="flex items-center gap-2 text-xs"
                      >
                        <AlignCenter className="h-4 w-4 text-muted-foreground" />
                        <span>Align center</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setContentAlignment("right")}
                        className="flex items-center gap-2 text-xs"
                      >
                        <AlignRight className="h-4 w-4 text-muted-foreground" />
                        <span>Align right</span>
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          editor.chain().focus().unsetAllMarks().clearNodes().run()
                        }
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <span>Clear formatting</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => handleSwitchMode("rich")}
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  <span>Return to Rich Text</span>
                </Button>
              </div>
            )}

            {/* In Raw Mode: Wrap toggle and Copy */}
            {mode === "raw" && (
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant={wordWrap ? "secondary" : "ghost"}
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setWordWrap(!wordWrap)}
                  title="Toggle line wrapping"
                >
                  <WrapText className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{wordWrap ? "Wrapped" : "No Wrap"}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => void handleCopyMarkdown()}
                  title="Copy markdown content"
                >
                  {copiedRaw ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{copiedRaw ? "Copied" : "Copy"}</span>
                </Button>
              </div>
            )}
          </div>

          {/* Contextual Image Inspector (Appears when an image node is selected) */}
          {mode === "rich" && editor?.isActive("image") && canEdit && (
            <div className="border-t border-border/40 bg-muted/40 py-1 px-3 sm:px-6">
              <div className="mx-auto flex max-w-5xl items-center gap-2 text-xs">
                <span className="font-semibold text-orange-600 dark:text-orange-400 mr-1 flex items-center gap-1">
                  <ImagePlus className="h-3.5 w-3.5" /> Image:
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setContentAlignment("left")}
                  className={`h-7 w-7 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted ${
                    isAlignmentActive("left") ? "bg-muted text-foreground font-bold" : ""
                  }`}
                  title="Align left"
                >
                  <AlignLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setContentAlignment("center")}
                  className={`h-7 w-7 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted ${
                    isAlignmentActive("center") ? "bg-muted text-foreground font-bold" : ""
                  }`}
                  title="Align center"
                >
                  <AlignCenter className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setContentAlignment("right")}
                  className={`h-7 w-7 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted ${
                    isAlignmentActive("right") ? "bg-muted text-foreground font-bold" : ""
                  }`}
                  title="Align right"
                >
                  <AlignRight className="h-3.5 w-3.5" />
                </Button>
                <span className="mx-1 h-3.5 w-px bg-border/60" />
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleOpenAltDialog}
                  className="h-7 flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                  title="Edit image alt text"
                >
                  <Tag className="h-3 w-3" />
                  <span>Alt text</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editor.chain().focus().deleteSelection().run()}
                  className="h-7 flex items-center gap-1 rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-500/10 hover:text-red-600 ml-auto"
                  title="Remove image"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Remove</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Document Canvas */}
      <main
        className={`mx-auto w-full px-4 sm:px-8 py-6 transition-all duration-300 ${
          isWideWidth ? "max-w-5xl" : "max-w-3xl"
        }`}
      >
        {/* Persistent Draft Recovery Banner */}
        {recoveryDraft && (
          <div className="note-recovery-banner mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2.5">
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                An unsaved local draft was found from {formatTimeAgo(recoveryDraft.savedAt)}.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={discardDraft}
              >
                Discard
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600"
                onClick={restoreDraft}
              >
                Restore Draft
              </Button>
            </div>
          </div>
        )}

        {/* Document Body Surface */}
        <article className="min-h-[calc(100vh-14rem)] pb-44">
          {/* In-Canvas Document Title */}
          <div className="mb-6 pt-2">
            <input
              value={title}
              onChange={(e) => updateTitle(e.target.value)}
              disabled={!canEdit}
              aria-label="Note title"
              placeholder="Untitled note"
              className="w-full bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/35 sm:text-4xl text-foreground"
            />
          </div>

          {/* Mode Switch: Rich Editor vs Raw Markdown */}
          {mode === "rich" ? (
            <EditorContent
              editor={editor}
              className={`note-editor-content min-h-[50vh] ${
                isUploadingImage ? "note-editor-content--uploading" : ""
              }`}
            />
          ) : (
            <div className="flex font-mono text-sm leading-6 min-h-[50vh] rounded-lg border bg-zinc-50/50 dark:bg-zinc-950/60 text-foreground overflow-hidden">
              {/* Line numbers gutter */}
              <div className="select-none py-4 pl-3 pr-2.5 text-right text-xs text-muted-foreground/40 border-r border-border/50 shrink-0 font-mono">
                {rawLines.map((_, i) => (
                  <div key={i} className="leading-6">
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* Monospace editor */}
              {canEdit ? (
                <textarea
                  ref={rawTextareaRef}
                  value={rawContent}
                  onChange={(e) => handleRawContentChange(e.target.value)}
                  placeholder="Start typing in Markdown format…"
                  spellCheck={false}
                  className={`w-full flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-6 outline-none text-foreground placeholder:text-muted-foreground/40 ${
                    wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre overflow-x-auto"
                  }`}
                />
              ) : (
                <pre
                  className={`w-full flex-1 p-4 font-mono text-sm leading-6 text-foreground ${
                    wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre overflow-x-auto"
                  }`}
                >
                  <code>{rawContent || "Empty note"}</code>
                </pre>
              )}
            </div>
          )}
        </article>

        {/* Subtle Document Footer (Word Count) */}
        {!isFocusMode && (
          <div className="note-editor-footer border-t border-border/40 py-4 text-right text-xs text-muted-foreground">
            <span>
              {mode === "raw" ? `${rawLines.length} lines · ` : ""}
              {stats.words} words · {stats.characters} characters
            </span>
          </div>
        )}
      </main>

      {/* Hidden File Input for Image Uploads */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          if (files.length) void uploadInlineImages(files);
          event.target.value = "";
        }}
      />

      {/* Link Dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a link</DialogTitle>
            <DialogDescription>Paste a complete web address or email link.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            placeholder="https://example.com"
            onKeyDown={(event) => {
              if (event.key === "Enter") applyLink();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyLink}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Alt Text Dialog */}
      <Dialog open={altDialogOpen} onOpenChange={setAltDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Image Description (Alt Text)</DialogTitle>
            <DialogDescription>
              Provide an accessible description of this image for screen readers.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={altTextValue}
            onChange={(e) => setAltTextValue(e.target.value)}
            placeholder="Description of the image…"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleApplyAltText();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAltDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyAltText}>Save Description</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="min-w-0 sm:max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Share Note</DialogTitle>
            <DialogDescription>
              {shareUrl
                ? shareGrantsRoomAccess
                  ? "This invitation opens the note and grants access to the room's shared content until expiry or revocation. Private notes stay private. Only the note's creator can edit it."
                  : "This link works for existing room members. Ask the room owner for an invitation when sharing with someone new. Only the note's creator can edit it."
                : "Preparing a link with the current room permissions."}
            </DialogDescription>
          </DialogHeader>
          {qrCode && (
            <div className="mx-auto overflow-hidden rounded-xl border bg-white p-3 shadow-xs">
              <Image src={qrCode} alt="Note share QR code" width={200} height={200} unoptimized />
            </div>
          )}
          {shareError && <p role="alert" className="text-sm text-muted-foreground">{shareError}</p>}
          {qrFailed && <p className="text-xs text-muted-foreground">QR code unavailable. You can still copy the link.</p>}
          {!shareUrl && !shareError && <Loader2 aria-label="Preparing note link" className="mx-auto h-6 w-6 animate-spin text-orange-500" />}
          <Button disabled={!shareUrl} className="w-full gap-2 mt-2" onClick={() => void copyShareUrl()}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span>{copied ? "Copied Link" : "Copy Note Link"}</span>
          </Button>
        </DialogContent>
      </Dialog>

      {/* Version Conflict Dialog */}
      <Dialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <span>Note Changed Elsewhere</span>
            </DialogTitle>
            <DialogDescription>
              This note was updated in another tab or device. Your local changes are preserved in memory. Choose an action to resolve the conflict.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-3">
            <Button
              className="justify-start gap-2"
              onClick={() => void handleForceOverwrite()}
            >
              <Save className="h-4 w-4" />
              <span>Keep My Edits (Overwrite)</span>
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={handleDownloadMarkdown}
            >
              <Download className="h-4 w-4" />
              <span>Download My Changes (.md)</span>
            </Button>
            <Button
              variant="ghost"
              className="justify-start gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="h-4 w-4" />
              <span>Discard Local Edits & Reload</span>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflictOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note Information Dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span>Note Information</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <div className="flex justify-between border-b pb-2">
              <span>Words</span>
              <span className="font-semibold text-foreground">{stats.words}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Characters</span>
              <span className="font-semibold text-foreground">{stats.characters}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Room</span>
              <span className="max-w-[65%] truncate font-mono font-semibold text-foreground" title={roomSlug}>
                {roomSlug ? `Room ${roomSlug}` : "None"}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Last Updated</span>
              <span className="text-foreground">
                {new Date(note.updated_at).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Permissions</span>
              <span className="text-foreground font-medium">
                {canEdit ? "Creator (Owner)" : "Viewer (Read Only)"}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInfoOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lock Note Dialog */}
      <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span>{note.is_locked ? "Share Note with Room" : "Make Note Private"}</span>
            </DialogTitle>
            <DialogDescription>
              {note.is_locked
                ? "Room members will be able to read this note and its attached images."
                : "Only you can read this note and its attached images. Room members will see a private note placeholder."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLockDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={privacyBusy} onClick={() => void handleToggleLock()}>
              {privacyBusy ? "Saving…" : note.is_locked ? "Share Note" : "Make Private"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
