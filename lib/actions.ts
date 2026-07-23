"use server";

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import sanitizeHtml from "sanitize-html";
import { customAlphabet } from "nanoid";
import { displayNameForDevice } from "@/lib/display-name";
import {
  createServerSupabaseClient,
  requireAnonymousUser,
} from "@/lib/supabase";

const noteId = customAlphabet(
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
  12,
);
const MAX_TEXT_LENGTH = 50_000;
const MAX_META_BYTES = 250_000;
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
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
  recovery_key?: string;
}

export interface Entry {
  id: string;
  space_id: string;
  kind: "text" | "image" | "pdf" | "file";
  text: string | null;
  meta: Record<string, any> | null;
  created_by_device_id: string | null;
  created_at: string;
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
      img: ["src", "alt", "title", "width", "height"],
      span: ["data-type", "data-checked"],
      div: ["data-type"],
      li: ["data-checked"],
      ul: ["data-type"],
      input: ["type", "checked", "disabled"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      img: ["http", "https"],
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

function normalizeRoomCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
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
  const code = normalizeRoomCode(slug);
  if (code.length !== 4) return null;

  const { supabase, user } = await requireAnonymousUser();
  const { data, error } = await supabase.rpc("join_space", {
    p_slug: code,
    p_display_name: displayNameForDevice(user.id),
  });

  if (error || !data) return null;
  const result = Array.isArray(data) ? data[0] : data;
  return {
    ...(result.space as Space),
    recovery_key: result.recovery_key,
  };
}

export async function recoverSpace(
  slug: string,
  recoveryKey: string,
): Promise<boolean> {
  const { supabase, user } = await requireAnonymousUser();
  if (!/^\d{4}$/.test(slug) || !/^[A-F0-9]{20}$/i.test(recoveryKey.trim())) {
    return false;
  }
  const { data, error } = await supabase.rpc("recover_space", {
    p_slug: slug,
    p_recovery_key: recoveryKey.trim(),
    p_display_name: displayNameForDevice(user.id),
  });
  if (error) throw new Error(`Unable to recover space: ${error.message}`);
  return Boolean(data);
}

export async function createSpace(): Promise<Space> {
  const { supabase, user } = await requireAnonymousUser();
  const { data, error } = await supabase.rpc("create_space", {
    p_display_name: displayNameForDevice(user.id),
  });

  if (error || !data) {
    throw new Error(error?.message || "Unable to create a space");
  }

  const payload = (Array.isArray(data) ? data[0] : data) as {
    space?: Space;
    recovery_key?: string;
  } & Partial<Space>;
  const space = payload.space ?? (payload as Space);
  return {
    ...space,
    recovery_key: payload.recovery_key,
  };
}

export async function joinSpace(slug: string): Promise<Space | null> {
  return joinSpaceByCode(slug);
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

  if (cleanText?.startsWith("data:") || cleanText?.includes(";base64,")) {
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
      throw new Error("Files cannot be larger than 200 MB");
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
  if (!reserved) throw new Error("This space has reached its storage limit");

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

export async function getNote(noteSlug: string): Promise<Note | null> {
  const { supabase, user } = await requireAnonymousUser();
  const { data: openedNote, error: openError } = await supabase.rpc("open_note", {
    p_note_slug: noteSlug,
    p_display_name: displayNameForDevice(user.id),
  });
  if (openError) throw new Error(`Unable to open note: ${openError.message}`);
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
  if (joinedSpaceSlug && legacyDeviceId) {
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

// Activity is extended by the database trigger only when participants create or
// edit content. Merely viewing/enumerating a room no longer keeps it alive.
export async function updateSpaceActivity(_spaceId: string): Promise<void> {}
export async function updateSpaceActivityBySlug(_slug: string): Promise<void> {}

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
    .select("created_by_device_id, meta")
    .eq("id", entryId)
    .single();

  if (!entry || entry.created_by_device_id !== user.id) {
    throw new Error("You can only delete messages you sent");
  }

  const paths = Array.isArray(entry.meta?.items)
    ? entry.meta.items
        .map((item: any) => item.path)
        .filter((path: unknown): path is string => typeof path === "string")
    : [];
  if (paths.length) {
    const { error } = await supabase.storage.from("files").remove(paths);
    if (error) throw new Error(`Unable to remove attached files: ${error.message}`);
  }

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
