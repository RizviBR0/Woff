import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase client with device ID context
export async function createServerSupabaseClient() {
  // For now, just return the basic client
  // RLS policies will be simplified to allow operations
  return createClient(supabaseUrl, supabaseAnonKey);
}
