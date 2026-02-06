import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side Supabase client for real-time and client operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Singleton instance for client-side Supabase client
let clientSupabaseInstance: SupabaseClient | null = null;

// Client-side Supabase client with singleton pattern to avoid creating multiple instances
export const createClientSupabaseClient = () => {
  if (clientSupabaseInstance) {
    return clientSupabaseInstance;
  }
  clientSupabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10, // Rate limit realtime events
      },
    },
  });
  return clientSupabaseInstance;
};

// Server-side Supabase client with device ID context
export async function createServerSupabaseClient() {
  // For now, just return the basic client
  // RLS policies will be simplified to allow operations
  return createClient(supabaseUrl, supabaseAnonKey);
}
