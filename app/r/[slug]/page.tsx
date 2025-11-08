import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { SpaceContainer } from "@/components/space-container";

interface SpacePageProps {
  params: Promise<{
    slug: string;
  }>;
}

async function getSpace(slug: string) {
  const { data: space, error } = await supabase
    .from("spaces")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !space) {
    return null;
  }

  return space;
}

async function getEntries(spaceId: string) {
  const { data: entries, error } = await supabase
    .from("entries")
    .select("*")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: true });

  return entries || [];
}

export default async function SpacePage({ params }: SpacePageProps) {
  const { slug } = await params;
  const space = await getSpace(slug);

  if (!space) {
    notFound();
  }

  const entries = await getEntries(space.id);

  return <SpaceContainer space={space} initialEntries={entries} />;
}
