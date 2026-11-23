"use server";

import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import sanitizeHtml from "sanitize-html";
import { marked } from "marked";
import { customAlphabet } from "nanoid";
import { after } from "next/server";
import { displayNameForDevice } from "@/lib/display-name";
import { isValidRoomSlug, normalizeRoomSlug } from "@/lib/room-slug";
import { HANDOFF_HTML, HANDOFF_JSON } from "@/lib/handoff-template";
import {
  createServerSupabaseClient,
  requireAnonymousUser,
} from "@/lib/supabase";

const noteId = customAlphabet(
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
  6,
);
const NOTE_SLUG_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const SPOOFED_ENTRY_PREFIX = /^(NOTE:|PHOTO:|PHOTOS:|DRAWING:)/;
const SAFE_DATA_IMAGE_URL =
  /^data:image\/(png|jpeg|jpg|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/i;
const MAX_TEXT_LENGTH = 50_000;
const MAX_META_BYTES = 250_000;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_FILES_PER_ENTRY = 20;
const MAX_MARKDOWN_IMPORT_BYTES = 500_000;

export interface Space {
  id: string;
  slug: string;
  title: string | null;
  creator_device_id: string | null;
  visibility: "public" | "unlisted" | "private";
  allow_public_post: boolean;
  created_at: string;
  last_activity_at: string;
  expires_at?: string | null;
  is_pro?: boolean;
  can_customize_identity?: boolean;
  recovery_key?: string;
  invite_token?: string;
  invitation_id?: string;
  secure_invites?: boolean;
  pairing_expires_at?: string | null;
  code_enabled?: boolean;
  expiry_mode?: "none" | "fixed" | "inactivity";
  name?: string;
  welcome_text?: string;
  delivery_mode?: "collaborative" | "read_only";
  retention_days?: number;
  can_write?: boolean;
  access_version?: number;
}

export interface Entry {
  id: string;
  space_id: string;
  kind: "text" | "image" | "pdf" | "file";
  text: string | null;
  meta: Record<string, any> | null;
  created_by_device_id: string | null;
  created_at: string;
  expires_at?: string | null;
}

export interface Note {
  id: string;
  slug: string;
  title: string;
  content: string;
  content_json?: Record<string, unknown> | null;
  public_code: string;
  visibility: "public" | "unlisted" | "private";
  font_family: "system" | "serif" | "mono";
  space_id: string;
  space_slug?: string;
  created_by_device_id: string | null;
  created_at: string;
  updated_at: string;
  is_locked?: boolean;
  is_owner?: boolean;
  can_edit?: boolean;
  version?: number;
}

export interface UploadIntent {
  path: string;
  bucket: "files";
  maxBytes: number;
}

type UploadIntentInput = { name: string; size: number; type: string };

const allowedHtmlTags = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "hr",
  "span",
  "div",
  "label",
  "input",
];

function sanitizeNoteHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: allowedHtmlTags,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "data-align", "class"],
      span: ["data-type", "data-checked"],
      div: ["data-type"],
      li: ["data-checked", "data-type"],
      ul: ["data-type"],
      ol: ["type", "start"],
      input: ["type", "checked", "disabled"],
      p: ["style"],
      h1: ["style"],
      h2: ["style"],
      h3: ["style"],
      blockquote: ["style"],
    },
    allowedClasses: {
      img: ["note-image"],
    },
    allowedStyles: {
      "*": {
        "text-align": [/^left$/, /^right$/, /^center$/, /^justify$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      img: ["http", "https", "data"],
    },
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      }),
      input: (_tagName, attribs) => {
        if (attribs.type && attribs.type.toLowerCase() !== "checkbox") {
          return { tagName: "span", attribs: {} };
        }
        const safeAttribs: Record<string, string> = { type: "checkbox" };
        if ("checked" in attribs) safeAttribs.checked = "checked";
        if ("disabled" in attribs) safeAttribs.disabled = "disabled";
        return { tagName: "input", attribs: safeAttribs };
      },
      img: (_tagName, attribs) => {
        const clean: Record<string, string> = {};
        const src = (attribs.src || "").trim();
        if (src) {
          if (src.toLowerCase().startsWith("data:")) {
            if (SAFE_DATA_IMAGE_URL.test(src)) clean.src = src;
          } else {
            clean.src = src;
          }
        }
        if (attribs.alt !== undefined) clean.alt = attribs.alt.slice(0, 500);
        if (attribs.title !== undefined) clean.title = attribs.title.slice(0, 500);
        if (attribs.width && /^\d{1,5}$/.test(attribs.width.trim())) {
          clean.width = attribs.width.trim();
        }
        if (attribs.height && /^\d{1,5}$/.test(attribs.height.trim())) {
          clean.height = attribs.height.trim();
        }
        const align = attribs["data-align"]?.trim().toLowerCase();
        if (align === "left" || align === "center" || align === "right") {
          clean["data-align"] = align;
        }
        if (attribs.class === "note-image") clean.class = "note-image";
        return { tagName: "img", attribs: clean };
      },
    },
  });
}

