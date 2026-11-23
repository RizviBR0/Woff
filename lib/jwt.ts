export interface JwtPayload {
  sub?: string;
  exp?: number;
}

/**
 * Decode a JWT payload segment without verifying its signature.
 * Used only to avoid redundant anonymous sign-in calls; PostgREST/Supabase
 * always verifies the JWT signature on every database request.
 */
export function parseJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2 || !parts[1]) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json =
      typeof atob === "function"
        ? new TextDecoder().decode(
            Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)),
          )
        : Buffer.from(padded, "base64").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as JwtPayload;
  } catch {
    return null;
  }
}

export function hasActiveSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const payload = parseJwtPayload(token);
  if (
    typeof payload?.sub === "string" &&
    payload.sub.length > 0 &&
    typeof payload.exp === "number" &&
    Number.isFinite(payload.exp) &&
    payload.exp * 1000 > Date.now() + 30_000
  ) {
    return payload.sub;
  }
  return null;
}
