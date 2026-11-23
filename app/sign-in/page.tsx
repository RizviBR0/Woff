import type { Metadata } from "next";
import { AuthPage } from "@/components/account/auth-page";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[]; email?: string | string[] }>;
}) {
  return <AuthPage mode="existing" params={await searchParams} />;
}
