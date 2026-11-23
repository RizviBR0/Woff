import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasActiveSessionToken } from "@/lib/jwt";
import { isValidRoomSlug, normalizeRoomSlug } from "@/lib/room-slug";

const PRIVATE_PAGE_HEADERS = [
  ["Referrer-Policy", "no-referrer"],
  ["X-Robots-Tag", "noindex, nofollow, noarchive"],
  ["Cache-Control", "private, no-store"],
] as const;

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const segments = pathname.split("/").filter(Boolean);
  const isRoomPath =
    (segments.length === 1 || segments.length === 2) &&
    isValidRoomSlug(normalizeRoomSlug(segments[0] || ""));
  const needsAnonymousFallback =
    isRoomPath ||
    pathname === "/new" ||
    pathname.startsWith("/s/") ||
    pathname.startsWith("/n/");
  const needsSessionRefresh =
    needsAnonymousFallback ||
    pathname === "/dashboard" ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/checkout");

  const applyPrivateHeaders = (res: NextResponse) => {
    if (isRoomPath) {
      for (const [key, value] of PRIVATE_PAGE_HEADERS) {
        res.headers.set(key, value);
      }
    }
    return res;
  };

  // Marketing and information pages do not query protected room data. Avoid an
  // Auth network request on every asset-free page navigation.
  if (!needsSessionRefresh) return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return applyPrivateHeaders(response);

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

  const hasValidSession = Boolean(hasActiveSessionToken(session?.access_token));

  if (!hasValidSession && needsAnonymousFallback) {
    await supabase.auth.signInAnonymously();
  }

  return applyPrivateHeaders(response);
}

export const config = {
  matcher: [
    "/((?!api/cleanup-storage|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
