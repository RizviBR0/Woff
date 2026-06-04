"use client";

// Re-export the singleton client instance from supabase.ts to avoid creating
// a duplicate Supabase instance (and duplicate WebSocket connections).
import { createClientSupabaseClient } from "./supabase";

export const supabaseBrowser = createClientSupabaseClient();
