import type { Metadata } from "next";
import { AuthPage } from "@/components/account/auth-page";

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SignUpPage({ searchParams }: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  return <AuthPage mode="link" params={await searchParams} />;
}
