"use server";

import { createServerSupabaseClient } from "@/lib/supabase";
import { generateShortSlug, generateDeviceId } from "@/lib/slug";
import { cookies } from "next/headers";

export interface Space {
  id: string;
  slug: string;
  title: string | null;
  creator_device_id: string | null;
  visibility: "public" | "unlisted" | "private";
  allow_public_post: boolean;
  created_at: string;
  last_activity_at: string;
  is_pro?: boolean;
}

export async function createSpace(): Promise<Space> {
  // Get or create device ID
  const cookieStore = await cookies();
  let deviceId = cookieStore.get("device_id")?.value;

  if (!deviceId) {
    deviceId = generateDeviceId();
    cookieStore.set("device_id", deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }

  const supabase = await createServerSupabaseClient();

  // Generate unique slug and create space using optimistic insertion
  let attempts = 0;
  const maxAttempts = 5;
  let lastError = null;

  while (attempts < maxAttempts) {
    const slug = generateShortSlug();
    const { data, error } = await supabase
      .from("spaces")
      .insert({
        slug,
        creator_device_id: deviceId,
        visibility: "unlisted",
        allow_public_post: true,
      })
      .select()
      .single();

    if (!error) {
      /* console.log("💾 Space created successfully:", data); */
      return data;
    }

    // Code '23505' is unique key violation in Postgres
    if (error.code === "23505") {
      attempts++;
      lastError = error;
      continue;
    }

    throw new Error(`Failed to create space: ${error.message}`);
  }

  throw new Error(`Failed to create space after ${maxAttempts} attempts: ${lastError?.message}`);
}

export interface Entry {
  id: string;
  space_id: string;
  kind: "text" | "image" | "pdf" | "file";
  text: string | null;
  meta: any;
  created_by_device_id: string | null;
  created_at: string;
}

export async function createEntry(
  spaceId: string,
  kind: "text" | "image" | "pdf" | "file",
  text?: string,
  meta?: any,
): Promise<Entry> {
  // Get device ID from cookies
  const cookieStore = await cookies();
  const deviceId = cookieStore.get("device_id")?.value;

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("entries")
    .insert({
      space_id: spaceId,
      kind,
      text: text || null,
      meta: meta || null,
      created_by_device_id: deviceId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create entry: ${error.message}`);
  }

  return data;
}

export interface Note {
  id: string;
  slug: string;
  title: string;
  content: string;
  public_code: string;
  visibility: "public" | "unlisted" | "private";
  font_family: "system" | "serif" | "mono";
  space_id: string;
  space_slug?: string;
  created_by_device_id: string | null;
  created_at: string;
  updated_at: string;
  is_locked?: boolean;
  passcode?: string;
}

export async function createNoteEntry(
  spaceId: string,
  title?: string,
): Promise<{ noteSlug: string; publicCode: string; entryId: string }> {
  /* console.log(
    "💾 Creating note entry for space:",
    spaceId,
    "with title:",
    title,
  ); */

  // Generate unique slug and public code
  const noteSlug = generateShortSlug();
  const publicCode = generateShortSlug();

  /* console.log("💾 Generated slugs - note:", noteSlug, "public:", publicCode); */

  // Create entry with note data stored as text
  const noteText = `NOTE:${noteSlug}:${publicCode}:${title || "Untitled Note"}`;

  /* console.log("💾 Creating entry with text:", noteText); */

  try {
    const entry = await createEntry(spaceId, "text", noteText, {
      type: "note",
      title: title || "Untitled Note",
      content: "",
      font_family: "system",
      visibility: "unlisted",
    });

    /* console.log("💾 Entry created successfully:", entry.id); */

    return {
      noteSlug,
      publicCode,
      entryId: entry.id,
    };
  } catch (error) {
    /* console.error("💾 Error creating note entry:", error); */
    throw error;
  }
}

export async function updateNote(
  noteSlug: string,
  updates: Partial<{
    title: string;
    content: string;
    visibility: "public" | "unlisted" | "private";
    font_family: string;
    is_locked: boolean;
    passcode: string;
  }>,
): Promise<Note> {
  // Get or create device ID
  const cookieStore = await cookies();
  let deviceId = cookieStore.get("device_id")?.value;

  if (!deviceId) {
    deviceId = generateDeviceId();
    cookieStore.set("device_id", deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }

  const supabase = await createServerSupabaseClient();

  // Find the entry with this note slug
  const { data: entries, error: fetchError } = await supabase
    .from("entries")
    .select("id, space_id, text, meta, created_by_device_id, created_at")
    .eq("kind", "text")
    .like("text", `NOTE:${noteSlug}:%`)
    .limit(1);

  if (fetchError) {
    /* console.error("Database error:", fetchError); */
    throw new Error(`Database error: ${fetchError.message}`);
  }

  if (!entries || entries.length === 0) {
    // Note doesn't exist in database, create a mock response
    throw new Error(
      "Note not found in database - this appears to be a mock note",
    );
  }

  const entry = entries[0];



  // Parse existing note data
  const noteData = entry.text?.replace("NOTE:", "").split(":") || [];
  const [, publicCode, currentTitle] = noteData;

  // Update meta with new data
  const updatedMeta = {
    ...entry.meta,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  // Update text if title changed
  let updatedText = entry.text;
  if (updates.title && updates.title !== currentTitle) {
    updatedText = `NOTE:${noteSlug}:${publicCode}:${updates.title}`;
  }

  // Update entry
  /* console.log("💾 Attempting to update entry:", entry.id, "with data:", {
    text: updatedText,
    meta: updatedMeta,
  }); */

  const { data, error } = await supabase
    .from("entries")
    .update({
      text: updatedText,
      meta: updatedMeta,
    })
    .eq("id", entry.id)
    .select();

  if (error) {
    /* console.error("💾 Update error:", error); */
    /* console.error("💾 Update error details:", {
      message: error.message,
      code: error.code,
      hint: error.hint,
      details: error.details,
    }); */
    throw new Error(`Failed to update note: ${error.message}`);
  }

  /* console.log("💾 Update result:", data); */

  if (!data || data.length === 0) {
    /* console.warn("No data returned from update, using original entry data"); */
    // Fall back to using the original entry data with updates applied
    const updatedEntry = {
      ...entry,
      text: updatedText,
      meta: updatedMeta,
    };

    return {
      id: updatedEntry.id,
      slug: noteSlug,
      title: updates.title || currentTitle || "Untitled Note",
      content: updatedMeta.content || "",
      public_code: publicCode,
      visibility: updatedMeta.visibility || "unlisted",
      font_family: updatedMeta.font_family || "system",
      space_id: updatedEntry.space_id,
      created_by_device_id: updatedEntry.created_by_device_id,
      created_at: updatedEntry.created_at,
      updated_at: updatedMeta.updated_at || updatedEntry.created_at,
      is_locked: updatedMeta.is_locked || false,
      passcode: updatedMeta.passcode || undefined,
    };
  }

  const updatedEntry = data[0];

  // Return note-like object
  return {
    id: updatedEntry.id,
    slug: noteSlug,
    title: updates.title || currentTitle || "Untitled Note",
    content: updatedMeta.content || "",
    public_code: publicCode,
    visibility: updatedMeta.visibility || "unlisted",
    font_family: updatedMeta.font_family || "system",
    space_id: updatedEntry.space_id,
    created_by_device_id: updatedEntry.created_by_device_id,
    created_at: updatedEntry.created_at,
    updated_at: updatedMeta.updated_at || updatedEntry.created_at,
    is_locked: updatedMeta.is_locked || false,
    passcode: updatedMeta.passcode || undefined,
  };
}

export async function getNote(noteSlug: string): Promise<Note | null> {
  const supabase = await createServerSupabaseClient();

  // Find the entry with this note slug and join with spaces to get the space slug
  const { data: entries, error } = await supabase
    .from("entries")
    .select(
      `
      *,
      spaces:space_id (
        slug
      )
    `,
    )
    .eq("kind", "text")
    .like("text", `NOTE:${noteSlug}:%`);

  if (error || !entries || entries.length === 0) {
    return null;
  }

  const entry = entries[0];

  // Parse note data from text
  const noteData = entry.text?.replace("NOTE:", "").split(":") || [];
  const [, publicCode, title] = noteData;

  return {
    id: entry.id,
    slug: noteSlug,
    title: title || "Untitled Note",
    content: entry.meta?.content || "",
    public_code: publicCode,
    visibility: entry.meta?.visibility || "unlisted",
    font_family: entry.meta?.font_family || "system",
    space_id: entry.space_id,
    space_slug: (entry.spaces as any)?.slug,
    created_by_device_id: entry.created_by_device_id,
    created_at: entry.created_at,
    updated_at: entry.meta?.updated_at || entry.created_at,
    is_locked: entry.meta?.is_locked || false,
    passcode: entry.meta?.passcode || undefined,
  };
}

export async function verifyNotePasscode(
  noteSlug: string,
  passcode: string,
): Promise<boolean> {
  const note = await getNote(noteSlug);

  if (!note || !note.is_locked) {
    return true; // Note doesn't exist or isn't locked
  }

  return note.passcode === passcode;
}

export async function updateNoteEntry(
  entryId: string,
  noteTitle: string,
): Promise<void> {
  // Get device ID from cookies
  const cookieStore = await cookies();
  const deviceId = cookieStore.get("device_id")?.value;

  const supabase = await createServerSupabaseClient();

  // Get the entry to verify ownership and extract note data
  const { data: entry, error: fetchError } = await supabase
    .from("entries")
    .select("text, created_by_device_id")
    .eq("id", entryId)
    .single();

  if (fetchError || !entry) {
    throw new Error("Entry not found");
  }



  // Extract note data from the text field
  if (!entry.text?.startsWith("NOTE:")) {
    throw new Error("Invalid note entry");
  }

  const noteData = entry.text.replace("NOTE:", "").split(":");
  const noteSlug = noteData[0];
  const publicCode = noteData[1];

  // Update the entry with new title
  const newText = `NOTE:${noteSlug}:${publicCode}:${noteTitle}`;

  const { error } = await supabase
    .from("entries")
    .update({ text: newText })
    .eq("id", entryId);

  if (error) {
    throw new Error(`Failed to update note entry: ${error.message}`);
  }
}

export async function validateRoomCode(roomCode: string): Promise<boolean> {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: space, error } = await supabase
      .from("spaces")
      .select("id")
      .eq("slug", roomCode)
      .single();

    if (error || !space) {
      return false;
    }

    return true;
  } catch (error) {
    /* console.error("Error validating room code:", error); */
    return false;
  }
}

// Update space last activity timestamp
export async function updateSpaceActivity(spaceId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  await supabase
    .from("spaces")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", spaceId);
}

// Update space last activity timestamp by slug
export async function updateSpaceActivityBySlug(slug: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  await supabase
    .from("spaces")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("slug", slug);
}

// Ensure device ID cookie exists and return it
export async function ensureDeviceId(): Promise<string> {
  const cookieStore = await cookies();
  let deviceId = cookieStore.get("device_id")?.value;

  if (!deviceId) {
    deviceId = generateDeviceId();
    cookieStore.set("device_id", deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }

  return deviceId;
}

export async function getPlanStatus(): Promise<{
  isPro: boolean;
  deviceId: string;
}> {
  const deviceId = await ensureDeviceId();
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("device_sessions")
    .select("is_pro")
    .eq("device_id", deviceId)
    .single();

  return {
    isPro: data?.is_pro || false,
    deviceId,
  };
}

export async function deleteSpace(spaceId: string): Promise<void> {
  const deviceId = await ensureDeviceId();
  const supabase = await createServerSupabaseClient();

  // Verify ownership
  const { data: space, error: fetchError } = await supabase
    .from("spaces")
    .select("creator_device_id")
    .eq("id", spaceId)
    .single();

  if (fetchError || !space) {
    throw new Error("Space not found or validation failed");
  }

  if (space.creator_device_id !== deviceId) {
    throw new Error("Unauthorized to delete this space");
  }

  // 1. Delete all uploaded files from storage bucket for this space.
  //    Files live under `{spaceId}/` in the "files" bucket.
  //    We paginate to handle spaces with many files.
  try {
    let offset = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: fileList, error: listError } = await supabase.storage
        .from("files")
        .list(spaceId, { limit: pageSize, offset });

      if (listError) {
        console.error("💾 Error listing files in storage bucket:", listError);
        break;
      }

      if (!fileList || fileList.length === 0) {
        hasMore = false;
        break;
      }

      const filePaths = fileList.map((f) => `${spaceId}/${f.name}`);
      const { error: removeError } = await supabase.storage
        .from("files")
        .remove(filePaths);

      if (removeError) {
        console.error("💾 Error removing files from storage bucket:", removeError);
      } else {
        console.log(`💾 Successfully deleted ${filePaths.length} file(s) from storage:`, filePaths);
      }

      if (fileList.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
      }
    }
  } catch (err) {
    console.error("💾 Unexpected storage cleanup error:", err);
    // Storage cleanup is best-effort; continue with deletion
  }

  // 2. Delete the space row.
  //    CASCADE foreign keys handle: entries → assets → (trigger logs to deleted_storage_keys), views
  const { error: deleteError } = await supabase
    .from("spaces")
    .delete()
    .eq("id", spaceId);

  if (deleteError) {
    throw new Error(`Failed to delete space: ${deleteError.message}`);
  }
}

export async function deleteEntry(entryId: string): Promise<void> {
  const deviceId = await ensureDeviceId();
  const supabase = await createServerSupabaseClient();

  // 1. Fetch the entry to check ownership
  const { data: entry, error: fetchError } = await supabase
    .from("entries")
    .select("created_by_device_id, space_id")
    .eq("id", entryId)
    .single();

  if (fetchError || !entry) {
    throw new Error("Entry not found");
  }

  // 2. Fetch the space to check if the user is the creator of the space
  const { data: space } = await supabase
    .from("spaces")
    .select("creator_device_id")
    .eq("id", entry.space_id)
    .single();

  const isEntryCreator = entry.created_by_device_id === deviceId;
  const isSpaceCreator = space?.creator_device_id === deviceId;

  if (!isEntryCreator && !isSpaceCreator) {
    throw new Error("Unauthorized to delete this entry");
  }

  // 3. Delete related files from storage if the entry has assets
  const { data: fullEntry } = await supabase
    .from("entries")
    .select("kind, meta")
    .eq("id", entryId)
    .single();

  if (fullEntry && fullEntry.kind === "file" && fullEntry.meta?.items) {
    const items = fullEntry.meta.items || [];
    const filePaths = items.map((it: any) => {
      try {
        const urlParts = it.url.split("/object/public/files/");
        if (urlParts.length > 1) {
          return decodeURIComponent(urlParts[1]);
        }
      } catch (err) {
        console.error("Failed to parse file url for deletion:", err);
      }
      return null;
    }).filter(Boolean);

    if (filePaths.length > 0) {
      const { error: removeError } = await supabase.storage
        .from("files")
        .remove(filePaths);

      if (removeError) {
        console.error("Failed to remove files from storage:", removeError);
      }
    }
  }

  // 4. Delete the entry row
  const { error: deleteError } = await supabase
    .from("entries")
    .delete()
    .eq("id", entryId);

  if (deleteError) {
    throw new Error(`Failed to delete entry: ${deleteError.message}`);
  }
}

