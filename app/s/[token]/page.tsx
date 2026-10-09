import type { Metadata } from "next";
import loadComponent from "next/dynamic";
import { notFound } from "next/navigation";
import { SpaceContainer } from "@/components/space-container";
import { requireAnonymousUser } from "@/lib/supabase";
import { displayNameForDevice } from "@/lib/display-name";
import { getNote } from "@/lib/actions";

const NoteEditor = loadComponent(() => import("@/components/note-editor").then(module => module.NoteEditor));

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Room invitation – Woff" }, robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

export default async function InvitationPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ note?: string }>;
}) {
  const { token } = await params;
  const { note: noteSlug } = await searchParams;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  if (noteSlug !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(noteSlug)) notFound();
  const { supabase, user } = await requireAnonymousUser();
  const displayName = displayNameForDevice(user.id);
  const { data: room, error } = await supabase.rpc("join_room_invitation", { p_token: token, p_display_name: displayName });
  if (error || !room?.id) notFound();
  const { data: opened } = await supabase.rpc("open_space", { p_slug: room.slug, p_display_name: displayName });
  if (!opened?.space) notFound();
  if (noteSlug) {
    const note = await getNote(noteSlug);
    if (!note || note.space_id !== room.id || note.is_locked) notFound();
    return <div className="min-h-screen bg-background">
      <NoteEditor noteSlug={noteSlug} initialNote={note}
        invitation={{ space: { id: room.id, slug: room.slug, access_version: opened.space.access_version }, token }} />
    </div>;
  }
  return <SpaceContainer space={{ ...opened.space, invite_token: token }} initialEntries={opened.entries || []} currentDeviceId={user.id} currentDisplayName={displayName} />;
}
