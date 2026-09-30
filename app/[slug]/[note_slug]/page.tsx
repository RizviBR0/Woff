import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { NoteEditor } from "@/components/note-editor";
import { getNote } from "@/lib/actions";

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

  // Validate room code format (must be 4 digits)
  if (!/^\d{4}$/.test(slug)) {
    notFound();
  }

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