function safeFileName(value: string) {
  const extension = value.includes(".")
    ? `.${value.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10)}`
    : "";
  return `${randomUUID()}${extension}`;
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function assertRateLimit(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  action: string,
  limit: number,
  windowSeconds = 60,
) {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  if (!data) throw new Error("Too many requests. Please wait and try again.");
}

async function joinSpaceByCode(slug: string): Promise<Space | null> {
  const code = normalizeRoomSlug(slug);
  if (!isValidRoomSlug(code)) return null;

  const { supabase, user } = await requireAnonymousUser();
  const { data, error } = await supabase.rpc("join_space", {
    p_slug: code,
    p_display_name: displayNameForDevice(user.id),
  });

  if (error || !data) return null;
  const result = Array.isArray(data) ? data[0] : data;
  return {
    ...((result.space || result) as Space),
    recovery_key: result.recovery_key,
  };
}

export async function recoverSpace(
  slug: string,
  recoveryKey: string,
): Promise<{ recovery_key: string; space: Space } | false> {
  const canonicalSlug = normalizeRoomSlug(slug);
  if (!isValidRoomSlug(canonicalSlug) || !/^(?:[A-F0-9]{20}|[A-F0-9]{32})$/i.test(recoveryKey.trim())) {
    return false;
  }
  const { supabase, user } = await requireAnonymousUser();
  const { data, error } = await supabase.rpc("recover_space_ownership", {
    p_slug: canonicalSlug,
    p_recovery_key: recoveryKey.trim(),
    p_display_name: displayNameForDevice(user.id),
  });
  if (error) throw new Error(`Unable to recover space: ${error.message}`);
  return data?.recovered ? { recovery_key: data.recovery_key, space: data.space } : false;
}

export async function createSpace(template?: "project-handoff"): Promise<Space> {
  const { supabase, user } = await requireAnonymousUser();
  let { data, error } = template
    ? await supabase.rpc("create_room_from_template", { p_device_id: displayNameForDevice(user.id) })
    : await supabase.rpc("create_space", { p_display_name: displayNameForDevice(user.id) });
  if (template && error?.message === "Pro is required") {
    ({ data, error } = await supabase.rpc("create_space", { p_display_name: displayNameForDevice(user.id) }));
  }

  if (error || !data) {
    throw new Error(error?.message || "Unable to create a space");
  }

  const payload = (Array.isArray(data) ? data[0] : data) as {
    space?: Space;
    recovery_key?: string;
    invite_token?: string;
    invitation_id?: string;
  } & Partial<Space>;
  const space = payload.space ?? (payload as Space);
  if (template) {
    try {
      const { noteSlug } = await createNoteEntry(space.id, "Project handoff");
      const saved = await saveNoteSnapshot(noteSlug, { title: "Project handoff", content: HANDOFF_HTML, content_json: HANDOFF_JSON, version: 1 });
      if (saved.error) throw new Error(saved.error);
    } catch (error) {
      await supabase.from("spaces").delete().eq("id", space.id);
      throw error;
    }
  }
  return {
    ...space,
    recovery_key: payload.recovery_key,
    invite_token: payload.invite_token,
    invitation_id: payload.invitation_id,
  };
}

export async function joinSpace(slug: string): Promise<Space | null> {
  return joinSpaceByCode(slug);
}

export async function createRoomInvitation(spaceId: string, rotate = false): Promise<{ token: string; id: string; access_version: number }> {
  const { supabase } = await requireAnonymousUser();
  const { data, error } = await supabase.rpc(rotate ? "rotate_room_access" : "create_room_invitation", {
    p_space_id: spaceId,
  });
  if (error || !data) throw new Error(error?.message || "Unable to create invitation");
  return data;
}

export async function rotateRoomRecoveryKey(spaceId: string): Promise<string> {
  const { supabase } = await requireAnonymousUser();
  const { data, error } = await supabase.rpc("rotate_room_recovery_key", { p_space_id: spaceId });
  if (error || !data?.recovery_key) throw new Error(error?.message || "Unable to replace recovery key");
  return data.recovery_key;
}

export async function setRoomAccess(
  spaceId: string,
  options: { codeEnabled: boolean; expiresAt?: string | null },
): Promise<Space> {
  const { supabase } = await requireAnonymousUser();
  if (typeof options.codeEnabled !== "boolean") throw new Error("Choose whether the room code is open");
  const updateExpiry = options.expiresAt !== undefined;
  if (updateExpiry && options.expiresAt !== null && (
    typeof options.expiresAt !== "string" || !Number.isFinite(Date.parse(options.expiresAt))
  )) throw new Error("Choose a valid time limit");
  const { data, error } = await supabase.rpc("set_room_access", {
    p_space_id: spaceId,
    p_code_enabled: options.codeEnabled,
    p_expires_at: options.expiresAt ?? null,
    p_update_expiry: updateExpiry,
  });
  if (error || !data) throw new Error(error?.message || "Unable to update room access");
  return data as Space;
}

export async function rotateRoomCode(spaceId: string, code?: string): Promise<Space> {
  const canonicalCode = code === undefined ? undefined : normalizeRoomSlug(code);
  if (canonicalCode !== undefined && !isValidRoomSlug(canonicalCode)) throw new Error("Use a four-digit code or a valid custom room URL");
  const { supabase } = await requireAnonymousUser();
  const { data, error } = await supabase.rpc("rotate_room_code", {
    p_space_id: spaceId, p_slug: canonicalCode ?? null,
  });
  if (error || !data) throw new Error(error?.message || "Unable to change the room code");
  return data as Space;
}

export async function cancelUploadIntents(spaceId: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { supabase } = await requireAnonymousUser();
  const { error } = await supabase.rpc("cancel_upload_reservations", { p_space_id: spaceId, p_paths: paths });
  if (error) throw new Error("Unable to release upload reservation. It will expire automatically.");
}

export async function recordRoomEvent(spaceId: string, event: "share_initiated" | "upload_failed"): Promise<void> {
  try {
    const { supabase } = await requireAnonymousUser();
    after(async () => {
      try {
        await supabase.rpc("record_room_event", { p_space_id: spaceId, p_event: event });
      } catch {
        /* Metrics must not interrupt sharing. */
      }
    });
  } catch { /* Metrics must not interrupt sharing. */ }
}

export async function setNotePrivacy(noteSlug: string, isLocked: boolean, version: number): Promise<{ version: number; is_locked: boolean }> {
  if (!NOTE_SLUG_PATTERN.test(noteSlug)) throw new Error("Invalid note");
  const { supabase } = await requireAnonymousUser();
  const { data, error } = await supabase.rpc("set_note_privacy", {
    p_slug: noteSlug, p_is_locked: isLocked, p_expected_version: version,
  });
  if (error || !data) throw new Error(error?.message || "Unable to change note privacy");
  return data;
}

function isRawBinaryUpload(value?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  // Reject standalone data URI payloads (e.g. raw pasted binary images/files)
  if (/^data:(image|audio|video|application|font)\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]{100,}$/i.test(trimmed)) {
    return true;
  }
  if (
    trimmed.startsWith("data:") &&
    trimmed.includes(";base64,") &&
    !trimmed.includes("\n") &&
    trimmed.length > 500 &&
    !/\b(const|let|var|function|def|import|export|class|return)\b/.test(trimmed)
  ) {
    return true;
  }
  return false;
}

