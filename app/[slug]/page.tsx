import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SpaceContainer } from "@/components/space-container";
import { displayNameForDevice } from "@/lib/display-name";
import { requireAnonymousUser } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface SpacePageProps {
  params: Promise<{ slug: string }>;
}

async function getSpaceAndEntries(slug: string) {
  if (!/^\d{4}$/.test(slug)) return null;

  const { supabase, user } = await requireAnonymousUser();
  const cookieStore = await cookies();
  const legacyDeviceId = cookieStore.get("device_id")?.value;

  if (legacyDeviceId) {
    await supabase.rpc("claim_legacy_space", {
      p_slug: slug,
      p_legacy_device_id: legacyDeviceId,
    });
  }

  const { data: joined, error: joinError } = await supabase.rpc("join_space", {
    p_slug: slug,
    p_display_name: displayNameForDevice(user.id),
  });
  if (joinError || !joined) return null;

  const { data: space, error } = await supabase
    .from("spaces")
    .select(
      `id, slug, title, creator_device_id, visibility, allow_public_post,
       created_at, last_activity_at, expires_at, is_pro,
       entries (
         id, space_id, kind, text, meta, created_by_device_id, created_at
       )`,
    )
    .eq("slug", slug)
    .single();

  if (error || !space) return null;

  const { entries, ...spaceData } = space;
  return {
    currentUserId: user.id,
    displayName: displayNameForDevice(user.id),
    space: spaceData,
    entries: [...(entries || [])].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ),
  };
}

export async function generateMetadata({
  params,
}: SpacePageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Space ${slug} - Woff`,
    description: "A private-by-code shared Woff space",
    referrer: "no-referrer",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function SpacePage({ params }: SpacePageProps) {
  const { slug } = await params;
  const data = await getSpaceAndEntries(slug);
  if (!data) notFound();

  return (
    <SpaceContainer
      space={data.space}
      initialEntries={data.entries}
      currentDeviceId={data.currentUserId}
      currentDisplayName={data.displayName}
    />
  );
}
