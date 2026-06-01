import { Metadata } from "next";
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
  const { note_slug } = await params;
  const note = await getNote(note_slug);
  return {
    title: note?.title ? `${note.title} • Woff` : "Editing Note • Woff",
    description: note?.content 
      ? note.content.replace(/<[^>]*>/g, "").substring(0, 150)
      : "Rich text editor for notes",
  };
}

export default async function NotePage({ params }: NotePageProps) {
  const { note_slug } = await params;
  const note = await getNote(note_slug);

  return (
    <div className="min-h-screen bg-background">
      <NoteEditor noteSlug={note_slug} initialNote={note} />
    </div>
  );
}
