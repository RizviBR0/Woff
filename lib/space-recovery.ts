import type { Space } from "@/lib/actions";

export function readBrowserValue(key: string): string | null {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
export function writeBrowserValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage may be disabled. */
  }
}
export function removeBrowserValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage may be disabled. */
  }
}

export function rememberSpaceInvitation(
  space: Pick<Space, "id" | "slug" | "access_version">,
  token: string,
  version = space.access_version,
) {
  writeBrowserValue(`woff_invite_${space.slug}`, token);
  writeBrowserValue(`woff_invite_room_${space.slug}`, space.id);
  writeBrowserValue(`woff_invite_version_${space.slug}`, String(version ?? 0));
}

export function readSpaceInvitation(space: Pick<Space, "id" | "slug" | "access_version">): string {
  return readBrowserValue(`woff_invite_version_${space.slug}`) ===
    String(space.access_version ?? 0) &&
    readBrowserValue(`woff_invite_room_${space.slug}`) === space.id
    ? readBrowserValue(`woff_invite_${space.slug}`) || ""
    : "";
}

export function readSpaceRecoveryKey(space: Space): string {
  const roomId = readBrowserValue(`woff_recovery_room_${space.slug}`);
  if (roomId && roomId !== space.id) return "";
  const owner = readBrowserValue(`woff_recovery_owner_${space.slug}`);
  if (owner && owner !== space.creator_device_id) return "";
  return readBrowserValue(`woff_recovery_${space.slug}`) || "";
}

export function rememberSpaceOwnership(space: Space) {
  if (typeof window === "undefined") return;
  writeBrowserValue("last_created_space", space.slug);
  writeBrowserValue("last_room", space.slug);
  if (space.recovery_key) {
    writeBrowserValue(`woff_recovery_${space.slug}`, space.recovery_key);
    writeBrowserValue(`woff_recovery_room_${space.slug}`, space.id);
    writeBrowserValue(
      `woff_recovery_owner_${space.slug}`,
      space.creator_device_id || "",
    );
  }
  if (space.invite_token) {
    rememberSpaceInvitation(space, space.invite_token);
  }
}

/** Carry browser hints to a new room code without trusting a recycled code. */
export function migrateRoomBrowserState(previous: Space, current: Space) {
  if (previous.id !== current.id || previous.slug === current.slug) return;
  const invitation = readSpaceInvitation(previous);
  if (invitation && previous.access_version === current.access_version) {
    rememberSpaceInvitation(current, invitation);
  }
  if (
    readBrowserValue(`woff_recovery_room_${previous.slug}`) === previous.id &&
    previous.creator_device_id === current.creator_device_id
  ) {
    const recoveryKey = readSpaceRecoveryKey(previous);
    if (recoveryKey) rememberSpaceOwnership({ ...current, recovery_key: recoveryKey });
  }
  for (const key of ["last_room", "last_created_space"]) {
    if (readBrowserValue(key) === previous.slug) writeBrowserValue(key, current.slug);
  }
  for (const prefix of [
    "woff_invite_", "woff_invite_room_", "woff_invite_version_",
    "woff_recovery_", "woff_recovery_room_", "woff_recovery_owner_",
  ]) {
    removeBrowserValue(`${prefix}${previous.slug}`);
  }
}
