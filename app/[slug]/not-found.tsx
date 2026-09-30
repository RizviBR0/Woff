import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function SharingSpaceNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="mx-auto max-w-md space-y-6 text-center">
        <div className="flex justify-center"><Logo width={160} height={48} /></div>
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold">This sharing space is unavailable</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The link or room code may be incorrect, or the space may have expired or been deleted.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Woff is for temporary sharing, not cloud storage. Keep a copy of files and notes you need on your own device.
          </p>
        </div>
        <Button asChild><Link href="/">Start sharing</Link></Button>
      </div>
    </main>
  );
}
