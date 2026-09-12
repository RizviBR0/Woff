"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SpaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Space loading error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 text-[#ff5a00]">
          <AlertTriangle className="h-7 w-7" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Space Connection Interrupted
          </h1>
          <p className="text-sm text-muted-foreground">
            We were unable to load or connect to this shared space. The room may have expired or there was a network glitch.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button onClick={() => reset()} className="gap-2 bg-[#ff5a00] hover:bg-[#e04f00] text-white">
            <RefreshCcw className="h-4 w-4" />
            Reconnect
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/">
              <Home className="h-4 w-4" />
              Return Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