export async function createEntry(
  spaceId: string,
  kind: "text" | "image" | "pdf" | "file",
  text?: string,
  _meta?: Record<string, any>,
): Promise<Entry> {
  if (kind !== "text") {
    throw new Error("Files and media must be uploaded through upload intents");
  }
  const { supabase, user } = await requireAnonymousUser();
  await assertRateLimit(supabase, "create_entry", 60);
  const cleanText = typeof text === "string" ? text.trim() : "";

  if (!cleanText) {
    throw new Error("A message cannot be empty");
  }

  if (cleanText.length > MAX_TEXT_LENGTH) {
    throw new Error(`Messages can be at most ${MAX_TEXT_LENGTH} characters`);
  }

  if (isRawBinaryUpload(cleanText)) {
    throw new Error("Binary data must be uploaded as a file");
  }

  if (SPOOFED_ENTRY_PREFIX.test(cleanText)) {
    throw new Error("Messages cannot start with a reserved entry prefix");
  }

  const { data, error } = await supabase
    .from("entries")
    .insert({
      space_id: spaceId,
      kind: "text",
      text: cleanText,
      meta: null,
      created_by_device_id: user.id,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to post this entry");
  }

  return data as Entry;
}

export async function updateTextEntry(
  entryId: string,
  text: string,
): Promise<Entry> {
  const { supabase, user } = await requireAnonymousUser();
  await assertRateLimit(supabase, "update_entry", 60);
  const cleanText = typeof text === "string" ? text.trim() : "";

  if (!cleanText) {
    throw new Error("A message cannot be empty");
  }
  if (cleanText.length > MAX_TEXT_LENGTH) {
    throw new Error(`Messages can be at most ${MAX_TEXT_LENGTH} characters`);
  }
  if (isRawBinaryUpload(cleanText)) {
    throw new Error("Binary data must be uploaded as a file");
  }
  if (SPOOFED_ENTRY_PREFIX.test(cleanText)) {
    throw new Error("Messages cannot start with a reserved entry prefix");
  }

  const { data: existing } = await supabase
    .from("entries")
    .select("id, kind, text, meta, created_by_device_id")
    .eq("id", entryId)
    .single();

  if (!existing || existing.created_by_device_id !== user.id) {
    throw new Error("You can only edit messages you sent");
  }
  if (
    existing.kind !== "text" ||
    SPOOFED_ENTRY_PREFIX.test(existing.text || "")
  ) {
    throw new Error("This entry cannot be edited as a text message");
  }

  const nextMeta = {
    ...(existing.meta || {}),
    edited_at: new Date().toISOString(),
  };
  const metaBytes = Buffer.byteLength(JSON.stringify(nextMeta), "utf8");
  if (metaBytes > MAX_META_BYTES) {
    throw new Error("Entry metadata is too large");
  }

  const { data, error } = await supabase
    .from("entries")
    .update({ text: cleanText, meta: nextMeta })
    .eq("id", entryId)
    .eq("created_by_device_id", user.id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to edit this message");
  }
  return data as Entry;
}

export async function createUploadIntents(
  spaceId: string,
  files: UploadIntentInput[],
): Promise<UploadIntent[]> {
  const { supabase } = await requireAnonymousUser();

  if (files.length < 1 || files.length > MAX_FILES_PER_ENTRY) {
    throw new Error(`Upload between 1 and ${MAX_FILES_PER_ENTRY} files`);
  }
  for (const file of files) {
    if (!file.name || file.name.length > 255) {
      throw new Error("Invalid file name");
    }
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      throw new Error("Files cannot be larger than 50 MB");
    }
  }

  const reservations = files.map((file) => ({
    path: `${spaceId}/${safeFileName(file.name)}`,
    size: file.size,
    mime: file.type || "application/octet-stream",
  }));
  const { data: reserved, error: reserveError } = await supabase.rpc(
    "reserve_upload_batch",
    {
      p_space_id: spaceId,
      p_files: reservations,
    },
  );
  if (reserveError) throw new Error(`Unable to reserve upload: ${reserveError.message}`);
  if (!reserved) throw new Error("Upload cannot start. Check room expiry, write access, storage allowance and the file limits, then retry.");

  return reservations.map(({ path }) => ({
    path,
    bucket: "files",
    maxBytes: MAX_UPLOAD_BYTES,
  }));
}

