import { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoteEditor } from "@/components/note-editor";
import { getNote } from "@/lib/actions";

interface NotePageProps {
  params: Promise<{
    note_slug: string;
  }>;
}

export async function generateMetadata({
  params,
}: NotePageProps): Promise<Metadata> {
  await params;
  return {
    title: "Editing Note • Woff",
    description: "Rich text editor for a shared Woff note",
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
  };
}

export default async function NotePage({ params }: NotePageProps) {
  const { note_slug } = await params;
  const note = await getNote(note_slug);
  if (!note) notFound();

  return (
    <div className="min-h-screen bg-background">
      <NoteEditor noteSlug={note_slug} initialNote={note} />
    </div>
  );
}
