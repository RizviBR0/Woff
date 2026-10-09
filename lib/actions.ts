"use server";

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
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
const MAX_TEXT_LENGTH = 50_000;
const MAX_META_BYTES = 250_000;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_FILES_PER_ENTRY = 20;

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
      img: ["src", "alt", "title", "width", "height", "data-align"],
      span: ["data-type", "data-checked"],
      div: ["data-type"],
      li: ["data-checked", "data-type"],
      ul: ["data-type"],
      ol: ["type", "start"],
      input: ["type", "checked", "disabled"],
      p: ["style", "class"],
      h1: ["style", "class"],
      h2: ["style", "class"],
      h3: ["style", "class"],
      blockquote: ["style", "class"],
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
    },
  });
}

function safeFileName(value: string) {
  const extension = value.includes(".")
    ? `.${value.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10)}`
    : "";
  return `${randomUUID()}${extension}`;
}

function hashPasscode(passcode: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(passcode, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function checkPasscode(passcode: string, stored: string) {
  try {
    const [saltHex, hashHex] = stored.split(":");
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(passcode, Buffer.from(saltHex, "hex"), 32);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
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

export async function setRoomPairing(spaceId: string, minutes: number): Promise<string | null> {
  const { supabase } = await requireAnonymousUser();
  const { data, error } = await supabase.rpc("set_room_pairing", { p_space_id: spaceId, p_minutes: minutes });
  if (error) throw new Error(error.message);
  return data;
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
    after(async () => { await supabase.rpc("record_room_event", { p_space_id: spaceId, p_event: event }); });
  } catch { /* Metrics must not interrupt sharing. */ }
}

export async function setNotePrivacy(noteSlug: string, isLocked: boolean, version: number): Promise<{ version: number; is_locked: boolean }> {
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
  meta?: Record<string, any>,
): Promise<Entry> {
  const { supabase, user } = await requireAnonymousUser();
  await assertRateLimit(supabase, "create_entry", 60);
  const cleanText = text?.trim() || null;

  if (cleanText && cleanText.length > MAX_TEXT_LENGTH) {
    throw new Error(`Messages can be at most ${MAX_TEXT_LENGTH} characters`);
  }

  if (isRawBinaryUpload(cleanText)) {
    throw new Error("Binary data must be uploaded as a file");
  }

  const metaBytes = meta ? Buffer.byteLength(JSON.stringify(meta), "utf8") : 0;
  if (metaBytes > MAX_META_BYTES) {
    throw new Error("Entry metadata is too large");
  }

  const { data, error } = await supabase
    .from("entries")
    .insert({
      space_id: spaceId,
      kind,
      text: cleanText,
      meta: meta || null,
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
  const cleanText = text.trim();

  if (!cleanText) {
    throw new Error("A message cannot be empty");
  }
  if (cleanText.length > MAX_TEXT_LENGTH) {
    throw new Error(`Messages can be at most ${MAX_TEXT_LENGTH} characters`);
  }
  if (isRawBinaryUpload(cleanText)) {
    throw new Error("Binary data must be uploaded as a file");
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
    /^(NOTE:|PHOTO:|PHOTOS:|DRAWING:)/.test(existing.text || "")
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

export async function createUploadIntent(
  spaceId: string,
  file: UploadIntentInput,
): Promise<UploadIntent> {
  const [intent] = await createUploadIntents(spaceId, [file]);
  return intent;
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
    if (!item.path.startsWith(`${spaceId}/`)) {
      throw new Error("Invalid upload path");
    }
    if (item.size <= 0 || item.size > MAX_UPLOAD_BYTES) {
      throw new Error("Invalid upload size");
    }
    return {
      path: item.path,
      url: `/api/files/${item.path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      name: item.name.slice(0, 255),
      type: item.type || "application/octet-stream",
      size: item.size,
      width: item.width,
      height: item.height,
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
  const { supabase } = await requireAnonymousUser();
  const { data, error } = await supabase.rpc("register_note_asset", {
    p_note_slug: noteSlug,
    p_path: item.path,
    p_mime: item.type || "application/octet-stream",
    p_size: item.size,
    p_width: item.width || null,
    p_height: item.height || null,
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
  if (Buffer.byteLength(snapshot.content, "utf8") > 1_000_000 || Buffer.byteLength(JSON.stringify(snapshot.content_json), "utf8") > 2_000_000) {
    return { error: "Note is too large" };
  }
  const { supabase } = await requireAnonymousUser();
  const { data, error } = await supabase.rpc("save_note_snapshot", {
    p_slug: noteSlug,
    p_title: snapshot.title.trim().slice(0, 120) || "Untitled Note",
    p_content_html: sanitizeNoteHtml(snapshot.content),
    p_content_json: snapshot.content_json,
    p_expected_version: snapshot.version,
  });
  if (error) {
    const expected = new Set([
      "Note is too large", "Note not found", "Note not found or expired",
      "Only the note creator can edit this note", "Authentication required",
      "This note changed elsewhere. Reload before saving again.",
      "Too many requests. Please wait and try again.",
    ]);
    return { error: expected.has(error.message) ? error.message : "Unable to save note. Please try again." };
  }
  if (!data) return { error: "Unable to save note. Please try again." };
  return data;
}

export async function updateNote(
  noteSlug: string,
  updates: Partial<{
    title: string;
    content: string;
    content_json: Record<string, unknown>;
    visibility: "public" | "unlisted" | "private";
    font_family: "system" | "serif" | "mono";
    is_locked: boolean;
    passcode: string;
    version: number;
  }>,
): Promise<Note> {
  const { supabase, user } = await requireAnonymousUser();
  await assertRateLimit(supabase, "update_note", 120);
  const { data: current, error: fetchError } = await supabase
    .from("notes")
    .select("*, entries!inner(space_id, created_by_device_id)")
    .eq("slug", noteSlug)
    .single();

  if (fetchError || !current) throw new Error("Note not found");
  if (current.created_by_user_id !== user.id) {
    throw new Error("Only the note creator can edit this note");
  }

  const nextVersion = current.version + 1;
  const updateRow: Record<string, unknown> = {
    version: nextVersion,
    updated_at: new Date().toISOString(),
  };

  if (updates.title !== undefined) {
    updateRow.title = updates.title.trim().slice(0, 120) || "Untitled Note";
  }
  if (updates.content !== undefined) {
    if (updates.content.length > 1_000_000) throw new Error("Note is too large");
    updateRow.content_html = sanitizeNoteHtml(updates.content);
  }
  if (updates.content_json !== undefined) updateRow.content_json = updates.content_json;
  if (updates.visibility !== undefined) updateRow.visibility = updates.visibility;
  if (updates.font_family !== undefined) updateRow.font_family = updates.font_family;
  if (updates.is_locked !== undefined) {
    updateRow.is_locked = updates.is_locked;
    updateRow.passcode_hash =
      updates.is_locked && updates.passcode
        ? hashPasscode(updates.passcode.slice(0, 64))
        : null;
  }

  const expectedVersion = updates.version ?? current.version;
  const { data: updated, error } = await supabase
    .from("notes")
    .update(updateRow)
    .eq("id", current.id)
    .eq("version", expectedVersion)
    .select()
    .maybeSingle();

  if (error) throw new Error(`Unable to save note: ${error.message}`);
  if (!updated) {
    throw new Error("This note changed elsewhere. Reload before saving again.");
  }

  const entryMeta = {
    type: "note",
    note_slug: noteSlug,
    public_code: updated.public_code,
    title: updated.title,
    is_locked: updated.is_locked,
  };
  await supabase
    .from("entries")
    .update({ text: `NOTE:${noteSlug}`, meta: entryMeta })
    .eq("id", updated.entry_id);

  return {
    id: updated.id,
    slug: updated.slug,
    title: updated.title,
    content: updated.content_html,
    content_json: updated.content_json,
    public_code: updated.public_code,
    visibility: updated.visibility,
    font_family: updated.font_family,
    space_id: (current.entries as any).space_id,
    created_by_device_id: user.id,
    created_at: updated.created_at,
    updated_at: updated.updated_at,
    is_locked: updated.is_locked,
    is_owner: true,
    version: updated.version,
  };
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
  const { supabase } = await requireAnonymousUser();
  const cleanTitle = fileName.trim().slice(0, 120) || "Markdown Note";

  // Check if a note with this title already exists in this space
  const { data: existing } = await supabase
    .from("notes")
    .select("slug, id, title, entries!inner(space_id)")
    .eq("entries.space_id", spaceId)
    .eq("title", cleanTitle)
    .limit(1)
    .maybeSingle();

  if (existing?.slug) {
    return { noteSlug: existing.slug };
  }

  // Create new note entry in space
  const { noteSlug } = await createNoteEntry(spaceId, cleanTitle);

  // Convert markdown to sanitized HTML
  const rawHtml = await marked.parse(markdownContent || "");
  const sanitizedHtml = sanitizeNoteHtml(typeof rawHtml === "string" ? rawHtml : "");

  // Update note content
  await supabase
    .from("notes")
    .update({
      content_html: sanitizedHtml,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", noteSlug);

  return { noteSlug };
}

export async function getNote(noteSlug: string): Promise<Note | null> {
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
      .like("text", `NOTE:${noteSlug}:%`)
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

export async function verifyNotePasscode(
  noteSlug: string,
  passcode: string,
): Promise<boolean> {
  // The hash is never returned by getNote or the API. Owners can verify their
  // own lock locally; participant unlocking is handled by a dedicated RPC in
  // deployments that enable locked shared notes.
  const { supabase, user } = await requireAnonymousUser();
  const { data } = await supabase
    .from("notes")
    .select("passcode_hash, created_by_user_id")
    .eq("slug", noteSlug)
    .maybeSingle();
  if (!data || data.created_by_user_id !== user.id || !data.passcode_hash) {
    return false;
  }
  return checkPasscode(passcode, data.passcode_hash);
}

export async function updateNoteEntry(entryId: string, noteTitle: string) {
  const { supabase, user } = await requireAnonymousUser();
  const cleanTitle = noteTitle.trim().slice(0, 120) || "Untitled Note";
  const { data: entry } = await supabase
    .from("entries")
    .select("id, meta, created_by_device_id")
    .eq("id", entryId)
    .single();

  if (!entry || entry.created_by_device_id !== user.id) {
    throw new Error("Only the note creator can rename this note");
  }

  const noteSlug = entry.meta?.note_slug;
  if (!noteSlug) throw new Error("Invalid note entry");

  const { error } = await supabase
    .from("notes")
    .update({ title: cleanTitle, updated_at: new Date().toISOString() })
    .eq("slug", noteSlug)
    .eq("created_by_user_id", user.id);
  if (error) throw new Error(`Unable to rename note: ${error.message}`);

  await supabase
    .from("entries")
    .update({ meta: { ...entry.meta, title: cleanTitle } })
    .eq("id", entryId);
}

export async function validateRoomCode(roomCode: string): Promise<boolean> {
  try {
    return Boolean(await joinSpaceByCode(roomCode));
  } catch {
    return false;
  }
}

export async function ensureDeviceId(): Promise<string> {
  const { user } = await requireAnonymousUser();
  return user.id;
}

export async function getPlanStatus(): Promise<{
  isPro: boolean;
  deviceId: string;
}> {
  const { supabase, user } = await requireAnonymousUser();
  const { data } = await supabase
    .from("spaces")
    .select("is_pro")
    .eq("creator_device_id", user.id)
    .eq("is_pro", true)
    .limit(1)
    .maybeSingle();
  return { isPro: Boolean(data?.is_pro), deviceId: user.id };
}

export async function deleteSpace(spaceId: string): Promise<void> {
  const { supabase, user } = await requireAnonymousUser();
  const { data: space } = await supabase
    .from("spaces")
    .select("creator_device_id")
    .eq("id", spaceId)
    .single();

  if (!space || space.creator_device_id !== user.id) {
    throw new Error("Only the space creator can delete this space");
  }

  // The database trigger queues the room prefix for service-role cleanup. This
  // works even when other participants own some of the Storage objects.
  const { error } = await supabase.from("spaces").delete().eq("id", spaceId);
  if (error) throw new Error(`Unable to delete space: ${error.message}`);
}

export async function deleteEntry(entryId: string): Promise<void> {
  const { supabase, user } = await requireAnonymousUser();
  const { data: entry } = await supabase
    .from("entries")
    .select("created_by_device_id")
    .eq("id", entryId)
    .single();

  if (!entry || entry.created_by_device_id !== user.id) {
    throw new Error("You can only delete messages you sent");
  }

  // Cascading asset deletion queues physical cleanup without requiring browser
  // Storage read/sign permissions. Logical access ends in this transaction.
  const { error } = await supabase.from("entries").delete().eq("id", entryId);
  if (error) throw new Error(`Unable to delete entry: ${error.message}`);
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

export async function getCurrentIdentity() {
  const { user } = await requireAnonymousUser();
  return { id: user.id, displayName: displayNameForDevice(user.id) };
}

export async function getLegacyDeviceCookie() {
  const cookieStore = await cookies();
  return cookieStore.get("device_id")?.value || null;
}
