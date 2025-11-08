"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowLeft,
  Share,
  MoreHorizontal,
  Bold,
  Italic,
  Link,
  Code,
  Type,
  Save,
  Eye,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  Check,
  X,
  Moon,
  Sun,
  Monitor,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SlashMenu } from "./slash-menu";
import { getNote, updateNote } from "@/lib/actions";

interface NoteEditorProps {
  noteSlug: string;
}

interface Note {
  id: string;
  slug: string;
  title: string;
  content: string;
  public_code: string;
  visibility: "public" | "unlisted" | "private";
  font_family: "system" | "serif" | "mono";
  space_id: string;
  created_by_device_id: string | null;
  created_at: string;
  updated_at: string;
}

export function NoteEditor({ noteSlug }: NoteEditorProps) {
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">(
    "saved"
  );
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [showSelectionBubble, setShowSelectionBubble] = useState(false);
  const [selectionBubblePos, setSelectionBubblePos] = useState({ x: 0, y: 0 });
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuPos, setSlashMenuPos] = useState({ x: 0, y: 0 });
  const [stats, setStats] = useState({ lines: 0, words: 0, sentences: 0 });
  const [showToolbarShare, setShowToolbarShare] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSavedContent, setLastSavedContent] = useState("");
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);

  const { theme, setTheme } = useTheme();

  // Load autosave setting from localStorage
  useEffect(() => {
    const savedAutoSave = localStorage.getItem("woff-autosave-enabled");
    if (savedAutoSave !== null) {
      setAutoSaveEnabled(JSON.parse(savedAutoSave));
    }
  }, []);

  // Save autosave setting to localStorage and clear timeouts when disabled
  useEffect(() => {
    localStorage.setItem(
      "woff-autosave-enabled",
      JSON.stringify(autoSaveEnabled)
    );

    // Clear pending autosave when disabled
    if (!autoSaveEnabled && autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = undefined;
      console.log("🔄 Autosave disabled - cleared pending autosave");
    }
  }, [autoSaveEnabled]);
  const editorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load note from server
  useEffect(() => {
    const loadNote = async () => {
      setIsLoading(true);
      try {
        const fetchedNote = await getNote(noteSlug);
        if (fetchedNote) {
          console.log(
            "📝 Loaded existing note from database:",
            fetchedNote.title
          );
          setNote(fetchedNote);
          setLastSavedContent(fetchedNote.content);
        } else {
          console.log("📝 Note not found in database, creating new note");
          // Create a new note that will be saved to database on first save
          const mockNote: Note = {
            id: `mock-${noteSlug}`,
            slug: noteSlug,
            title: "Untitled Note",
            content: "",
            public_code: generateShortCode(),
            visibility: "unlisted",
            font_family: "system",
            space_id: "mock-space",
            created_by_device_id: "mock-device",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          setNote(mockNote);
          setLastSavedContent(mockNote.content);
        }
      } catch (error) {
        console.error("Failed to load note:", error);
        // Create new note on error too
        const mockNote: Note = {
          id: `mock-${noteSlug}`,
          slug: noteSlug,
          title: "Untitled Note",
          content: "",
          public_code: generateShortCode(),
          visibility: "unlisted",
          font_family: "system",
          space_id: "mock-space",
          created_by_device_id: "mock-device",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setNote(mockNote);
        setLastSavedContent(mockNote.content);
      }
      setIsLoading(false);
    };

    loadNote();
  }, [noteSlug, router]);

  // Helper function to generate short codes
  const generateShortCode = () => {
    return Math.random().toString(36).substr(2, 5).toUpperCase();
  };

  // Save cursor position
  const saveCursorPosition = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !editorRef.current) return null;

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editorRef.current);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    const caretOffset = preCaretRange.toString().length;

    return {
      offset: caretOffset,
      length: range.toString().length,
    };
  }, []);

  // Restore cursor position
  const restoreCursorPosition = useCallback(
    (position: { offset: number; length: number } | null) => {
      if (!position || !editorRef.current) return;

      const selection = window.getSelection();
      if (!selection) return;

      try {
        const range = document.createRange();
        let currentOffset = 0;
        let startNode: Node | null = null;
        let startOffset = 0;
        let endNode: Node | null = null;
        let endOffset = 0;

        // Walk through all text nodes to find the position
        const walker = document.createTreeWalker(
          editorRef.current,
          NodeFilter.SHOW_TEXT,
          null
        );

        let node;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length || 0;

          if (!startNode && currentOffset + nodeLength >= position.offset) {
            startNode = node;
            startOffset = position.offset - currentOffset;
          }

          if (
            !endNode &&
            currentOffset + nodeLength >= position.offset + position.length
          ) {
            endNode = node;
            endOffset = position.offset + position.length - currentOffset;
            break;
          }

          currentOffset += nodeLength;
        }

        if (startNode) {
          range.setStart(startNode, startOffset);
          if (endNode && position.length > 0) {
            range.setEnd(endNode, endOffset);
          } else {
            range.collapse(true);
          }

          selection.removeAllRanges();
          selection.addRange(range);
        }
      } catch (error) {
        console.warn("Failed to restore cursor position:", error);
      }
    },
    []
  );

  // Scroll detection for toolbar share button
  useEffect(() => {
    const handleScroll = () => {
      // Show toolbar share button when scrolled past ~150px (roughly past the header)
      const scrollThreshold = 150;
      setShowToolbarShare(window.scrollY > scrollThreshold);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Manual save function
  const saveNote = useCallback(async () => {
    if (!note) {
      console.log("💾 No note to save");
      return;
    }

    console.log("💾 Manual save triggered for:", note.title);
    setSaveStatus("saving");
    setIsSaving(true);

    // Clear any pending autosave
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = undefined;
    }

    try {
      if (note.id.startsWith("mock-")) {
        // This is a new note that needs to be created in the database
        console.log("💾 Creating new note in database...");

        try {
          console.log("💾 Starting new note creation process...");

          // Step 1: Create space
          console.log("💾 Step 1: Creating new space...");
          const { createSpace } = await import("@/lib/actions");
          const newSpace = await createSpace();
          console.log("💾 ✅ Space created:", newSpace);

          // Step 2: Create note entry
          console.log("💾 Step 2: Creating note entry...");
          const { createNoteEntry } = await import("@/lib/actions");
          const noteResult = await createNoteEntry(newSpace.id, note.title);
          console.log("💾 ✅ Note entry created:", noteResult);

          // Step 3: Update note with content
          console.log("💾 Step 3: Updating note with content...");
          const updatedNote = await updateNote(noteResult.noteSlug, {
            title: note.title,
            content: note.content,
            visibility: note.visibility,
            font_family: note.font_family,
          });
          console.log("💾 ✅ Note updated with content:", updatedNote);

          // Step 4: Update local state
          console.log("💾 Step 4: Updating local state...");
          setNote({
            ...updatedNote,
            public_code: noteResult.publicCode,
            space_id: newSpace.id,
          });

          // Step 5: Update URL
          console.log("💾 Step 5: Updating URL...");
          const newUrl = `/n/${noteResult.noteSlug}`;
          if (window.location.pathname !== newUrl) {
            window.history.replaceState({}, "", newUrl);
            console.log("💾 ✅ URL updated to:", newUrl);
          }

          console.log("💾 🎉 Note creation completed successfully!");
        } catch (createError) {
          console.error("💾 ❌ Error in note creation process:", createError);
          console.error(
            "💾 Error stack:",
            createError instanceof Error ? createError.stack : createError
          );
          throw createError;
        }
      } else {
        // This is an existing note, just update it
        console.log("💾 Updating existing note...");
        const updatedNote = await updateNote(note.slug, {
          title: note.title,
          content: note.content,
          visibility: note.visibility,
          font_family: note.font_family,
        });

        console.log("💾 Note updated successfully");
        setNote(updatedNote);
      }

      console.log("💾 Save completed successfully");
      setSaveStatus("saved");

      // Update lastSavedContent to prevent unnecessary autosaves
      setLastSavedContent(note.content);

      // Show "Saved" briefly then fade
      setTimeout(() => {
        setSaveStatus("saved");
      }, 2000);
    } catch (error) {
      console.error("💾 Failed to save note:", error);
      setSaveStatus("error");

      // Show error message to user
      console.error("Save error details:", error);
    } finally {
      setIsSaving(false);
    }
  }, [note]);

  // Autosave function
  const autoSave = useCallback(
    async (noteToSave: Note) => {
      if (
        !autoSaveEnabled ||
        !noteToSave ||
        noteToSave.content === lastSavedContent
      ) {
        return; // No changes to save or autosave disabled
      }

      console.log("🔄 Autosave triggered for:", noteToSave.title);
      setIsAutoSaving(true);

      // Save cursor position before autosave
      const cursorPosition = saveCursorPosition();

      try {
        if (noteToSave.id.startsWith("mock-")) {
          // For mock notes, we'll save them when user manually saves
          console.log(
            "🔄 Mock note - autosave skipped, will save on manual save"
          );
          setLastSavedContent(noteToSave.content);
        } else {
          // Update existing note
          console.log("🔄 Autosaving to database...");
          const updatedNote = await updateNote(noteToSave.slug, {
            title: noteToSave.title,
            content: noteToSave.content,
            visibility: noteToSave.visibility,
            font_family: noteToSave.font_family,
          });

          console.log("🔄 Autosave completed successfully");
          setLastSavedContent(noteToSave.content);

          // Update local state with server response
          setNote((prev) => (prev ? { ...prev, ...updatedNote } : null));
        }

        setSaveStatus("saved");
      } catch (error) {
        console.error("🔄 Autosave failed:", error);
        setSaveStatus("error");
      } finally {
        setIsAutoSaving(false);

        // Restore cursor position after a brief delay
        setTimeout(() => {
          restoreCursorPosition(cursorPosition);
        }, 10);
      }
    },
    [
      autoSaveEnabled,
      lastSavedContent,
      saveCursorPosition,
      restoreCursorPosition,
    ]
  );

  // Calculate editor statistics
  const calculateStats = useCallback(() => {
    if (!editorRef.current) return;

    const textContent = editorRef.current.textContent || "";

    // Count lines by counting block elements and line breaks
    let lines = 0;
    if (textContent.trim() === "") {
      lines = 0;
    } else {
      // Count block elements (p, div, h1-h6, blockquote, pre, li) and br tags
      const blockElements = editorRef.current.querySelectorAll(
        "p, div, h1, h2, h3, h4, h5, h6, blockquote, pre, li"
      );
      const brElements = editorRef.current.querySelectorAll("br");

      // If we have block elements, count them (excluding empty ones)
      if (blockElements.length > 0) {
        lines = Array.from(blockElements).filter((el) => {
          const text = el.textContent?.trim() || "";
          return text.length > 0;
        }).length;
      } else {
        // Fallback: count by text lines if no block elements
        const textLines = textContent
          .split("\n")
          .filter((line) => line.trim().length > 0);
        lines = Math.max(textLines.length, 1);
      }

      // Add extra lines for standalone br elements (not inside block elements)
      const standaloneBrs = Array.from(brElements).filter((br) => {
        const parent = br.parentElement;
        return parent && parent === editorRef.current;
      });
      lines += standaloneBrs.length;

      // Ensure at least 1 line if there's content
      lines = Math.max(lines, textContent.trim() ? 1 : 0);
    }

    // Count words (split by whitespace, filter out empty strings)
    const words =
      textContent.trim() === ""
        ? 0
        : textContent
            .trim()
            .split(/\s+/)
            .filter((word) => word.length > 0).length;

    // Count sentences (split by sentence endings, filter out empty strings)
    const sentences =
      textContent.trim() === ""
        ? 0
        : textContent
            .split(/[.!?]+/)
            .filter((sentence) => sentence.trim().length > 0).length;

    setStats({ lines, words, sentences });
  }, []);

  // Handle content changes
  const handleContentChange = useCallback(() => {
    if (!editorRef.current || !note) return;

    const newContent = editorRef.current.innerHTML;
    console.log("📝 Content changing, new length:", newContent.length);

    // Update local state immediately
    setNote((prev) => {
      if (!prev) return null;
      const updated = {
        ...prev,
        content: newContent,
        updated_at: new Date().toISOString(),
      };

      // Clear existing autosave timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      // Set up autosave with debouncing (2 seconds after user stops typing) - only if enabled
      if (autoSaveEnabled) {
        autoSaveTimeoutRef.current = setTimeout(() => {
          console.log("🔄 Triggering autosave after content change");
          autoSave(updated);
        }, 2000);
      }

      return updated;
    });

    calculateStats();

    // Show that content has changed (mark as unsaved) - only if autosave is enabled
    if (
      autoSaveEnabled &&
      saveStatus === "saved" &&
      newContent !== lastSavedContent
    ) {
      setSaveStatus("saving");
    }
  }, [
    note,
    calculateStats,
    autoSave,
    saveStatus,
    lastSavedContent,
    autoSaveEnabled,
  ]);

  // Handle click outside to close slash menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showSlashMenu &&
        editorRef.current &&
        !editorRef.current.contains(e.target as Node)
      ) {
        setShowSlashMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSlashMenu]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    const autoSaveTimeout = autoSaveTimeoutRef.current;
    const saveTimeout = saveTimeoutRef.current;

    return () => {
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
      }
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  }, []);

  // Initialize editor content properly
  useEffect(() => {
    if (note && editorRef.current) {
      // Only set content if it's different and editor is empty or different
      const currentContent = editorRef.current.innerHTML;
      if (currentContent !== note.content) {
        editorRef.current.innerHTML = note.content || "";

        // If content is empty, focus the editor and position cursor properly
        if (!note.content || note.content.trim() === "") {
          editorRef.current.focus();
          const range = document.createRange();
          const sel = window.getSelection();

          if (sel) {
            range.selectNodeContents(editorRef.current);
            range.collapse(true); // Collapse to start
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }

        // Calculate initial stats
        calculateStats();
      }
    }
  }, [note, calculateStats]);

  // Handle link interactions with tooltips
  useEffect(() => {
    if (!editorRef.current) return;

    let tooltipTimeout: NodeJS.Timeout | null = null;
    let currentTooltip: HTMLElement | null = null;

    const showTooltip = (link: HTMLAnchorElement) => {
      // Clear any existing tooltip
      if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
      }

      const href = link.href || link.getAttribute("href") || "";

      // Create simplified tooltip
      const tooltip = document.createElement("div");
      tooltip.className =
        "fixed z-50 bg-popover text-popover-foreground px-3 py-2 rounded-lg shadow-lg text-sm border animate-in fade-in-0 zoom-in-95 duration-200 cursor-pointer hover:bg-accent transition-colors";
      tooltip.innerHTML = `Follow link`;
      tooltip.id = "link-tooltip";

      // Position tooltip closer to the link
      const rect = link.getBoundingClientRect();
      tooltip.style.left = `${rect.left + rect.width / 2}px`;
      tooltip.style.top = `${rect.top - 8}px`;
      tooltip.style.transform = "translate(-50%, -100%)";

      // Make tooltip clickable to follow link
      const handleTooltipClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        let url = href;
        // Ensure the URL has a protocol
        if (
          url &&
          !url.startsWith("http://") &&
          !url.startsWith("https://") &&
          !url.startsWith("mailto:")
        ) {
          url = "https://" + url;
        }

        if (url) {
          hideTooltip();
          window.open(url, "_blank", "noopener,noreferrer");
        }
      };

      // Add event listeners to tooltip
      tooltip.addEventListener("click", handleTooltipClick);

      tooltip.addEventListener("mouseenter", () => {
        if (tooltipTimeout) {
          clearTimeout(tooltipTimeout);
          tooltipTimeout = null;
        }
      });

      tooltip.addEventListener("mouseleave", () => {
        hideTooltip();
      });

      document.body.appendChild(tooltip);
      currentTooltip = tooltip;
    };

    const hideTooltip = () => {
      if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
      }
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
      }
    };

    const handleLinkEnter = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "A") {
        const link = target as HTMLAnchorElement;

        // Clear any hide timeout
        if (tooltipTimeout) {
          clearTimeout(tooltipTimeout);
          tooltipTimeout = null;
        }

        showTooltip(link);
      }
    };

    const handleLinkLeave = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "A") {
        // Only hide if not moving to tooltip
        tooltipTimeout = setTimeout(() => {
          const tooltip = document.getElementById("link-tooltip");
          if (tooltip && !tooltip.matches(":hover")) {
            hideTooltip();
          }
        }, 150);
      }
    };

    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "A") {
        // Prevent direct link clicks - only allow tooltip clicks
        e.preventDefault();
        e.stopPropagation();

        // Show visual feedback that direct clicking is disabled
        const link = target as HTMLAnchorElement;
        link.style.backgroundColor = "rgba(239, 68, 68, 0.1)"; // Red highlight
        setTimeout(() => {
          link.style.backgroundColor = "transparent";
        }, 200);
      }
    };

    const editor = editorRef.current;
    editor.addEventListener("mouseenter", handleLinkEnter, true);
    editor.addEventListener("mouseleave", handleLinkLeave, true);
    editor.addEventListener("click", handleLinkClick);

    return () => {
      editor.removeEventListener("mouseenter", handleLinkEnter, true);
      editor.removeEventListener("mouseleave", handleLinkLeave, true);
      editor.removeEventListener("click", handleLinkClick);

      // Clean up timeouts and tooltips
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
      }
      const tooltip = document.getElementById("link-tooltip");
      if (tooltip) {
        tooltip.remove();
      }
    };
  }, [note]);

  // Handle title editing mode
  const startTitleEdit = () => {
    if (!note) return;
    setTempTitle(note.title);
    setIsEditingTitle(true);

    // Focus and select the input after it renders
    setTimeout(() => {
      if (titleRef.current) {
        titleRef.current.focus();
        titleRef.current.select();
      }
    }, 10);
  };

  const confirmTitleEdit = async () => {
    if (!note || !tempTitle.trim()) return;

    console.log("📝 Title confirmed, saving:", tempTitle);
    setIsSavingTitle(true);

    // Update local state immediately for responsive UI
    setNote((prev) => {
      if (!prev) return null;
      const updated = {
        ...prev,
        title: tempTitle.trim(),
        updated_at: new Date().toISOString(),
      };
      console.log("📝 Note title updated locally:", updated);
      return updated;
    });

    setIsEditingTitle(false);
    setTempTitle("");

    // Save to database in background
    try {
      if (note.id.startsWith("mock-")) {
        console.log("📝 Mock note - title will be saved on next full save");
        // For mock notes, just wait a bit to show the saving state
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else {
        console.log("📝 Saving title to database...");
        const updatedNote = await updateNote(note.slug, {
          title: tempTitle.trim(),
          content: note.content,
          visibility: note.visibility,
          font_family: note.font_family,
        });
        console.log("📝 Title saved to database successfully");

        // Update state with server response
        setNote((prev) => (prev ? { ...prev, ...updatedNote } : null));
      }
    } catch (error) {
      console.error("📝 Failed to save title to database:", error);
      // Could show a toast notification here for user feedback
    } finally {
      setIsSavingTitle(false);
    }
  };

  const cancelTitleEdit = () => {
    console.log("📝 Title edit cancelled");
    setIsEditingTitle(false);
    setTempTitle("");
  };

  // Handle title changes (legacy for direct input)
  const handleTitleChange = (newTitle: string) => {
    console.log("📝 Title changing to:", newTitle);
    if (!note) return;

    setNote((prev) => {
      if (!prev) return null;
      const updated = {
        ...prev,
        title: newTitle,
        updated_at: new Date().toISOString(),
      };
      console.log("📝 Note updated locally:", updated);
      return updated;
    });
  };

  // Handle text selection for formatting bubble
  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setShowSelectionBubble(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (rect.width > 0 && rect.height > 0) {
      setSelectionBubblePos({
        x: rect.left + rect.width / 2,
        y: rect.top - 50,
      });
      setShowSelectionBubble(true);
    }
  }, []);

  // Format commands
  const formatText = (command: string, value?: string) => {
    if (!editorRef.current) return;

    editorRef.current.focus();

    if (command === "formatBlock" && value) {
      // Handle block-level formatting (headings, paragraphs, etc.)
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;

      const range = selection.getRangeAt(0);
      const selectedText = range.toString();

      // If there's selected text, create a new block element with just that text
      if (selectedText.trim()) {
        // Extract the selected content
        const fragment = range.extractContents();

        // Create new element with the desired tag
        const newElement = document.createElement(value.toUpperCase());

        // Add appropriate classes for styling
        if (value === "blockquote") {
          newElement.className =
            "border-l-4 border-primary/30 pl-6 italic my-4";
        } else if (value === "pre") {
          newElement.className =
            "bg-muted border border-border/20 rounded-lg p-4 font-mono text-sm overflow-x-auto my-4 whitespace-pre-wrap";
          newElement.style.whiteSpace = "pre-wrap";
          newElement.style.wordBreak = "break-word";
          newElement.style.overflowWrap = "break-word";
        } else if (value === "p") {
          newElement.className = "leading-relaxed text-foreground mb-4";
        } else if (value.match(/^h[1-6]$/)) {
          const headingClasses = {
            h1: "text-3xl font-bold mt-8 mb-4",
            h2: "text-2xl font-semibold mt-6 mb-3",
            h3: "text-xl font-semibold mt-4 mb-2",
            h4: "text-lg font-medium mt-3 mb-2",
            h5: "text-base font-medium mt-2 mb-1",
            h6: "text-sm font-medium mt-2 mb-1",
          };
          newElement.className =
            headingClasses[value as keyof typeof headingClasses] || "";
        }

        // Add the selected content to the new element
        if (
          fragment.textContent === selectedText &&
          !fragment.querySelector("*")
        ) {
          // Pure text selection
          newElement.textContent = selectedText;
        } else {
          // Complex selection with HTML elements
          newElement.appendChild(fragment);
        }

        // Insert the new element
        range.insertNode(newElement);

        // Position cursor after the new element
        range.setStartAfter(newElement);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);

        // Update content
        setTimeout(() => {
          handleContentChange();
        }, 10);

        return;
      }

      // If no text is selected, format the current block element
      let currentNode = range.startContainer;

      // Find the current block element
      if (currentNode.nodeType === Node.TEXT_NODE) {
        currentNode = currentNode.parentElement || currentNode;
      }

      // Find the closest block element or create one if none exists
      let blockElement: Element | null = null;
      let searchNode = currentNode;

      while (searchNode && searchNode !== editorRef.current) {
        if (
          searchNode instanceof Element &&
          [
            "P",
            "DIV",
            "H1",
            "H2",
            "H3",
            "H4",
            "H5",
            "H6",
            "BLOCKQUOTE",
            "PRE",
          ].includes(searchNode.tagName)
        ) {
          blockElement = searchNode;
          break;
        }
        const parent = searchNode.parentElement;
        if (!parent) break;
        searchNode = parent;
      }

      // If no block element found, create a paragraph wrapper
      if (!blockElement) {
        const p = document.createElement("P");
        if (currentNode.nodeType === Node.TEXT_NODE) {
          const parent = currentNode.parentNode;
          if (parent) {
            parent.insertBefore(p, currentNode);
            p.appendChild(currentNode);
            blockElement = p;
          }
        }
      }

      if (blockElement && blockElement !== editorRef.current) {
        // Get the content and clean it if needed
        let innerHTML = blockElement.innerHTML;

        // If the block contains complex nested structures from pasted content,
        // preserve only the text and basic inline formatting
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = innerHTML;

        // Remove unwanted attributes and classes from pasted content
        const allElements = tempDiv.querySelectorAll("*");
        allElements.forEach((el) => {
          // Remove all attributes except href for links
          const attributes = Array.from(el.attributes);
          attributes.forEach((attr) => {
            if (attr.name !== "href" || el.tagName !== "A") {
              el.removeAttribute(attr.name);
            }
          });

          // Convert div/span to appropriate inline elements if they have formatting
          if (el.tagName === "DIV" || el.tagName === "SPAN") {
            const computedStyle = window.getComputedStyle(el);
            if (
              computedStyle.fontWeight === "bold" ||
              computedStyle.fontWeight >= "600"
            ) {
              const strong = document.createElement("strong");
              strong.innerHTML = el.innerHTML;
              el.parentNode?.replaceChild(strong, el);
            } else if (computedStyle.fontStyle === "italic") {
              const em = document.createElement("em");
              em.innerHTML = el.innerHTML;
              el.parentNode?.replaceChild(em, el);
            }
          }
        });

        innerHTML = tempDiv.innerHTML;

        // Create new element with the desired tag
        const newElement = document.createElement(value.toUpperCase());
        newElement.innerHTML = innerHTML;

        // Add appropriate classes for styling
        if (value === "blockquote") {
          newElement.className =
            "border-l-4 border-primary/30 pl-6 italic my-4";
        } else if (value === "pre") {
          newElement.className =
            "bg-muted border border-border/20 rounded-lg p-4 font-mono text-sm overflow-x-auto my-4 whitespace-pre-wrap";
          newElement.style.whiteSpace = "pre-wrap";
          newElement.style.wordBreak = "break-word";
          newElement.style.overflowWrap = "break-word";
        } else if (value === "p") {
          // Add paragraph classes for consistent styling
          newElement.className = "leading-relaxed text-foreground mb-4";
        } else if (value.match(/^h[1-6]$/)) {
          // Add heading classes
          const headingClasses = {
            h1: "text-3xl font-bold mt-8 mb-4",
            h2: "text-2xl font-semibold mt-6 mb-3",
            h3: "text-xl font-semibold mt-4 mb-2",
            h4: "text-lg font-medium mt-3 mb-2",
            h5: "text-base font-medium mt-2 mb-1",
            h6: "text-sm font-medium mt-2 mb-1",
          };
          newElement.className =
            headingClasses[value as keyof typeof headingClasses] || "";
        }

        // Replace the current element
        if (blockElement.parentElement) {
          blockElement.parentElement.replaceChild(newElement, blockElement);

          // For block elements that shouldn't continue (headings, code, quotes),
          // create a new paragraph after them
          if (
            ["H1", "H2", "H3", "H4", "H5", "H6", "PRE", "BLOCKQUOTE"].includes(
              value.toUpperCase()
            )
          ) {
            const nextP = document.createElement("p");
            nextP.innerHTML = "<br>";
            newElement.parentElement?.insertBefore(
              nextP,
              newElement.nextSibling
            );
          }

          // Set cursor at the end of the new element
          setTimeout(() => {
            const sel = window.getSelection();
            if (sel && newElement) {
              const range = document.createRange();
              range.selectNodeContents(newElement);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }, 10);
        }
      }
    } else {
      // Handle inline formatting (bold, italic, etc.)
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();

        // Only apply formatting if there's selected text
        if (selectedText) {
          try {
            if (command === "createLink" && value) {
              // Special handling for links
              const linkElement = document.createElement("a");
              linkElement.href = value;
              linkElement.textContent = selectedText;
              linkElement.className =
                "text-blue-600 dark:text-blue-400 underline underline-offset-2 decoration-blue-600/40 dark:decoration-blue-400/40 hover:decoration-blue-600 dark:hover:decoration-blue-400 transition-colors hover:text-blue-700 dark:hover:text-blue-300";
              linkElement.style.cursor = "default"; // Changed from pointer to default
              linkElement.contentEditable = "false";
              // Remove target and rel attributes to disable direct clicking
              linkElement.removeAttribute("target");
              linkElement.removeAttribute("rel");

              range.deleteContents();
              range.insertNode(linkElement);

              // Move cursor after the inserted element
              range.setStartAfter(linkElement);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
            } else {
              document.execCommand(command, false, value);
            }
          } catch (error) {
            console.warn("execCommand failed:", error);
            // Fallback for modern browsers
            if (
              command === "bold" ||
              command === "italic" ||
              command === "underline" ||
              command === "strikeThrough"
            ) {
              const elementTag =
                command === "bold"
                  ? "strong"
                  : command === "italic"
                  ? "em"
                  : command === "underline"
                  ? "u"
                  : command === "strikeThrough"
                  ? "s"
                  : "span";

              // Extract the selected content, preserving any existing inline formatting
              const fragment = range.extractContents();
              const element = document.createElement(elementTag);

              // If fragment contains only text, use textContent
              if (
                fragment.textContent === selectedText &&
                !fragment.querySelector("*")
              ) {
                element.textContent = selectedText;
              } else {
                // If fragment contains HTML elements, preserve them
                element.appendChild(fragment);
              }

              range.insertNode(element);

              // Move cursor after the inserted element
              range.setStartAfter(element);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
            } else if (command === "createLink" && value) {
              // Fallback for createLink
              const linkElement = document.createElement("a");
              linkElement.href = value;
              linkElement.textContent = selectedText;
              linkElement.className =
                "text-blue-600 dark:text-blue-400 underline underline-offset-2 decoration-blue-600/40 dark:decoration-blue-400/40 hover:decoration-blue-600 dark:hover:decoration-blue-400 transition-colors hover:text-blue-700 dark:hover:text-blue-300";
              linkElement.style.cursor = "default"; // Changed from pointer to default
              linkElement.contentEditable = "false";
              // Remove target and rel attributes to disable direct clicking
              linkElement.removeAttribute("target");
              linkElement.removeAttribute("rel");

              range.deleteContents();
              range.insertNode(linkElement);

              // Move cursor after the inserted element
              range.setStartAfter(linkElement);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        } else {
          // If no text is selected, don't apply formatting to prevent it from affecting the entire context
          console.log("No text selected for inline formatting");
        }
      }
    }

    // Ensure the editor remains focused and content is updated
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.focus();
        handleContentChange();
      }
    }, 50);

    setShowSelectionBubble(false);
  };

  // Handle list creation (for toolbar buttons)
  const createList = (listType: "ul" | "ol") => {
    if (!editorRef.current) return;

    editorRef.current.focus();

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    let currentNode = range.startContainer;

    // Find the current block element
    if (currentNode.nodeType === Node.TEXT_NODE) {
      currentNode = currentNode.parentElement || currentNode;
    }

    // Find the closest block element
    let blockElement: Element | null = null;
    while (currentNode && currentNode !== editorRef.current) {
      if (
        currentNode instanceof Element &&
        [
          "P",
          "DIV",
          "H1",
          "H2",
          "H3",
          "H4",
          "H5",
          "H6",
          "BLOCKQUOTE",
          "PRE",
        ].includes(currentNode.tagName)
      ) {
        blockElement = currentNode;
        break;
      }
      const parent = currentNode.parentElement;
      if (!parent) break;
      currentNode = parent;
    }

    // If no block element found, create one
    if (!blockElement) {
      blockElement = document.createElement("p");
      const range = selection.getRangeAt(0);
      const textNode = range.startContainer;
      if (textNode.nodeType === Node.TEXT_NODE && textNode.parentNode) {
        textNode.parentNode.insertBefore(blockElement, textNode);
        blockElement.appendChild(textNode);
      }
    }

    if (blockElement && blockElement.parentElement) {
      // Get current text content
      const currentText = blockElement.textContent || "";

      // Create list structure
      const list = document.createElement(listType);
      const listItem = document.createElement("li");

      // Add proper CSS classes for styling
      if (listType === "ul") {
        list.className = "list-disc pl-6 my-4";
      } else {
        list.className = "list-decimal pl-6 my-4";
      }

      listItem.className = "my-1";

      // Set content
      if (currentText.trim()) {
        listItem.textContent = currentText;
      } else {
        listItem.innerHTML = "<br>";
      }

      list.appendChild(listItem);

      // Replace the current block with the list
      blockElement.parentElement.replaceChild(list, blockElement);

      // Position cursor at the end of the list item
      setTimeout(() => {
        const newSel = window.getSelection();
        if (newSel && listItem) {
          const newRange = document.createRange();
          newRange.selectNodeContents(listItem);
          newRange.collapse(false);
          newSel.removeAllRanges();
          newSel.addRange(newRange);
          editorRef.current?.focus();
        }
        handleContentChange();
      }, 10);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyboardShortcuts = (e: React.KeyboardEvent) => {
    // Check for Ctrl/Cmd shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case "b":
          e.preventDefault();
          formatText("bold");
          break;
        case "i":
          e.preventDefault();
          formatText("italic");
          break;
        case "u":
          e.preventDefault();
          formatText("underline");
          break;
        case "s":
          e.preventDefault();
          saveNote();
          break;
        default:
          break;
      }
    }
  };

  // Handle slash menu
  const handleSlashMenu = (e: React.KeyboardEvent) => {
    console.log("🔍 Key pressed:", e.key, "showSlashMenu:", showSlashMenu);
    if (e.key === "/") {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;

      const range = selection.getRangeAt(0);
      const container = range.startContainer;

      // Get text before cursor
      let textBeforeCursor = "";
      if (container.nodeType === Node.TEXT_NODE) {
        textBeforeCursor =
          container.textContent?.substring(0, range.startOffset) || "";
      }

      // Only trigger if at start of line or after whitespace
      const trimmed = textBeforeCursor.trim();
      console.log(
        "🔍 Text before cursor:",
        JSON.stringify(textBeforeCursor),
        "trimmed:",
        JSON.stringify(trimmed)
      );
      if (
        trimmed === "" ||
        textBeforeCursor.endsWith(" ") ||
        textBeforeCursor.endsWith("\n")
      ) {
        console.log("✅ Slash menu should trigger");
        // Small delay to let the "/" character be inserted
        setTimeout(() => {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const r = sel.getRangeAt(0);
            const rect = r.getBoundingClientRect();

            setSlashMenuPos({
              x: rect.left,
              y: rect.bottom + 5,
            });
            console.log("📍 Setting slash menu position:", {
              x: rect.left,
              y: rect.bottom + 5,
            });
            setShowSlashMenu(true);
            console.log("🎯 Slash menu should now be visible");
          }
        }, 0);
      }
    } else if (showSlashMenu && e.key === "Escape") {
      e.preventDefault();
      setShowSlashMenu(false);
    }
  };

  const handleSlashMenuSelect = (command: string, value?: string) => {
    console.log("🔽 Slash menu select:", { command, value });
    if (!editorRef.current) return;

    setShowSlashMenu(false);

    // Save the current selection
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      console.log("❌ No selection available for slash menu");
      return;
    }

    const range = selection.getRangeAt(0);
    let container = range.startContainer;

    // Find and remove the "/" character
    if (container.nodeType === Node.TEXT_NODE && container.textContent) {
      const text = container.textContent;
      const cursorPos = range.startOffset;
      console.log(
        "🔍 Looking for slash in text:",
        text,
        "at position:",
        cursorPos
      );

      // Look backwards for the slash
      for (let i = cursorPos - 1; i >= 0; i--) {
        if (text[i] === "/") {
          console.log("✂️ Found and removing slash at position:", i);
          // Create a range to delete the slash
          const deleteRange = document.createRange();
          deleteRange.setStart(container, i);
          deleteRange.setEnd(container, i + 1);
          deleteRange.deleteContents();
          break;
        }
        // Stop if we hit a space or newline
        if (text[i] === " " || text[i] === "\n") {
          console.log("⏹️ Stopped search at space/newline at position:", i);
          break;
        }
      }
    }

    // Now handle the formatting based on command type
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    if (command === "insertHorizontalRule") {
      console.log("📏 Inserting horizontal rule");
      // Special handling for horizontal rule
      const range = sel.getRangeAt(0);
      const hr = document.createElement("hr");
      hr.className = "my-8 border-border";

      // Insert the HR and add a new paragraph after it
      range.insertNode(hr);
      const newP = document.createElement("p");
      newP.innerHTML = "<br>";
      hr.parentNode?.insertBefore(newP, hr.nextSibling);

      // Move cursor to the new paragraph
      const newRange = document.createRange();
      newRange.setStart(newP, 0);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } else if (command === "formatBlock" && value) {
      console.log("📝 Format block:", value);
      // Handle block formatting (headings, quotes, code blocks)
      const range = sel.getRangeAt(0);
      let currentNode = range.startContainer;

      // Find the current block element
      if (currentNode.nodeType === Node.TEXT_NODE) {
        currentNode = currentNode.parentElement || currentNode;
      }

      // Find the closest block element
      let blockElement: Element | null = null;
      while (currentNode && currentNode !== editorRef.current) {
        if (
          currentNode instanceof Element &&
          [
            "P",
            "DIV",
            "H1",
            "H2",
            "H3",
            "H4",
            "H5",
            "H6",
            "BLOCKQUOTE",
            "PRE",
          ].includes(currentNode.tagName)
        ) {
          blockElement = currentNode;
          break;
        }
        const parent = currentNode.parentElement;
        if (!parent) break;
        currentNode = parent;
      }

      // If no block element found, create one
      if (!blockElement) {
        blockElement = document.createElement("p");
        const range = sel.getRangeAt(0);
        const textNode = range.startContainer;
        if (textNode.nodeType === Node.TEXT_NODE && textNode.parentNode) {
          textNode.parentNode.insertBefore(blockElement, textNode);
          blockElement.appendChild(textNode);
        }
      }

      if (blockElement && blockElement.parentElement) {
        // Get current content (text only, no HTML)
        const currentText = blockElement.textContent || "";

        // Create new element with the desired tag
        const newElement = document.createElement(value.toUpperCase());

        // Add the text content (this ensures the text is preserved)
        newElement.textContent = currentText;

        // Add appropriate classes for styling
        if (value === "blockquote") {
          newElement.className =
            "border-l-4 border-primary/30 pl-6 italic my-4";
        } else if (value === "pre") {
          newElement.className =
            "bg-muted border border-border/20 rounded-lg p-4 font-mono text-sm overflow-x-auto my-4 whitespace-pre-wrap";
          newElement.style.whiteSpace = "pre-wrap";
          newElement.style.wordBreak = "break-word";
          newElement.style.overflowWrap = "break-word";
        } else if (value.match(/^h[1-6]$/)) {
          const headingClasses = {
            h1: "text-3xl font-bold mt-8 mb-4",
            h2: "text-2xl font-semibold mt-6 mb-3",
            h3: "text-xl font-semibold mt-4 mb-2",
            h4: "text-lg font-medium mt-3 mb-2",
            h5: "text-base font-medium mt-2 mb-1",
            h6: "text-sm font-medium mt-2 mb-1",
          };
          newElement.className =
            headingClasses[value as keyof typeof headingClasses] || "";
        }

        // If the element is empty, add a placeholder
        if (!currentText.trim()) {
          newElement.innerHTML = "<br>";
        }

        // Replace the current element
        blockElement.parentElement.replaceChild(newElement, blockElement);

        // Position cursor at the end of the new element
        setTimeout(() => {
          const newSel = window.getSelection();
          if (newSel && newElement) {
            const newRange = document.createRange();
            newRange.selectNodeContents(newElement);
            newRange.collapse(false);
            newSel.removeAllRanges();
            newSel.addRange(newRange);
            editorRef.current?.focus();
          }
        }, 10);
      }
    } else if (
      command === "insertUnorderedList" ||
      command === "insertOrderedList"
    ) {
      console.log("📋 Creating list:", command);
      // Handle lists from slash menu
      const listType = command === "insertUnorderedList" ? "ul" : "ol";
      const range = sel.getRangeAt(0);
      let currentNode = range.startContainer;

      // Find the current block element
      if (currentNode.nodeType === Node.TEXT_NODE) {
        currentNode = currentNode.parentElement || currentNode;
      }

      let blockElement: Element | null = null;
      while (currentNode && currentNode !== editorRef.current) {
        if (
          currentNode instanceof Element &&
          [
            "P",
            "DIV",
            "H1",
            "H2",
            "H3",
            "H4",
            "H5",
            "H6",
            "BLOCKQUOTE",
            "PRE",
          ].includes(currentNode.tagName)
        ) {
          blockElement = currentNode;
          break;
        }
        const parent = currentNode.parentElement;
        if (!parent) break;
        currentNode = parent;
      }

      if (blockElement && blockElement.parentElement) {
        // Get current text content
        const currentText = blockElement.textContent || "";

        // Create list structure
        const list = document.createElement(listType);
        const listItem = document.createElement("li");

        // Add proper CSS classes for styling
        if (listType === "ul") {
          list.className = "list-disc pl-6 my-4";
        } else {
          list.className = "list-decimal pl-6 my-4";
        }

        listItem.className = "my-1";

        // Set content
        if (currentText.trim()) {
          listItem.textContent = currentText;
        } else {
          listItem.innerHTML = "<br>";
        }

        list.appendChild(listItem);

        // Replace the current block with the list
        blockElement.parentElement.replaceChild(list, blockElement);

        // Move cursor to the list item
        setTimeout(() => {
          const newSel = window.getSelection();
          if (newSel) {
            const newRange = document.createRange();
            newRange.selectNodeContents(listItem);
            newRange.collapse(false);
            newSel.removeAllRanges();
            newSel.addRange(newRange);
            editorRef.current?.focus();
          }
        }, 10);
      }
    } else {
      console.log(
        "❓ Unknown slash menu command:",
        command,
        "with value:",
        value
      );
    }

    // Update content
    setTimeout(() => {
      handleContentChange();
    }, 20);
  };

  // Handle paste to clean up content
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();

    const clipboardData = e.clipboardData;

    // Check for images in clipboard first
    const items = Array.from(clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));

    if (imageItems.length > 0) {
      // Handle image paste
      imageItems.forEach((item) => {
        const file = item.getAsFile();
        if (file) {
          insertImage(file);
        }
      });
      return;
    }

    // Handle text paste
    const pastedData = clipboardData.getData("text/plain");

    if (pastedData) {
      // Get current selection
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);

        // Delete current selection
        range.deleteContents();

        // Split pasted text into paragraphs and insert as clean HTML
        const paragraphs = pastedData
          .split("\n")
          .filter((p) => p.trim().length > 0);

        if (paragraphs.length === 0) return;

        // Insert first paragraph as text node
        const textNode = document.createTextNode(paragraphs[0]);
        range.insertNode(textNode);

        // Insert remaining paragraphs as paragraph elements
        let currentRange = range.cloneRange();
        currentRange.setStartAfter(textNode);
        currentRange.collapse(true);

        for (let i = 1; i < paragraphs.length; i++) {
          const p = document.createElement("p");
          p.textContent = paragraphs[i];
          currentRange.insertNode(p);
          currentRange.setStartAfter(p);
          currentRange.collapse(true);
        }

        // Update selection to end of pasted content
        if (paragraphs.length === 1) {
          currentRange.setStartAfter(textNode);
        } else {
          const lastP = editorRef.current?.querySelector("p:last-of-type");
          if (lastP) {
            currentRange.selectNodeContents(lastP);
            currentRange.collapse(false);
          }
        }

        selection.removeAllRanges();
        selection.addRange(currentRange);

        // Trigger content change
        handleContentChange();
      }
    }
  };

  // Handle markdown shortcuts
  const handleMarkdownShortcuts = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const selection = window.getSelection();
      if (!selection || !selection.anchorNode) return;

      // Check if we're inside a block element that shouldn't continue
      let currentElement: Node | null = selection.anchorNode;
      if (currentElement?.nodeType === Node.TEXT_NODE) {
        currentElement = currentElement.parentElement;
      }

      // Find the closest block element
      while (currentElement && currentElement !== editorRef.current) {
        if (currentElement instanceof Element) {
          const tagName = currentElement.tagName;

          // If we're in a heading, code block, or blockquote, create a new paragraph
          if (
            ["H1", "H2", "H3", "H4", "H5", "H6", "PRE", "BLOCKQUOTE"].includes(
              tagName
            )
          ) {
            e.preventDefault();

            // Create a new paragraph element
            const newP = document.createElement("p");
            newP.innerHTML = "<br>";

            // Insert after the current block element
            if (currentElement.parentElement) {
              currentElement.parentElement.insertBefore(
                newP,
                currentElement.nextSibling
              );

              // Move cursor to the new paragraph
              const range = document.createRange();
              range.setStart(newP, 0);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
            }
            return;
          }
        }
        const parentElement =
          currentElement instanceof Element
            ? currentElement.parentElement
            : null;
        currentElement = parentElement;
      }

      const textContent = selection.anchorNode?.textContent || "";
      const lineStart = textContent.substring(0, selection.anchorOffset);

      // Handle heading shortcuts
      if (lineStart.match(/^#{1,4}\s$/)) {
        e.preventDefault();
        const level = lineStart.trim().length;
        formatText("formatBlock", `h${level}`);
        return;
      }

      // Handle list shortcuts
      if (lineStart.match(/^[-*+]\s$/)) {
        e.preventDefault();
        formatText("insertUnorderedList");
        return;
      }

      if (lineStart.match(/^\d+\.\s$/)) {
        e.preventDefault();
        formatText("insertOrderedList");
        return;
      }
    }
  };

  // Generate QR Code SVG
  const generateQRCode = (url: string) => {
    // Simple QR code using qr-server.com API (for demo purposes)
    // In production, you'd want to use a proper QR library like qrcode or react-qr-code
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(
      url
    )}`;

    return `<img 
      src="${qrApiUrl}" 
      alt="QR Code for ${url}"
      class="w-full h-full object-contain"
      style="max-width: 128px; max-height: 128px;"
    />`;
  };

  // Image optimization function
  const optimizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions (max 800px width, maintain aspect ratio)
        const maxWidth = 800;
        const maxHeight = 600;
        let { width, height } = img;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        resolve(dataUrl);
      };

      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  // Insert image into editor
  const insertImage = async (file: File) => {
    if (!editorRef.current) return;

    // Ensure editor is focused
    editorRef.current.focus();

    // Create image element with skeleton
    const imageId = `img-${Date.now()}`;
    const imageContainer = document.createElement("div");
    imageContainer.className = "relative group my-4 max-w-full inline-block";
    imageContainer.innerHTML = `
      <div id="skeleton-${imageId}" class="animate-pulse bg-muted rounded-lg w-full h-48 flex items-center justify-center">
        <div class="text-muted-foreground">Loading image...</div>
      </div>
    `;

    // Insert at current cursor position or at the end
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.insertNode(imageContainer);
      range.setStartAfter(imageContainer);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      // Simply append to editor
      editorRef.current.appendChild(imageContainer);
    }

    try {
      // Optimize image
      const optimizedDataUrl = await optimizeImage(file);

      // Replace skeleton with actual image
      imageContainer.innerHTML = `
        <img 
          id="${imageId}"
          src="${optimizedDataUrl}" 
          alt="Uploaded image"
          class="max-w-full h-auto rounded-lg cursor-pointer"
          style="max-width: 100%; height: auto;"
        />
        <div class="absolute bottom-2 right-2 w-4 h-4 bg-primary/80 rounded-full cursor-nw-resize opacity-0 group-hover:opacity-100 transition-opacity resize-handle"
             data-image-id="${imageId}">
          <svg class="w-3 h-3 text-white m-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
          </svg>
        </div>
      `;

      // Add resize functionality
      addImageResize(imageId);

      // Trigger content change to save
      handleContentChange();
    } catch (error) {
      console.error("Error processing image:", error);
      // Replace skeleton with error state
      imageContainer.innerHTML = `
        <div class="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
          <div class="text-destructive text-sm">Failed to load image: ${file.name}</div>
        </div>
      `;
    }

    handleContentChange();
  };

  // Add resize functionality to image
  const addImageResize = (imageId: string) => {
    const img = document.getElementById(imageId) as HTMLImageElement;
    const container = img?.parentElement;
    const resizeHandle = container?.querySelector(
      ".resize-handle"
    ) as HTMLElement;

    if (!img || !container || !resizeHandle) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      startWidth = img.offsetWidth;

      document.addEventListener("mousemove", handleResize);
      document.addEventListener("mouseup", stopResize);
    });

    const handleResize = (e: MouseEvent) => {
      if (!isResizing) return;

      const diff = e.clientX - startX;
      const newWidth = Math.max(100, Math.min(800, startWidth + diff));

      img.style.width = `${newWidth}px`;
      img.style.height = "auto";
    };

    const stopResize = () => {
      isResizing = false;
      document.removeEventListener("mousemove", handleResize);
      document.removeEventListener("mouseup", stopResize);
      handleContentChange();
    };
  };

  // Font family options
  const fontFamilies = {
    system: "font-sans",
    serif: "font-serif",
    mono: "font-mono",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Note not found</h1>
          <p className="text-muted-foreground mb-4">
            This note doesn&apos;t exist or you don&apos;t have access to it.
          </p>
          <Button onClick={() => router.push("/")}>Go Home</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          * {
            box-shadow: none !important;
          }
          *::before, *::after {
            box-shadow: none !important;
          }
          .shadow, .shadow-sm, .shadow-md, .shadow-lg, .shadow-xl, .shadow-2xl {
            box-shadow: none !important;
          }
          button {
            box-shadow: none !important;
          }
          div {
            box-shadow: none !important;
          }
        `,
        }}
      />
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/5 to-muted/20 relative">
        {/* Top bar - hidden from print */}
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl print:hidden">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push("/spaces")}
                className="h-11 w-11 hover:scale-105 transition-all duration-200 hover:bg-primary/10 rounded-xl"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>

              <div className="flex items-center gap-3">
                {!isEditingTitle ? (
                  /* Display Mode */
                  <div className="flex items-center gap-2">
                    <button
                      onClick={startTitleEdit}
                      className="text-2xl font-bold hover:bg-accent/20 px-2 py-1 rounded-lg transition-colors"
                      title="Click to edit title"
                    >
                      {note.title || "Untitled Note"}
                    </button>
                    {isSavingTitle && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"></div>
                        <span>Saving...</span>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Edit Mode */
                  <div className="flex items-center gap-2">
                    <Input
                      ref={titleRef}
                      value={tempTitle}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setTempTitle(e.target.value)
                      }
                      placeholder="Untitled Note"
                      className={`border-0 bg-transparent text-2xl font-bold px-2 py-1 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 placeholder:text-muted-foreground/50 transition-all duration-200 rounded-lg ${
                        !tempTitle.trim()
                          ? "text-red-500 bg-red-50 dark:bg-red-900/20"
                          : ""
                      }`}
                      style={{ width: `${Math.max(tempTitle.length, 12)}ch` }}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (tempTitle.trim()) {
                            confirmTitleEdit();
                          } else {
                            // If empty, revert to original title
                            setTempTitle(note?.title || "Untitled Note");
                          }
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelTitleEdit();
                        }
                      }}
                    />
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (tempTitle.trim()) {
                            confirmTitleEdit();
                          } else {
                            // If empty, revert to original title and cancel
                            setTempTitle(note?.title || "Untitled Note");
                            cancelTitleEdit();
                          }
                        }}
                        className="h-8 w-8 p-0 hover:bg-green-100 hover:text-green-700 transition-colors"
                        title="Confirm changes (Enter)"
                        disabled={!tempTitle.trim()}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelTitleEdit}
                        className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-700 transition-colors"
                        title="Cancel changes (Escape)"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Save status */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {(saveStatus === "saving" || isAutoSaving) && (
                  <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full">
                    <Save className="h-3.5 w-3.5 animate-spin" />
                    <span className="font-medium">
                      {isAutoSaving ? "Auto-saving..." : "Saving..."}
                    </span>
                  </div>
                )}
                {saveStatus === "saved" && !isAutoSaving && autoSaveEnabled && (
                  <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="font-medium">Auto-saved</span>
                  </div>
                )}
                {saveStatus === "saved" &&
                  !isAutoSaving &&
                  !autoSaveEnabled &&
                  isSaving === false && (
                    <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-full">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <span className="font-medium">Saved</span>
                    </div>
                  )}
                {!autoSaveEnabled && saveStatus !== "saving" && !isSaving && (
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-full">
                    <Settings className="h-3 w-3" />
                    <span className="font-medium text-xs">Auto-save off</span>
                  </div>
                )}
                {saveStatus === "error" && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    <span className="font-medium">Error saving</span>
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                onClick={() => setShareDialogOpen(true)}
                className="gap-2 hover:scale-105 transition-all duration-200 rounded-xl bg-background/50 hover:bg-primary/10 border-border/50"
              >
                <Share className="h-4 w-4" />
                Share
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:scale-105 transition-transform"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center">
                      <Settings className="h-4 w-4 mr-2" />
                      Auto-save
                    </div>
                    <div
                      className={`w-8 h-4 rounded-full transition-colors ${
                        autoSaveEnabled ? "bg-green-500" : "bg-gray-300"
                      } relative`}
                    >
                      <div
                        className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${
                          autoSaveEnabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      setTheme(
                        theme === "light"
                          ? "dark"
                          : theme === "dark"
                          ? "system"
                          : "light"
                      )
                    }
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center">
                      {theme === "light" ? (
                        <Sun className="h-4 w-4 mr-2" />
                      ) : theme === "dark" ? (
                        <Moon className="h-4 w-4 mr-2" />
                      ) : (
                        <Monitor className="h-4 w-4 mr-2" />
                      )}
                      Theme
                    </div>
                    <span className="text-sm text-muted-foreground capitalize">
                      {theme || "system"}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Type className="h-4 w-4 mr-2" />
                    Font: {note.font_family}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Formatting Toolbar */}
        <div
          className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg print:hidden"
          style={{ boxShadow: "none !important", filter: "drop-shadow(none)" }}
        >
          <div
            className="max-w-4xl mx-auto px-8 py-3"
            style={{
              boxShadow: "none !important",
              filter: "drop-shadow(none)",
            }}
          >
            <div
              className="flex items-center justify-between"
              style={{
                boxShadow: "none !important",
                filter: "drop-shadow(none)",
              }}
            >
              <div className="flex items-center gap-3">
                {/* Format Buttons */}
                <div
                  className="flex items-center gap-1 bg-muted/50 rounded-lg p-1"
                  style={{
                    boxShadow: "none !important",
                    filter: "drop-shadow(none)",
                  }}
                >
                  <button
                    onClick={() => formatText("bold")}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                    title="Bold"
                  >
                    <Bold className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => formatText("italic")}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                    title="Italic"
                  >
                    <Italic className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => formatText("underline")}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                    title="Underline"
                  >
                    <Underline className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => formatText("strikeThrough")}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                    title="Strikethrough"
                  >
                    <Strikethrough className="h-4 w-4" />
                  </button>
                </div>

                {/* Heading Buttons */}
                <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                  <button
                    onClick={() => formatText("formatBlock", "h1")}
                    className="px-2 py-2 hover:bg-accent rounded-md transition-colors text-sm font-medium"
                    title="Heading 1"
                  >
                    H1
                  </button>
                  <button
                    onClick={() => formatText("formatBlock", "h2")}
                    className="px-2 py-2 hover:bg-accent rounded-md transition-colors text-sm font-medium"
                    title="Heading 2"
                  >
                    H2
                  </button>
                  <button
                    onClick={() => formatText("formatBlock", "h3")}
                    className="px-2 py-2 hover:bg-accent rounded-md transition-colors text-sm font-medium"
                    title="Heading 3"
                  >
                    H3
                  </button>
                  <button
                    onClick={() => formatText("formatBlock", "h4")}
                    className="px-2 py-2 hover:bg-accent rounded-md transition-colors text-sm font-medium"
                    title="Heading 4"
                  >
                    H4
                  </button>
                  <button
                    onClick={() => formatText("formatBlock", "p")}
                    className="px-2 py-2 hover:bg-accent rounded-md transition-colors text-sm font-medium"
                    title="Paragraph"
                  >
                    P
                  </button>
                </div>

                {/* List and Block Buttons */}
                <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                  <button
                    onClick={() => createList("ul")}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                    title="Bullet List"
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => createList("ol")}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                    title="Numbered List"
                  >
                    <ListOrdered className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => formatText("formatBlock", "blockquote")}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                    title="Quote"
                  >
                    <Quote className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => formatText("formatBlock", "pre")}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                    title="Code Block"
                  >
                    <Code className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 hover:bg-accent rounded-md transition-colors"
                    title="Insert Image"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Save Button */}
                <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                  <button
                    onClick={saveNote}
                    disabled={isSaving}
                    className="p-2 hover:bg-accent rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={isSaving ? "Saving..." : "Save Note (Ctrl+S)"}
                  >
                    <Save
                      className={`h-4 w-4 ${isSaving ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>
              </div>

              {/* Share Button - Only visible when scrolled */}
              {showToolbarShare && (
                <div className="flex items-center animate-in fade-in-0 slide-in-from-right-2 duration-200">
                  <button
                    onClick={() => setShareDialogOpen(true)}
                    className="p-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors"
                    title="Share Note"
                  >
                    <Share className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Editor Container */}
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* Modern editor container */}
          <div className="bg-card rounded-3xl border border-border/50 backdrop-blur-sm print:border-0 print:rounded-none relative">
            {/* Editor content with focus ring only on the editor area */}
            <div className="relative">
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Start writing your note..."
                onInput={handleContentChange}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  handleKeyboardShortcuts(e);
                  handleSlashMenu(e);
                  handleMarkdownShortcuts(e);
                }}
                onMouseUp={handleSelection}
                onKeyUp={handleSelection}
                className={cn(
                  "min-h-[75vh] focus:outline-none prose prose-lg max-w-none w-full",
                  fontFamilies[note.font_family],
                  "prose-headings:scroll-mt-16",
                  "prose-h1:text-4xl prose-h1:font-bold prose-h1:mt-8 prose-h1:mb-4 prose-h1:text-foreground",
                  "prose-h2:text-3xl prose-h2:font-semibold prose-h2:mt-6 prose-h2:mb-3 prose-h2:text-foreground",
                  "prose-h3:text-2xl prose-h3:font-semibold prose-h3:mt-4 prose-h3:mb-2 prose-h3:text-foreground",
                  "prose-h4:text-xl prose-h4:font-medium prose-h4:mt-3 prose-h4:mb-2 prose-h4:text-foreground",
                  "prose-h5:text-lg prose-h5:font-medium prose-h5:mt-2 prose-h5:mb-1 prose-h5:text-foreground",
                  "prose-h6:text-base prose-h6:font-medium prose-h6:mt-2 prose-h6:mb-1 prose-h6:text-foreground",
                  "prose-p:leading-relaxed prose-p:text-foreground prose-p:mb-4",
                  "prose-strong:text-foreground prose-em:text-foreground",
                  "prose-li:my-1 prose-li:text-foreground",
                  "prose-blockquote:border-l-4 prose-blockquote:border-primary/40 prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-muted-foreground prose-blockquote:bg-muted/20 prose-blockquote:py-2 prose-blockquote:rounded-r-lg prose-blockquote:my-4",
                  "prose-code:bg-muted/60 prose-code:text-primary prose-code:px-2 prose-code:py-1 prose-code:rounded prose-code:text-sm prose-code:font-mono",
                  "prose-pre:bg-muted/60 prose-pre:border prose-pre:border-border/30 prose-pre:rounded-xl prose-pre:p-4 prose-pre:my-4 prose-pre:text-sm prose-pre:overflow-x-auto prose-pre:whitespace-pre-wrap prose-pre:break-words",
                  "prose-ul:list-disc prose-ul:pl-6 prose-ol:list-decimal prose-ol:pl-6 prose-li:marker:text-primary/70",
                  "prose-hr:border-border/50 prose-hr:my-8",
                  // Link styling with distinct blue color but default cursor
                  "prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:underline prose-a:underline-offset-2 prose-a:decoration-blue-600/40 dark:prose-a:decoration-blue-400/40 hover:prose-a:decoration-blue-600 dark:hover:prose-a:decoration-blue-400 prose-a:transition-colors hover:prose-a:text-blue-700 dark:hover:prose-a:text-blue-300",
                  // Links have default cursor and are not directly clickable
                  "[&_a]:!cursor-default [&_a]:pointer-events-auto [&_a]:select-none",
                  "dark:prose-invert",
                  "px-10 py-12 text-left [&_*]:text-left",
                  // Enhanced placeholder styles
                  "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:pointer-events-none empty:before:italic empty:before:text-xl",
                  // Smooth focus transition
                  "transition-all duration-200",
                  // Selection styling
                  "[&::selection]:bg-primary/20 [&_*::selection]:bg-primary/20"
                )}
                style={{
                  wordBreak: "break-word",
                  overflowWrap: "break-word",
                  textAlign: "left",
                  direction: "ltr",
                  width: "100%",
                  boxSizing: "border-box",
                  lineHeight: "1.75",
                  fontSize: "16px",
                }}
              />
            </div>

            {/* Status bar with stats */}
            <div className="px-8 py-3 border-t border-border/30 bg-gradient-to-r from-background/60 to-muted/10 print:hidden">
              <div className="flex items-center justify-end gap-6 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span className="font-medium">Lines:</span>
                  <span className="text-foreground font-mono">
                    {stats.lines}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">Words:</span>
                  <span className="text-foreground font-mono">
                    {stats.words}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">Sentences:</span>
                  <span className="text-foreground font-mono">
                    {stats.sentences}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Selection formatting bubble */}
        {showSelectionBubble && (
          <div
            className="fixed z-50 bg-card/95 backdrop-blur-sm border border-border/50 rounded-xl p-1.5 flex items-center gap-1 animate-in fade-in-0 zoom-in-95 duration-200"
            style={{
              left: selectionBubblePos.x - 100,
              top: selectionBubblePos.y,
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => formatText("bold")}
              className="h-8 w-8 p-0 hover:bg-primary/10 hover:scale-105 transition-all duration-200 rounded-lg"
            >
              <Bold className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => formatText("italic")}
              className="h-8 w-8 p-0 hover:bg-primary/10 hover:scale-105 transition-all duration-200 rounded-lg"
            >
              <Italic className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => formatText("underline")}
              className="h-8 w-8 p-0 hover:bg-primary/10 hover:scale-105 transition-all duration-200 rounded-lg"
            >
              <Underline className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-4 bg-border/50 mx-1"></div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const url = prompt("Enter URL:");
                if (url) formatText("createLink", url);
              }}
              className="h-8 w-8 p-0 hover:bg-primary/10 hover:scale-105 transition-all duration-200 rounded-lg"
            >
              <Link className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => formatText("formatBlock", "pre")}
              className="h-8 w-8 p-0 hover:bg-primary/10 hover:scale-105 transition-all duration-200 rounded-lg"
            >
              <Code className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-4 bg-border/50 mx-1"></div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 w-8 p-0 hover:bg-primary/10 hover:scale-105 transition-all duration-200 rounded-lg"
              title="Insert Image"
            >
              <ImageIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Slash Menu */}
        <SlashMenu
          isOpen={showSlashMenu}
          position={slashMenuPos}
          onSelect={handleSlashMenuSelect}
          onClose={() => setShowSlashMenu(false)}
        />

        {/* Hidden file input for image uploads */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            files.forEach((file) => insertImage(file));
            e.target.value = ""; // Reset input
          }}
        />

        {/* Share Dialog */}
        <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Share Note</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Link Section */}
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Public Link</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        value={`https://woff.space/v/${note.public_code}`}
                        readOnly
                        className="flex-1"
                      />
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `https://woff.space/v/${note.public_code}`
                          );
                        }}
                        variant="outline"
                        size="sm"
                      >
                        Copy
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Visibility</label>
                    <div className="flex gap-2 mt-1">
                      <Badge
                        variant={
                          note.visibility === "public" ? "default" : "outline"
                        }
                      >
                        Public
                      </Badge>
                      <Badge
                        variant={
                          note.visibility === "unlisted" ? "default" : "outline"
                        }
                      >
                        Unlisted
                      </Badge>
                      <Badge
                        variant={
                          note.visibility === "private" ? "default" : "outline"
                        }
                      >
                        Private
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* QR Code Section */}
                <div className="flex flex-col items-center space-y-2">
                  <label className="text-sm font-medium">QR Code</label>
                  <div className="p-4 bg-white rounded-lg border-2 border-border/20">
                    <div
                      id={`qr-code-${note.public_code}`}
                      className="w-32 h-32 flex items-center justify-center"
                      dangerouslySetInnerHTML={{
                        __html: generateQRCode(
                          `https://woff.space/v/${note.public_code}`
                        ),
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Scan to open note
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    // Convert HTML to Markdown (simplified)
                    const content = editorRef.current?.innerHTML || "";
                    const markdown = content
                      .replace(/<h1[^>]*>(.*?)<\/h1>/g, "# $1")
                      .replace(/<h2[^>]*>(.*?)<\/h2>/g, "## $1")
                      .replace(/<h3[^>]*>(.*?)<\/h3>/g, "### $1")
                      .replace(/<h4[^>]*>(.*?)<\/h4>/g, "#### $1")
                      .replace(/<p[^>]*>(.*?)<\/p>/g, "$1\n")
                      .replace(/<li[^>]*>(.*?)<\/li>/g, "- $1")
                      .replace(
                        /<blockquote[^>]*><p[^>]*>(.*?)<\/p><\/blockquote>/g,
                        "> $1"
                      )
                      .replace(
                        /<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/g,
                        "```\n$1\n```"
                      )
                      .replace(/<[^>]*>/g, ""); // Remove remaining HTML tags

                    navigator.clipboard.writeText(
                      `# ${note.title}\n\n${markdown}`
                    );
                  }}
                >
                  Copy as Markdown
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    // Add print styles and trigger print
                    const style = document.createElement("style");
                    style.textContent = `
                    @media print {
                      body * { visibility: hidden; }
                      .printable-content, .printable-content * { visibility: visible; }
                      .printable-content { 
                        position: absolute; 
                        left: 0; 
                        top: 0; 
                        width: 100%; 
                        background: white !important;
                        box-shadow: none !important;
                        border: none !important;
                        border-radius: 0 !important;
                      }
                      .print\\:hidden { display: none !important; }
                    }
                  `;
                    document.head.appendChild(style);

                    // Add printable class to editor container
                    const editorContainer =
                      editorRef.current?.closest(".bg-white");
                    if (editorContainer) {
                      editorContainer.classList.add("printable-content");
                    }

                    window.print();

                    // Cleanup
                    setTimeout(() => {
                      document.head.removeChild(style);
                      if (editorContainer) {
                        editorContainer.classList.remove("printable-content");
                      }
                    }, 1000);
                  }}
                >
                  Export PDF
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
