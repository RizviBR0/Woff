import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { SpaceContainer } from "@/components/space-container";
import { cookies } from "next/headers";
import { generateDeviceId } from "@/lib/slug";

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
  const { data: entries } = await supabase
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

  // Ensure we have a device id cookie available for identity in UI
  const cookieStore = await cookies();
  let deviceId = cookieStore.get("device_id")?.value;
  if (!deviceId) {
    deviceId = generateDeviceId();
    cookieStore.set("device_id", deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return (
    <SpaceContainer
      space={space}
      initialEntries={entries}
      currentDeviceId={deviceId}
    />
  );
}
