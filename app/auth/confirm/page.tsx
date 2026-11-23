import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { safeReturnPath } from "@/lib/account-helpers";
import { confirmEmailLink } from "./actions";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string | string[]; type?: string | string[]; next?: string | string[] }>;
}) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = typeof params.type === "string" ? params.type : "";
  const next = typeof params.next === "string" ? params.next : undefined;
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md rounded-[24px] border bg-card p-8 shadow-xl">
        <h1 className="text-2xl font-bold">Confirm your email</h1>
        <p className="my-5 text-sm text-muted-foreground">
          Continue to verify your sender account. Use the browser where you
          requested this link to recover its rooms.
        </p>
        <form action={confirmEmailLink}>
          <input
            type="hidden"
            name="token_hash"
            value={tokenHash}
          />
          <input type="hidden" name="type" value={type} />
          <input
            type="hidden"
            name="next"
            value={safeReturnPath(next)}
          />
          <Button variant="primary" type="submit" className="w-full">Confirm and continue</Button>
        </form>
      </div>
    </main>
  );
}
