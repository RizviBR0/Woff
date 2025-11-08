import { Metadata } from "next";
import { NoteEditor } from "@/components/note-editor";

interface NotePageProps {
  params: Promise<{
    note_slug: string;
  }>;
}

export async function generateMetadata({
  params,
}: NotePageProps): Promise<Metadata> {
  const { note_slug } = await params;
  // In a real app, you'd fetch the note to get the title
  return {
    title: "Editing Note - Woff",
    description: "Rich text editor for notes",
  };
}

export default async function NotePage({ params }: NotePageProps) {
  const { note_slug } = await params;
  
  return (
    <div className="min-h-screen bg-background">
      <NoteEditor noteSlug={note_slug} />
    </div>
  );
}
