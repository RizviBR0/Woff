import { Metadata } from "next";
import { NoteViewer } from "@/components/note-viewer";

interface NoteViewPageProps {
  params: Promise<{
    public_code: string;
  }>;
}

export async function generateMetadata({
  params,
}: NoteViewPageProps): Promise<Metadata> {
  const { public_code } = await params;
  // In a real app, you'd fetch the note to generate proper OG tags
  return {
    title: "Note - Woff",
    description: "A shared note",
    openGraph: {
      title: "Note - Woff",
      description: "A shared note",
      type: "article",
    },
  };
}

export default async function NoteViewPage({ params }: NoteViewPageProps) {
  const { public_code } = await params;

  return (
    <div className="min-h-screen bg-background">
      <NoteViewer publicCode={public_code} />
    </div>
  );
}
