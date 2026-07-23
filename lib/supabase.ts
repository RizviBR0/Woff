import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are not configured");
  }

  return { url, anonKey };
}

/**
 * Request-scoped Supabase client. Authentication is an invisible anonymous
 * Supabase session, so RLS can use auth.uid() without adding a login UI.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. Middleware refreshes the
          // session; Server Actions and Route Handlers can write them.
        }
      },
    },
  });
}

export async function requireAnonymousUser() {
  const supabase = await createServerSupabaseClient();
  let {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    const { data, error: signInError } = await supabase.auth.signInAnonymously();
    user = data.user;
    error = signInError;
  }

  if (error || !user) {
    throw new Error(
      "Unable to create an anonymous session. Refresh and try again.",
    );
  }

  return { supabase, user };
}
