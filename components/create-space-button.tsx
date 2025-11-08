"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSpace } from "@/lib/actions";

export function CreateSpaceButton() {
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const handleCreateSpace = async () => {
    if (isCreating) return;

    setIsCreating(true);
    try {
      const space = await createSpace();
      router.push(`/r/${space.slug}`);
    } catch (error) {
      console.error("Failed to create space:", error);
      setIsCreating(false);
    }
  };

  return (
    <Button
      onClick={handleCreateSpace}
      disabled={isCreating}
      size="lg"
      className="min-w-[140px]"
    >
      {isCreating ? "Creating..." : "Create Space"}
    </Button>
  );
}
