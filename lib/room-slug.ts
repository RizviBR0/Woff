export const ROOM_SLUG_MIN_LENGTH = 3;
export const ROOM_SLUG_MAX_LENGTH = 40;

// Keep this list in sync with private.valid_room_slug in the database. Room URLs
// cannot occupy an application route, even when that route is added later.
export const RESERVED_ROOM_SLUGS = [
  "about", "account", "admin", "api", "auth", "billing", "blog", "checkout",
  "contact", "dashboard", "for-freelancers", "help", "legal", "login", "logout",
  "n", "new", "online-notepad", "online-notepad-with-shareable-link", "pricing",
  "privacy", "recover", "s", "settings", "share-code-snippets-online",
  "share-notes-online-without-login", "share-text-between-devices", "sign-in",
  "sign-up", "signin", "signup", "status", "support", "terms", "user", "users",
  "woff", "www",
] as const;

const reservedRoomSlugs = new Set<string>(RESERVED_ROOM_SLUGS);

export function normalizeRoomSlug(value: string): string {
  return value.trim().toLowerCase();
}

export function isLegacyRoomSlug(value: string): boolean {
  return /^[0-9]{4}$/.test(value);
}

export function isValidRoomSlug(value: string): boolean {
  return isLegacyRoomSlug(value) || (
    value.length >= ROOM_SLUG_MIN_LENGTH && value.length <= ROOM_SLUG_MAX_LENGTH &&
    /[a-z]/.test(value) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
    !reservedRoomSlugs.has(value)
  );
}

export function suggestRoomSlug(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, ROOM_SLUG_MAX_LENGTH).replace(/-+$/g, "");
}

/** Accept a room name, code, or HTTP(S) room URL without extracting stray digits. */
export function extractRoomSlug(input: string): string {
  const value = input.trim();
  const direct = normalizeRoomSlug(value);
  if (isValidRoomSlug(direct)) return direct;
  // URL parsers normalize encoded separators and dot segments. Reject those
  // before parsing so an unrelated path cannot turn into a valid room address.
  if (!value || value.length > 2048 || /[%\\\s]/.test(value) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(value)) return "";
  try {
    const address = /^(?:(?:www\.)?woff\.space|localhost(?::[0-9]{1,5})?)\//i.test(value) ? `https://${value}` : value;
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(address);
    if (hasScheme && !/^https?:\/\//i.test(address)) return "";
    if (value.startsWith("//")) return "";
    const candidate = hasScheme ? address : address.startsWith("/") ? address : `/${address}`;
    const url = new URL(candidate, "https://woff.space");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    const parts = url.pathname.split("/").filter(Boolean);
    // /r/ was supported by the former numeric parser; keep those copied links.
    const slug = normalizeRoomSlug(parts[0] === "r" ? parts[1] || "" : parts[0] || "");
    if (!isValidRoomSlug(slug)) return "";
    const tail = parts.slice(parts[0] === "r" ? 2 : 1);
    if (tail.length > 1 || (tail.length === 1 && !/^[a-zA-Z0-9_-]{1,128}$/.test(tail[0]))) return "";
    return slug;
  } catch {
    return "";
  }
}
