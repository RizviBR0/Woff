import type { Metadata } from "next";
import { NewRoomClient } from "./new-room-client";

export const metadata: Metadata = {
  title: "Creating Room… – Woff",
  description: "Creating a new instant, private room on Woff Space.",
  robots: { index: false, follow: false },
};

export default function NewRoomPage() {
  return <NewRoomClient />;
}
