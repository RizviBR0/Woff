import type { Space } from "@/lib/actions";

export function rememberSpaceOwnership(space: Space) {
  if (typeof window === "undefined") return;
  localStorage.setItem("last_created_space", space.slug);
  localStorage.setItem("last_room", space.slug);
  if (space.recovery_key) {
    localStorage.setItem(`woff_recovery_${space.slug}`, space.recovery_key);
  }
}
