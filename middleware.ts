import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function parseJwtPayload(token: string): { sub?: string; exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob === "function"
        ? atob(base64)
        : Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const needsIdentity =
    /^\/\d{4}(?:\/|$)/.test(pathname) ||
    pathname === "/new" ||
    pathname.startsWith("/n/");
  // Marketing and information pages do not query protected room data. Avoid an
  // Auth network request on every asset-free page navigation.
  if (!needsIdentity) return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  let hasValidSession = false;
  if (session?.access_token) {
    const payload = parseJwtPayload(session.access_token);
    if (payload?.sub && (!payload.exp || payload.exp * 1000 > Date.now() + 30000)) {
      hasValidSession = true;
    }
  }

  if (!hasValidSession) {
    await supabase.auth.signInAnonymously();
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api/cleanup-storage|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
