import type { Metadata } from "next";
import { NewRoomClient } from "./new-room-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Creating Room… – Woff",
  description: "Creating a new instant, private room on Woff Space.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function NewRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[] }>;
}) {
  const params = await searchParams;
  const template =
    params.template === "project-handoff" ? "project-handoff" : undefined;

  // Never mutate the database on GET or pass recovery keys / invite tokens
  // through redirect URL query parameters. NewRoomClient creates the room via
  // Server Action, stores credentials in browser storage, and navigates cleanly.
  return <NewRoomClient template={template} />;
}
