import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Blog",
  robots: { index: false, follow: false },
};

export default function BlogTipsPage() {
  permanentRedirect("/blog");
}