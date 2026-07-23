"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TiptapLink from "@tiptap/extension-link";
import TiptapImage from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import QRCode from "qrcode";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Lock,
  Quote,
  Redo2,
  Save,
  Share2,
  Strikethrough,
  UnderlineIcon,
  Undo2,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import type { Note } from "@/lib/actions";
import {
  createUploadIntent,
  registerNoteAsset,
  updateNote,
} from "@/lib/actions";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
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
}

type SaveState = "saved" | "unsaved" | "saving" | "error" | "offline";

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition ${
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      } disabled:cursor-not-allowed disabled:opacity-30`}
    >
      {children}
    </button>
  );
}

export function NoteEditor({ noteSlug, initialNote }: NoteEditorProps) {
  const router = useRouter();
  const note = initialNote!;
  const canEdit = Boolean(note?.is_owner);
  const [title, setTitle] = useState(note?.title || "Untitled Note");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [shareOpen, setShareOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [stats, setStats] = useState({ words: 0, characters: 0 });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const versionRef = useRef(note?.version || 1);
  const dirtyRef = useRef(false);
  const mountedRef = useRef(false);
  const draftKey = `woff-note-draft:${noteSlug}`;

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
      TiptapImage.configure({
        allowBase64: false,
        HTMLAttributes: { class: "note-image" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({
        placeholder: canEdit
          ? "Start writing… Markdown shortcuts like “# ” and “- ” work here."
          : "",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    // Server-sanitized HTML is the rendering source of truth. JSON remains a
    // versioned storage format but is never trusted directly from the database.
    content: note?.content || note?.content_json || "",
    onUpdate({ editor: currentEditor }) {
      if (!mountedRef.current || !canEdit) return;
      dirtyRef.current = true;
      setSaveState(navigator.onLine ? "unsaved" : "offline");
      const text = currentEditor.getText();
      setStats({
        words: text.trim() ? text.trim().split(/\s+/).length : 0,
        characters: text.length,
      });
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          html: currentEditor.getHTML(),
          json: currentEditor.getJSON(),
          title,
          savedAt: Date.now(),
        }),
      );
      scheduleSave();
    },
  });

  const performSave = useCallback(
    (snapshot?: { title: string; html: string; json: Record<string, unknown> }) => {
      if (!editor || !canEdit) return Promise.resolve();
      const current =
        snapshot ||
        ({
          title,
          html: editor.getHTML(),
          json: editor.getJSON(),
        } as const);

      saveQueueRef.current = saveQueueRef.current.then(async () => {
        if (!navigator.onLine) {
          setSaveState("offline");
          return;
        }
        setSaveState("saving");
        try {
          const updated = await updateNote(noteSlug, {
            title: current.title,
            content: current.html,
            content_json: current.json,
            version: versionRef.current,
          });
          versionRef.current = updated.version || versionRef.current + 1;
          dirtyRef.current = false;
          setSaveState("saved");
          localStorage.removeItem(draftKey);
        } catch (error) {
          dirtyRef.current = true;
          setSaveState("error");
          toast.error(error instanceof Error ? error.message : "Unable to save note");
        }
      });
      return saveQueueRef.current;
    },
    [canEdit, draftKey, editor, noteSlug, title],
  );

  const scheduleSave = useCallback(() => {
    if (!canEdit) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!editor) return;
      void performSave({
        title,
        html: editor.getHTML(),
        json: editor.getJSON(),
      });
    }, 1000);
  }, [canEdit, editor, performSave, title]);

  useEffect(() => {
    mountedRef.current = true;
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
        const draft = rawDraft ? JSON.parse(rawDraft) : null;
        if (
          draft?.savedAt > new Date(note.updated_at).getTime() &&
          draft.html !== editor.getHTML()
        ) {
          toast("An unsaved local draft was found", {
            duration: 10_000,
            action: {
              label: "Restore",
              onClick: () => {
                editor.commands.setContent(draft.json || draft.html);
                setTitle(draft.title || note.title);
                dirtyRef.current = true;
                setSaveState("unsaved");
              },
            },
          });
        }
      } catch {
        localStorage.removeItem(draftKey);
      }
    }

    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [canEdit, draftKey, editor, note.title, note.updated_at]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
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
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [scheduleSave]);

  useEffect(() => {
    if (!shareOpen) return;
    const url = window.location.href;
    void QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setQrCode);
  }, [shareOpen]);

  const updateTitle = (value: string) => {
    setTitle(value.slice(0, 120));
    dirtyRef.current = true;
    setSaveState("unsaved");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!editor) return;
      void performSave({
        title: value.trim() || "Untitled Note",
        html: editor.getHTML(),
        json: editor.getJSON(),
      });
    }, 1000);
  };

  const copyShareUrl = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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

  const uploadInlineImage = async (file: File) => {
    if (!editor || !canEdit) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Images must be smaller than 20 MB");
      return;
    }

    setIsUploadingImage(true);
    let uploadedPath: string | null = null;
    try {
      const intent = await createUploadIntent(note.space_id, {
        name: file.name,
        size: file.size,
        type: file.type,
      });
      const { error } = await supabaseBrowser.storage
        .from(intent.bucket)
        .upload(intent.path, file, {
          contentType: file.type,
          upsert: false,
        });
      if (error) throw error;
      uploadedPath = intent.path;
      const dimensions = await createImageBitmap(file)
        .then((bitmap) => {
          const result = { width: bitmap.width, height: bitmap.height };
          bitmap.close();
          return result;
        })
        .catch(() => ({}));
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
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (error) {
      if (uploadedPath) {
        await supabaseBrowser.storage.from("files").remove([uploadedPath]);
      }
      toast.error(error instanceof Error ? error.message : "Unable to upload image");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const saveLabel = useMemo(() => {
    switch (saveState) {
      case "saving":
        return "Saving…";
      case "unsaved":
        return "Unsaved";
      case "offline":
        return "Offline draft";
      case "error":
        return "Save failed";
      default:
        return "Saved";
    }
  }, [saveState]);

  if (note.is_locked && !canEdit) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold">This note is locked</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Only its creator can open and edit it.
          </p>
          <Button className="mt-5" variant="outline" onClick={() => router.push(`/${note.space_slug || ""}`)}>
            Back to room
          </Button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-muted/20">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:px-5">
          <Link
            href={`/${note.space_slug || ""}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Back to room"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <input
            value={title}
            onChange={(event) => updateTitle(event.target.value)}
            disabled={!canEdit}
            aria-label="Note title"
            className="min-w-0 flex-1 truncate bg-transparent px-1 text-sm font-semibold outline-none disabled:opacity-100 sm:text-base"
          />
          <span
            className={`hidden text-[11px] sm:inline ${
              saveState === "error" ? "text-red-500" : "text-muted-foreground"
            }`}
            aria-live="polite"
          >
            {saveLabel}
          </span>
          <AnimatedThemeToggler className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" />
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">Share</span>
          </Button>
          {canEdit && (
            <Button
              size="sm"
              className="h-9 gap-1.5"
              disabled={saveState === "saving"}
              onClick={() => void performSave()}
            >
              {saveState === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Save</span>
            </Button>
          )}
        </div>
      </header>

      {canEdit && editor && (
        <div className="sticky top-14 z-30 border-b bg-background/90 backdrop-blur-xl">
          <div className="mx-auto max-w-6xl overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max items-center gap-1">
              <ToolbarButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
                <Undo2 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
                <Redo2 className="h-4 w-4" />
              </ToolbarButton>
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
                <Bold className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
                <Italic className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
                <UnderlineIcon className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
                <Strikethrough className="h-4 w-4" />
              </ToolbarButton>
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarButton label="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
                <Heading1 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                <Heading2 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
                <List className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
                <ListOrdered className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Task list" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
                <ListChecks className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
                <Quote className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
                <Code2 className="h-4 w-4" />
              </ToolbarButton>
              <span className="mx-1 h-5 w-px bg-border" />
              <ToolbarButton label="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
                <AlignLeft className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
                <AlignCenter className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
                <AlignRight className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Add link" active={editor.isActive("link")} onClick={() => {
                setLinkValue(editor.getAttributes("link").href || "");
                setLinkOpen(true);
              }}>
                <Link2 className="h-4 w-4" />
              </ToolbarButton>
              {editor.isActive("link") && (
                <ToolbarButton label="Remove link" onClick={() => editor.chain().focus().unsetLink().run()}>
                  <Unlink className="h-4 w-4" />
                </ToolbarButton>
              )}
              <ToolbarButton label="Upload image" disabled={isUploadingImage} onClick={() => imageInputRef.current?.click()}>
                {isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              </ToolbarButton>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-5xl px-2 py-4 sm:px-6 sm:py-8">
        <article className="min-h-[calc(100vh-11rem)] overflow-hidden rounded-xl border bg-background shadow-sm sm:rounded-2xl">
          <EditorContent
            editor={editor}
            className="note-editor-content min-h-[calc(100vh-11rem)] px-4 py-6 sm:px-10 sm:py-10 md:px-16"
          />
        </article>
        <div className="flex items-center justify-between px-2 py-3 text-[11px] text-muted-foreground">
          <span>{canEdit ? saveLabel : "Read only"}</span>
          <span>{stats.words} words · {stats.characters} characters</span>
        </div>
      </main>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadInlineImage(file);
          event.target.value = "";
        }}
      />

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
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={applyLink}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Share note</DialogTitle>
            <DialogDescription>
              Room members with this link can view the note. Only its creator can edit it.
            </DialogDescription>
          </DialogHeader>
          {qrCode && (
            <div className="mx-auto overflow-hidden rounded-xl border bg-white p-3">
              <Image src={qrCode} alt="Note share QR code" width={220} height={220} unoptimized />
            </div>
          )}
          <Button className="gap-2" onClick={() => void copyShareUrl()}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy note link"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
