interface RoomIdentity {
  slug: string;
  name?: string | null;
  title?: string | null;
}

export function roomDisplayName(room: RoomIdentity): string {
  return room.name?.trim() || room.title?.trim() || `Room ${room.slug}`;
}

export function roomPageTitle(room: RoomIdentity): string {
  return `${roomDisplayName(room)} | Woff Space`;
}
