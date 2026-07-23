"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let instance: SupabaseClient | null = null;

export function createClientSupabaseClient() {
  if (instance) return instance;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are not configured");
  }

  instance = createBrowserClient(url, anonKey, {
    realtime: { params: { eventsPerSecond: 10 } },
  });

  return instance;
}

export const supabaseBrowser = createClientSupabaseClient();
