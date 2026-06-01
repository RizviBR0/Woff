import { notFound } from "next/navigation";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase";
import { SpaceContainer } from "@/components/space-container";
import { cookies } from "next/headers";
import { updateSpaceActivityBySlug } from "@/lib/actions";
import type { Metadata } from "next";
import { after } from "next/server";

// Revalidate every 60 seconds for better caching
export const revalidate = 60;

interface SpacePageProps {
  params: Promise<{
    slug: string;
  }>;
}

// Request-scoped cache to deduplicate DB fetch across generateMetadata and Page render
const getSpaceAndEntries = cache(async (slug: string) => {
  const supabase = await createServerSupabaseClient();
  
  // Single query using join to fetch both space and its entries in one DB roundtrip!
  const { data: space, error } = await supabase
    .from("spaces")
    .select(`
      id, slug, title, creator_device_id, visibility, allow_public_post, created_at, last_activity_at, is_pro,
      entries (
        id, space_id, kind, text, meta, created_by_device_id, created_at
      )
    `)
    .eq("slug", slug)
    .single();

  if (error || !space) {
    return null;
  }

  const { entries, ...spaceData } = space;

  // Sort entries by created_at ascending
  const sortedEntries = [...(entries || [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return {
    space: spaceData,
    entries: sortedEntries,
  };
});

// Generate metadata for SEO
export async function generateMetadata({
  params,
}: SpacePageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getSpaceAndEntries(slug);
  const space = data?.space;

  return {
    title: space?.title ? `${space.title} - Woff` : `Space ${slug} - Woff`,
    description: "A shared space on Woff - simple shareable spaces",
  };
}

export default async function SpacePage({ params }: SpacePageProps) {
  const { slug } = await params;

  const data = await getSpaceAndEntries(slug);

  if (!data) {
    notFound();
  }

  // Defer database write to background, not blocking response
  after(async () => {
    try {
      await updateSpaceActivityBySlug(slug);
    } catch (e) {
      console.error("Failed to update space activity:", e);
    }
  });

  const { space, entries } = data;

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
