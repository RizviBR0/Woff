import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createSpace } from "@/lib/actions";
import { NewRoomClient } from "./new-room-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Creating Room… – Woff",
  description: "Creating a new instant, private room on Woff Space.",
  robots: { index: false, follow: false },
};

export default async function NewRoomPage() {
  const headerList = await headers();
  const isPrefetch =
    headerList.get("next-router-prefetch") === "1" ||
    headerList.get("purpose") === "prefetch" ||
    headerList.get("sec-purpose") === "prefetch";

  if (isPrefetch) {
    return <NewRoomClient />;
  }

  try {
    const space = await createSpace();
    redirect(`/${space.slug}?created=1&rk=${space.recovery_key || ""}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    console.error("Failed to auto-create room from /new:", err);
    return (
      <NewRoomClient
        initialError={
          err instanceof Error
            ? err.message
            : "Failed to create space. Please try again."
        }
      />
    );
  }
}
