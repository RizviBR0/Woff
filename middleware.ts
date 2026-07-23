import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const needsIdentity =
    /^\/\d{4}(?:\/|$)/.test(request.nextUrl.pathname) ||
    request.nextUrl.pathname.startsWith("/n/");
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

  const { data: claimsResult } = await supabase.auth.getClaims();
  if (!claimsResult?.claims.sub) {
    await supabase.auth.signInAnonymously();
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api/cleanup-storage|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
