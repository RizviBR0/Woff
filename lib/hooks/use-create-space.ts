"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createSpace, type Space } from "@/lib/actions";
import { rememberSpaceOwnership } from "@/lib/space-recovery";

export function useCreateSpace() {
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const createAndNavigate = useCallback(async (): Promise<Space | null> => {
    if (isCreating) return null;
    setIsCreating(true);

    try {
      const space = await createSpace();
      rememberSpaceOwnership(space);
      router.prefetch(`/${space.slug}`);
      router.push(`/${space.slug}`);
      return space;
    } catch (err) {
      console.error("Failed to create space:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to create space. Please try again.",
      );
      setIsCreating(false);
      return null;
    }
  }, [isCreating, router]);

  return {
    isCreating,
    createAndNavigate,
  };
}
