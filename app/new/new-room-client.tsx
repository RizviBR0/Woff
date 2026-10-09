"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSpace } from "@/lib/actions";
import { rememberSpaceOwnership } from "@/lib/space-recovery";

interface NewRoomClientProps {
  initialError?: string | null;
  template?: "project-handoff";
}

export function NewRoomClient({ initialError = null, template }: NewRoomClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError);
  const [isCreating, setIsCreating] = useState(!initialError);
  const hasTriggeredRef = useRef(false);

  const startCreation = useCallback(async () => {
    setIsCreating(true);
    setError(null);
    try {
      const space = await createSpace(template);
      rememberSpaceOwnership(space);
      router.replace(`/${space.slug}`);
    } catch (err) {
      console.error("Failed to auto-create room from /new:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create space. Please try again.",
      );
      setIsCreating(false);
    }
  }, [router, template]);

  useEffect(() => {
    if (initialError) return;
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    void startCreation();
  }, [initialError, startCreation]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground selection:bg-primary/30">
      {/* Background Grid & Ambient Glows */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div className="pointer-events-none absolute h-[320px] w-[320px] rounded-full bg-[#ff5a00]/10 blur-[100px]" />

      <div className="relative z-10 w-full max-w-sm rounded-3xl border border-border/60 bg-card/70 p-8 text-center shadow-2xl backdrop-blur-xl">
        {!error ? (
          <div className="space-y-6">
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#ff5a00]/10 text-[#ff5a00] shadow-inner">
              <Plus className="h-7 w-7 animate-pulse text-[#ff5a00]" />
              <div className="absolute inset-0 rounded-2xl ring-2 ring-[#ff5a00]/20 animate-ping opacity-25" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Creating New Room
              </h2>
              <p className="text-xs text-muted-foreground">
                Setting up your instant private space…
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-[#ff5a00]" />
              <span>Connecting…</span>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertCircle className="h-7 w-7" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-foreground">
                Unable to Create Room
              </h2>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                variant="primary"
                onClick={() => void startCreation()}
                disabled={isCreating}
                className="w-full"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Try Again</span>
              </Button>

              <Button
                variant="ghost"
                asChild
                className="w-full gap-2 text-muted-foreground"
              >
                <Link href="/">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Go to Homepage</span>
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
