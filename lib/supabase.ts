import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Singleton instance for client-side Supabase client (with realtime)
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

// Re-export singleton for backward compatibility (client-side only)
export const supabase = createClientSupabaseClient();

// Server-side Supabase client — fresh per request to avoid leaking state
// across serverless invocations. The underlying Node.js HTTP agent pools
// TCP connections, so creating a new JS client is cheap.
export async function createServerSupabaseClient() {
  return createClient(supabaseUrl, supabaseAnonKey);
}

