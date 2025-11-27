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

  // Generate unique slug
  let slug = generateShortSlug();
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const { data: existing } = await supabase
      .from("spaces")
      .select("slug")
      .eq("slug", slug)
      .single();

    if (!existing) break;

    slug = generateShortSlug();
    attempts++;
  }

  // Create space
  console.log("💾 Creating space with data:", {
    slug,
    creator_device_id: deviceId,
    visibility: "unlisted",
    allow_public_post: true,
  });

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

  if (error) {
    console.error("💾 Error creating space:", error);
    console.error("💾 Space creation error details:", {
      message: error.message,
      code: error.code,
      hint: error.hint,
      details: error.details,
    });
    throw new Error(`Failed to create space: ${error.message}`);
  }

  console.log("💾 Space created successfully:", data);
  return data;
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
  meta?: any
): Promise<Entry> {
  // Get device ID from cookies
  const cookieStore = await cookies();
  const deviceId = cookieStore.get("device_id")?.value;

  const supabase = await createServerSupabaseClient();

  // First, verify the user has permission to post in this space
  const { data: space } = await supabase
    .from("spaces")
    .select("creator_device_id, allow_public_post")
    .eq("id", spaceId)
    .single();

  if (!space) {
    throw new Error("Space not found");
  }

  // Check if user can post (either creator or public posting allowed)
  const canPost =
    space.creator_device_id === deviceId || space.allow_public_post;

  if (!canPost) {
    throw new Error("Not authorized to post in this space");
  }

  console.log("💾 Inserting entry with data:", {
    space_id: spaceId,
    kind,
    text: text || null,
    meta: meta || null,
    created_by_device_id: deviceId,
  });

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
    console.error("💾 Error inserting entry:", error);
    console.error("💾 Insert error details:", {
      message: error.message,
      code: error.code,
      hint: error.hint,
      details: error.details,
    });
    throw new Error(`Failed to create entry: ${error.message}`);
  }

  console.log("💾 Entry inserted successfully:", data);
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
  title?: string
): Promise<{ noteSlug: string; publicCode: string; entryId: string }> {
  console.log(
    "💾 Creating note entry for space:",
    spaceId,
    "with title:",
    title
  );

  // Generate unique slug and public code
  const noteSlug = generateShortSlug();
  const publicCode = generateShortSlug();

  console.log("💾 Generated slugs - note:", noteSlug, "public:", publicCode);

  // Create entry with note data stored as text
  const noteText = `NOTE:${noteSlug}:${publicCode}:${title || "Untitled Note"}`;

  console.log("💾 Creating entry with text:", noteText);

  try {
    const entry = await createEntry(spaceId, "text", noteText, {
      type: "note",
      title: title || "Untitled Note",
      content: "",
      font_family: "system",
      visibility: "unlisted",
    });

    console.log("💾 Entry created successfully:", entry.id);

    return {
      noteSlug,
      publicCode,
      entryId: entry.id,
    };
  } catch (error) {
    console.error("💾 Error creating note entry:", error);
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
  }>
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
    .select("*")
    .eq("kind", "text")
    .like("text", `NOTE:${noteSlug}:%`);

  if (fetchError) {
    console.error("Database error:", fetchError);
    throw new Error(`Database error: ${fetchError.message}`);
  }

  if (!entries || entries.length === 0) {
    // Note doesn't exist in database, create a mock response
    throw new Error(
      "Note not found in database - this appears to be a mock note"
    );
  }

  const entry = entries[0];

  // Allow anyone to update notes in shared spaces - check if space allows public posting
  const { data: space, error: spaceError } = await supabase
    .from("spaces")
    .select("creator_device_id, allow_public_post")
    .eq("id", entry.space_id)
    .single();

  if (spaceError || !space) {
    throw new Error("Space not found");
  }

  // Check if user can edit (either creator or public posting allowed)
  const canEdit =
    space.creator_device_id === deviceId || space.allow_public_post;

  if (!canEdit) {
    throw new Error("Not authorized to update this note");
  }

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
  console.log("💾 Attempting to update entry:", entry.id, "with data:", {
    text: updatedText,
    meta: updatedMeta,
  });

  const { data, error } = await supabase
    .from("entries")
    .update({
      text: updatedText,
      meta: updatedMeta,
    })
    .eq("id", entry.id)
    .select();

  if (error) {
    console.error("💾 Update error:", error);
    console.error("💾 Update error details:", {
      message: error.message,
      code: error.code,
      hint: error.hint,
      details: error.details,
    });
    throw new Error(`Failed to update note: ${error.message}`);
  }

  console.log("💾 Update result:", data);

  if (!data || data.length === 0) {
    console.warn("No data returned from update, using original entry data");
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
    `
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
  passcode: string
): Promise<boolean> {
  const note = await getNote(noteSlug);

  if (!note || !note.is_locked) {
    return true; // Note doesn't exist or isn't locked
  }

  return note.passcode === passcode;
}

export async function updateNoteEntry(
  entryId: string,
  noteTitle: string
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

  // Check if user owns this entry
  if (entry.created_by_device_id !== deviceId) {
    throw new Error("Not authorized to update this entry");
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
    console.error("Error validating room code:", error);
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
