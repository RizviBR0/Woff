import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { cache } from "react";
import { SpaceContainer } from "@/components/space-container";
import { displayNameForDevice } from "@/lib/display-name";
import { requireAnonymousUser } from "@/lib/supabase";
import { isValidRoomSlug, normalizeRoomSlug } from "@/lib/room-slug";
import { roomPageTitle } from "@/lib/room-title";

export const dynamic = "force-dynamic";

interface SpacePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ join?: string }>;
}

// Share the authorized room result between the page and its metadata within
// this request, so opening a room only runs once.
const getSpaceAndEntries = cache(async (slug: string) => {
  if (!isValidRoomSlug(slug)) return null;

  const { supabase, user } = await requireAnonymousUser();
  const cookieStore = await cookies();
  const legacyDeviceId = cookieStore.get("device_id")?.value;

  const isLegacyNonUuid =
    legacyDeviceId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      legacyDeviceId,
    );

  if (isLegacyNonUuid) {
    await supabase.rpc("claim_legacy_space", {
      p_slug: slug,
      p_legacy_device_id: legacyDeviceId,
    });
  }

  const { data: opened, error } = await supabase.rpc("open_space", {
    p_slug: slug,
    p_display_name: displayNameForDevice(user.id),
  });
  if (error || !opened?.space) return null;

  return {
    currentUserId: user.id,
    displayName: displayNameForDevice(user.id),
    space: opened.space,
    entries: opened.entries || [],
  };
});

export async function generateMetadata({
  params,
}: SpacePageProps): Promise<Metadata> {
  const { slug } = await params;
  const canonicalSlug = normalizeRoomSlug(slug);
  const data = await getSpaceAndEntries(canonicalSlug);
  return {
    title: { absolute: roomPageTitle(data?.space || { slug: canonicalSlug }) },
    description: "A temporary Woff sharing space. Download files you want to keep; Woff is not cloud storage.",
    referrer: "no-referrer",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function SpacePage({ params, searchParams }: SpacePageProps) {
  const { slug } = await params;
  const canonicalSlug = normalizeRoomSlug(slug);
  if (!isValidRoomSlug(canonicalSlug)) notFound();
  const query = await searchParams;
  if (slug !== canonicalSlug) redirect(`/${canonicalSlug}${query.join === "1" ? "?join=1" : ""}`);
  const data = await getSpaceAndEntries(canonicalSlug);
  if (!data) {
    if (query.join === "1") redirect(`/?joinError=1&room=${encodeURIComponent(canonicalSlug)}`);
    notFound();
  }

  return (
    <SpaceContainer
      space={data.space}
      initialEntries={data.entries}
      currentDeviceId={data.currentUserId}
      currentDisplayName={data.displayName}
    />
  );
}
