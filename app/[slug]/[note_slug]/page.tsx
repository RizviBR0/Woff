import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { NoteEditor } from "@/components/note-editor";
import { getNote } from "@/lib/actions";
import { isValidRoomSlug, normalizeRoomSlug } from "@/lib/room-slug";

export const dynamic = "force-dynamic";

interface SpaceNotePageProps {
  params: Promise<{
    slug: string;
    note_slug: string;
  }>;
}

export async function generateMetadata({
  params,
}: SpaceNotePageProps): Promise<Metadata> {
  const { slug, note_slug } = await params;
  return {
    title: { absolute: `Note • Space ${slug} – Woff` },
    description: `Rich text editor for note in space ${slug}`,
    referrer: "no-referrer",
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
  };
}

export default async function SpaceNotePage({ params }: SpaceNotePageProps) {
  const { slug, note_slug } = await params;

  const canonicalSlug = normalizeRoomSlug(slug);
  if (!isValidRoomSlug(canonicalSlug) || !/^[a-zA-Z0-9_-]{1,128}$/.test(note_slug)) {
    notFound();
  }
  if (slug !== canonicalSlug) redirect(`/${canonicalSlug}/${note_slug}`);

  const note = await getNote(note_slug);
  if (!note) {
    notFound();
  }

  // If note belongs to a different room, redirect to canonical room note URL
  if (note.space_slug && note.space_slug !== slug) {
    redirect(`/${note.space_slug}/${note_slug}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <NoteEditor noteSlug={note_slug} initialNote={note} />
    </div>
  );
}
