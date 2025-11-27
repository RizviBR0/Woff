import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function generateDeviceId(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 21; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Check if device_id cookie exists
  const deviceId = request.cookies.get("device_id")?.value;

  if (!deviceId) {
    // Set the device_id cookie
    response.cookies.set("device_id", generateDeviceId(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }

  return response;
}

// Only run on page routes, not API routes or static files
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|_next).*)",
  ],
};
