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
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const params = await searchParams;
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
            value={params.token_hash || ""}
          />
          <input type="hidden" name="type" value={params.type || ""} />
          <input
            type="hidden"
            name="next"
            value={safeReturnPath(params.next)}
          />
          <Button variant="primary" type="submit" className="w-full">Confirm and continue</Button>
        </form>
      </div>
    </main>
  );
}
