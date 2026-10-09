// Cached signed responses can outlive the JWT. Redirect only objects that have
// explicitly disabled caching; otherwise serve bytes behind per-request Auth.
export function canUseBoundedStorageRedirect(cacheControl?: string): boolean {
  const value = cacheControl?.trim().toLowerCase();
  return value === "max-age=0" || value === "no-store";
}
