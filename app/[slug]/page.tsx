import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { SpaceContainer } from "@/components/space-container";
import { cookies } from "next/headers";
import { updateSpaceActivity } from "@/lib/actions";
import type { Metadata } from "next";

// Revalidate every 60 seconds for better caching
export const revalidate = 60;

interface SpacePageProps {
  params: Promise<{
    slug: string;
  }>;
}

// Generate metadata for SEO
export async function generateMetadata({
  params,
}: SpacePageProps): Promise<Metadata> {
  const { slug } = await params;
  const { data: space } = await supabase
    .from("spaces")
    .select("title, slug")
    .eq("slug", slug)
    .single();

  return {
    title: space?.title ? `${space.title} - Woff` : `Space ${slug} - Woff`,
    description: "A shared space on Woff - simple shareable spaces",
  };
}

async function getSpace(slug: string) {
  const { data: space, error } = await supabase
    .from("spaces")
    .select(
      "id, slug, title, creator_device_id, visibility, allow_public_post, created_at, last_activity_at, is_pro",
    )
    .eq("slug", slug)
    .single();

  if (error || !space) {
    return null;
  }

  return space;
}

async function getEntries(spaceId: string) {
  const { data: entries } = await supabase
    .from("entries")
    .select("id, space_id, kind, text, meta, created_by_device_id, created_at")
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

  // Update last activity timestamp when space is viewed
  await updateSpaceActivity(space.id);

  const entries = await getEntries(space.id);

  // Get device id from cookie (set by middleware)
  const cookieStore = await cookies();
  const deviceId = cookieStore.get("device_id")?.value || "";

  return (
    <SpaceContainer
      space={space}
      initialEntries={entries}
      currentDeviceId={deviceId}
    />
  );
}
