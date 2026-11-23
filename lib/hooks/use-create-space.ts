"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { createSpace, type Space } from "@/lib/actions";
import { rememberSpaceOwnership } from "@/lib/space-recovery";

export function useCreateSpace() {
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const creatingRef = useRef(false);

  useEffect(() => {
    creatingRef.current = false;
    setIsCreating(false);
  }, [pathname]);

  useEffect(() => {
    const reset = () => {
      creatingRef.current = false;
      setIsCreating(false);
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reset();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      creatingRef.current = false;
    };
  }, []);

  const createAndNavigate = useCallback(async (): Promise<Space | null> => {
    if (creatingRef.current) return null;
    creatingRef.current = true;
    setIsCreating(true);

    try {
      const space = await createSpace();
      rememberSpaceOwnership(space);
      router.push(`/${space.slug}`);
      return space;
    } catch (err) {
      console.error("Failed to create space:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to create space. Please try again.",
      );
      setIsCreating(false);
      creatingRef.current = false;
      return null;
    }
  }, [router]);

  return {
    isCreating,
    createAndNavigate,
  };
}
