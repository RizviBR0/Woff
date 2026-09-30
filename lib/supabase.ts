import "server-only";
import { cache } from "react";

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

function parseJwtPayload(token: string): { sub?: string; exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const requireAnonymousUser = cache(async () => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let userId: string | null = null;
  if (session?.access_token) {
    const payload = parseJwtPayload(session.access_token);
    if (payload?.sub && (!payload.exp || payload.exp * 1000 > Date.now() + 30000)) {
      userId = payload.sub;
    }
  }

  if (!userId) {
    const { data, error: signInError } =
      await supabase.auth.signInAnonymously();
    if (signInError || !data.user) {
      throw new Error(
        "Unable to create an anonymous session. Refresh and try again.",
      );
    }
    userId = data.user.id;
  }

  return { supabase, user: { id: userId } };
});
