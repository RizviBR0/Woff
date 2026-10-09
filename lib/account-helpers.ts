/** Accept a local destination only. Auth tokens must never redirect off-site. */
export function safeReturnPath(
  value: unknown,
  fallback = "/dashboard",
): string {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return fallback;
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded))
      return fallback;
    const url = new URL(value, "https://woff.invalid");
    const decodedUrl = new URL(decoded, "https://woff.invalid");
    if (
      url.origin !== "https://woff.invalid" ||
      decodedUrl.origin !== "https://woff.invalid" ||
      decodedUrl.pathname === "/auth" ||
      decodedUrl.pathname.startsWith("/auth/")
    )
      return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** Custom email templates can use a fixed `next`; keep the initiating browser's
 * checked destination without trusting either a cookie or URL as a redirect. */
export function authReturnPath(pending: unknown, requested: unknown): string {
  return safeReturnPath(pending, safeReturnPath(requested));
}

export function isVerifiedSender(
  user: {
    email?: string;
    email_confirmed_at?: string;
    is_anonymous?: boolean;
  } | null,
): boolean {
  return Boolean(
    user?.email && user.email_confirmed_at && user.is_anonymous === false,
  );
}

export function formatAccountBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  return `${Math.ceil(Math.max(0, bytes) / 1024 ** 2)} MiB`;
}

/** An unavailable ownership check must never be treated as an empty browser. */
export function hasOwnedRooms(result: { data: unknown; error: unknown }): boolean {
  if (result.error || !Array.isArray(result.data))
    throw new Error("Could not verify this browser's owned rooms.");
  return result.data.length > 0;
}

/** A different account needs the proof created when this browser requested sign-in. */
export function requiresAccountTransfer({
  sourceUserId,
  targetUserId,
  sourceOwnsRooms,
  hasMergeTicket,
}: {
  sourceUserId?: string;
  targetUserId?: string;
  sourceOwnsRooms: boolean;
  hasMergeTicket: boolean;
}): boolean {
  return Boolean(
    sourceUserId &&
      sourceUserId !== targetUserId &&
      sourceOwnsRooms &&
      !hasMergeTicket,
  );
}

/** Cookie writes stay private until a verified ownership transfer succeeds. */
export function stageCookieWrites<TOptions>(
  initial: Array<{ name: string; value: string }>,
  write: (name: string, value: string, options: TOptions) => void,
) {
  const values = new Map(initial.map(({ name, value }) => [name, value]));
  const updates = new Map<
    string,
    { name: string; value: string; options: TOptions }
  >();
  return {
    getAll: () => Array.from(values, ([name, value]) => ({ name, value })),
    setAll(writes: Array<{ name: string; value: string; options: TOptions }>) {
      for (const item of writes) {
        values.set(item.name, item.value);
        updates.set(item.name, item);
      }
    },
    commit() {
      for (const { name, value, options } of updates.values())
        write(name, value, options);
    },
  };
}