export async function createUploadedEntry(
  spaceId: string,
  items: Array<{
    path: string;
    name: string;
    type: string;
    size: number;
    width?: number;
    height?: number;
  }>,
  entryType: "files" | "photos" | "drawing" = "files",
): Promise<Entry> {
  const { supabase } = await requireAnonymousUser();
  if (items.length < 1 || items.length > MAX_FILES_PER_ENTRY) {
    throw new Error(`Upload between 1 and ${MAX_FILES_PER_ENTRY} files`);
  }

  const normalizedItems = items.map((item) => {
    const relativePath =
      typeof item.path === "string" && item.path.startsWith(`${spaceId}/`)
        ? item.path.slice(spaceId.length + 1)
        : "";
    if (
      !relativePath ||
      relativePath === "." ||
      relativePath === ".." ||
      /[\\/\0]/.test(relativePath)
    ) {
      throw new Error("Invalid upload path");
    }
    if (
      typeof item.size !== "number" ||
      !Number.isFinite(item.size) ||
      item.size <= 0 ||
      item.size > MAX_UPLOAD_BYTES
    ) {
      throw new Error("Invalid upload size");
    }
    const cleanName =
      typeof item.name === "string" && item.name.trim()
        ? item.name.slice(0, 255)
        : "file";
    const width =
      typeof item.width === "number" && Number.isFinite(item.width) && item.width > 0
        ? Math.round(item.width)
        : undefined;
    const height =
      typeof item.height === "number" && Number.isFinite(item.height) && item.height > 0
        ? Math.round(item.height)
        : undefined;
    return {
      path: item.path,
      url: `/api/files/${item.path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      name: cleanName,
      type: typeof item.type === "string" && item.type ? item.type : "application/octet-stream",
      size: Math.trunc(item.size),
      width,
      height,
    };
  });

  const { data: entry, error } = await supabase.rpc("create_file_entry", {
    p_space_id: spaceId,
    p_items: normalizedItems,
    p_presentation: entryType,
  });
  if (error || !entry) {
    throw new Error(error?.message || "Unable to publish uploaded files");
  }
  return (Array.isArray(entry) ? entry[0] : entry) as Entry;
}

export async function registerNoteAsset(
  noteSlug: string,
  item: {
    path: string;
    type: string;
    size: number;
    width?: number;
    height?: number;
  },
): Promise<void> {
  if (!NOTE_SLUG_PATTERN.test(noteSlug)) throw new Error("Invalid note");
  if (
    typeof item.size !== "number" ||
    !Number.isFinite(item.size) ||
    item.size <= 0 ||
    item.size > MAX_UPLOAD_BYTES
  ) {
    throw new Error("Invalid upload size");
  }
  const { supabase } = await requireAnonymousUser();
  const { data, error } = await supabase.rpc("register_note_asset", {
    p_note_slug: noteSlug,
    p_path: item.path,
    p_mime: item.type || "application/octet-stream",
    p_size: Math.trunc(item.size),
    p_width:
      typeof item.width === "number" && Number.isFinite(item.width) && item.width > 0
        ? Math.round(item.width)
        : null,
    p_height:
      typeof item.height === "number" && Number.isFinite(item.height) && item.height > 0
        ? Math.round(item.height)
        : null,
  });
  if (error) throw new Error(`Unable to register note image: ${error.message}`);
  if (!data) throw new Error("The note image upload expired");
}

export async function createNoteEntry(
  spaceId: string,
  title = "Untitled Note",
): Promise<{ noteSlug: string; publicCode: string; entryId: string }> {
  const { supabase } = await requireAnonymousUser();
  const noteSlug = noteId();
  const publicCode = noteId();
  const cleanTitle = title.trim().slice(0, 120) || "Untitled Note";

  const { data, error } = await supabase.rpc("create_note_entry", {
    p_space_id: spaceId,
    p_note_slug: noteSlug,
    p_public_code: publicCode,
    p_title: cleanTitle,
  });
  if (error || !data) throw new Error(`Unable to create note: ${error?.message || "Unknown error"}`);
  return {
    noteSlug: data.note_slug,
    publicCode: data.public_code,
    entryId: data.entry_id,
  };
}

export async function saveNoteSnapshot(
  noteSlug: string,
  snapshot: { title: string; content: string; content_json: Record<string, unknown>; version: number },
): Promise<{ version: number; updated_at: string; error?: never } | { error: string; version?: never; updated_at?: never }> {
  if (!NOTE_SLUG_PATTERN.test(noteSlug)) {
    return { error: "Note not found" };
  }
  if (
    typeof snapshot?.content !== "string" ||
    !snapshot.content_json ||
    typeof snapshot.content_json !== "object"
  ) {
    return { error: "Unable to save note. Please try again." };
  }
  if (Buffer.byteLength(snapshot.content, "utf8") > 1_000_000 || Buffer.byteLength(JSON.stringify(snapshot.content_json), "utf8") > 2_000_000) {
    return { error: "Note is too large" };
  }
  const { supabase } = await requireAnonymousUser();
  const { data, error } = await supabase.rpc("save_note_snapshot", {
    p_slug: noteSlug,
    p_title: (typeof snapshot.title === "string" ? snapshot.title : "").trim().slice(0, 120) || "Untitled Note",
    p_content_html: sanitizeNoteHtml(snapshot.content),
    p_content_json: snapshot.content_json,
    p_expected_version: snapshot.version,
  });
  if (error) {
    const expected = new Set([
      "Note is too large", "Note not found", "Note not found or expired",
      "Room is expired or read-only",
      "Only the note creator can edit this note", "Authentication required",
      "This note changed elsewhere. Reload before saving again.",
      "Too many requests. Please wait and try again.",
    ]);
    return { error: expected.has(error.message) ? error.message : "Unable to save note. Please try again." };
  }
  if (!data) return { error: "Unable to save note. Please try again." };
  return data;
}

export async function openOrCreateNoteForMarkdownFile({
  spaceId,
  fileName,
  markdownContent,
}: {
  spaceId: string;
  fileName: string;
  markdownContent: string;
}): Promise<{ noteSlug: string }> {
  const { supabase, user } = await requireAnonymousUser();
  const cleanTitle = (typeof fileName === "string" ? fileName : "").trim().slice(0, 120) || "Markdown Note";
  const rawMarkdown = typeof markdownContent === "string" ? markdownContent : "";
  if (Buffer.byteLength(rawMarkdown, "utf8") > MAX_MARKDOWN_IMPORT_BYTES) {
    throw new Error("Markdown file is too large to open as a note");
  }

  // Reuse an existing unlocked note with this title only if created by the current user
  const { data: existing } = await supabase
    .from("notes")
    .select("slug, id, title, entries!inner(space_id)")
    .eq("entries.space_id", spaceId)
    .eq("created_by_user_id", user.id)
    .eq("is_locked", false)
    .eq("title", cleanTitle)
    .limit(1)
    .maybeSingle();

  if (existing?.slug) {
    return { noteSlug: existing.slug };
  }

  // Convert markdown to sanitized HTML before creating the note entry
  const rawHtml = await marked.parse(rawMarkdown);
  const sanitizedHtml = sanitizeNoteHtml(typeof rawHtml === "string" ? rawHtml : "");
  if (Buffer.byteLength(sanitizedHtml, "utf8") > 1_000_000) {
    throw new Error("Markdown file is too large to open as a note");
  }

  const { noteSlug, entryId } = await createNoteEntry(spaceId, cleanTitle);

  const { error: updateError } = await supabase
    .from("notes")
    .update({
      content_html: sanitizedHtml,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", noteSlug)
    .eq("created_by_user_id", user.id);

  if (updateError) {
    await supabase.from("entries").delete().eq("id", entryId);
    throw new Error("Unable to populate note from Markdown file");
  }

  return { noteSlug };
}

export async function getNote(noteSlug: string): Promise<Note | null> {
  if (!NOTE_SLUG_PATTERN.test(noteSlug)) return null;
  const { supabase, user } = await requireAnonymousUser();
  const { data: openedNote, error: openError } = await supabase.rpc("open_note", {
    p_note_slug: noteSlug,
    p_display_name: displayNameForDevice(user.id),
  });
  if (openError) {
    if (/invitation|required|closed|not found|expired|Invalid room/i.test(openError.message)) return null;
    throw new Error("Unable to open note. Please try again.");
  }
  if (openedNote) {
    return {
      id: openedNote.id,
      slug: openedNote.slug,
      title: openedNote.title,
      content: sanitizeNoteHtml(openedNote.content_html || ""),
      content_json: openedNote.content_json,
      public_code: openedNote.public_code,
      visibility: openedNote.visibility,
      font_family: openedNote.font_family,
      space_id: openedNote.space_id,
      space_slug: openedNote.space_slug,
      created_by_device_id: openedNote.created_by_device_id,
      created_at: openedNote.created_at,
      updated_at: openedNote.updated_at,
      is_locked: openedNote.is_locked,
      is_owner: openedNote.is_owner,
      can_edit: openedNote.can_edit,
      version: openedNote.version,
    };
  }

  // Legacy notes that have not yet been migrated still use the original room
  // entry lookup below.
  const { data: joinedSpaceSlug } = await supabase.rpc("join_note", {
    p_note_slug: noteSlug,
    p_display_name: displayNameForDevice(user.id),
  });
  const cookieStore = await cookies();
  const legacyDeviceId = cookieStore.get("device_id")?.value;
  const isLegacyNonUuid =
    legacyDeviceId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      legacyDeviceId,
    );
  if (joinedSpaceSlug && isLegacyNonUuid) {
    await supabase.rpc("claim_legacy_space", {
      p_slug: joinedSpaceSlug,
      p_legacy_device_id: legacyDeviceId,
    });
  }

  // Locked notes are intentionally hidden by RLS. Their non-secret metadata is
  // duplicated on the room entry so the UI can show a locked state.
  let { data: entry } = await supabase
    .from("entries")
    .select("id, space_id, created_by_device_id, created_at, meta, spaces!inner(slug)")
    .eq("meta->>note_slug", noteSlug)
    .maybeSingle();

  if (!entry) {
    const legacy = await supabase
      .from("entries")
      .select("id, space_id, created_by_device_id, created_at, text, meta, spaces!inner(slug)")
      .like("text", `NOTE:${escapeLikePattern(noteSlug)}:%`)
      .limit(1)
      .maybeSingle();
    entry = legacy.data as any;

    if (entry && entry.created_by_device_id === user.id) {
      const parts = (entry as any).text?.replace("NOTE:", "").split(":") || [];
      const publicCode = parts[1] || noteId();
      const title = entry.meta?.title || parts.slice(2).join(":") || "Untitled Note";
      const { data: migrated } = await supabase
        .from("notes")
        .insert({
          entry_id: entry.id,
          slug: noteSlug,
          public_code: publicCode,
          title,
          content_html: sanitizeNoteHtml(entry.meta?.content || ""),
          font_family: entry.meta?.font_family || "system",
          visibility: entry.meta?.visibility || "unlisted",
          is_locked: false,
          created_by_user_id: user.id,
        })
        .select()
        .maybeSingle();

      if (migrated) {
        await supabase
          .from("entries")
          .update({
            text: `NOTE:${noteSlug}`,
            meta: {
              type: "note",
              note_slug: noteSlug,
              public_code: publicCode,
              title,
              is_locked: false,
            },
          })
          .eq("id", entry.id);
        return {
          id: migrated.id,
          slug: noteSlug,
          title,
          content: migrated.content_html,
          content_json: migrated.content_json,
          public_code: publicCode,
          visibility: migrated.visibility,
          font_family: migrated.font_family,
          space_id: entry.space_id,
          space_slug: (entry.spaces as any)?.slug,
          created_by_device_id: user.id,
          created_at: migrated.created_at,
          updated_at: migrated.updated_at,
          is_locked: false,
          is_owner: true,
          version: migrated.version,
        };
      }
    }
  }

  if (!entry) return null;
  const legacyParts = (entry as any).text?.replace("NOTE:", "").split(":") || [];
  return {
    id: entry.id,
    slug: noteSlug,
    title: entry.meta?.title || legacyParts.slice(2).join(":") || "Untitled Note",
    content:
      entry.meta?.is_locked ? "" : sanitizeNoteHtml(entry.meta?.content || ""),
    public_code: entry.meta?.public_code || legacyParts[1] || "",
    visibility: entry.meta?.visibility || "unlisted",
    font_family: entry.meta?.font_family || "system",
    space_id: entry.space_id,
    space_slug: (entry.spaces as any)?.slug,
    created_by_device_id: entry.created_by_device_id,
    created_at: entry.created_at,
    updated_at: entry.created_at,
    is_locked: Boolean(entry.meta?.is_locked),
    is_owner: entry.created_by_device_id === user.id,
  };
}

export async function deleteSpace(spaceId: string): Promise<void> {
  const { supabase, user } = await requireAnonymousUser();
  // The database trigger queues the room prefix for service-role cleanup. This
  // works even when other participants own some of the Storage objects.
  const { data, error } = await supabase
    .from("spaces")
    .delete()
    .eq("id", spaceId)
    .eq("creator_device_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Unable to delete space: ${error.message}`);
  if (!data) {
    throw new Error("Only the space creator can delete this space");
  }
}

export async function deleteSpaces(
  spaceIds: string[],
): Promise<{ deletedIds: string[] }> {
  const uniqueIds = Array.from(new Set(spaceIds.filter(Boolean)));
  if (uniqueIds.length === 0) return { deletedIds: [] };

  const { supabase, user } = await requireAnonymousUser();
  const { data, error } = await supabase
    .from("spaces")
    .delete()
    .in("id", uniqueIds)
    .eq("creator_device_id", user.id)
    .select("id");

  if (error) throw new Error(`Unable to delete spaces: ${error.message}`);
  return { deletedIds: (data ?? []).map((row) => row.id) };
}

export async function deleteEntry(entryId: string): Promise<void> {
  const { supabase, user } = await requireAnonymousUser();
  // Cascading asset deletion queues physical cleanup without requiring browser
  // Storage read/sign permissions. Logical access ends in this transaction.
  const { data, error } = await supabase
    .from("entries")
    .delete()
    .eq("id", entryId)
    .eq("created_by_device_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Unable to delete entry: ${error.message}`);
  if (!data) {
    throw new Error("You can only delete messages you sent");
  }
}

export async function reportEntry(entryId: string): Promise<void> {
  const { supabase, user } = await requireAnonymousUser();
  await assertRateLimit(supabase, "report_entry", 10, 3600);
  const { error } = await supabase.from("content_reports").upsert(
    {
      entry_id: entryId,
      reported_by_user_id: user.id,
      reason: "inappropriate",
      status: "open",
    },
    { onConflict: "entry_id,reported_by_user_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Unable to submit report: ${error.message}`);
}
