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
      router.push(`/${space.slug}`);
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
      className="max-w-[250px] w-full h-12 px-8 min-w-[160px] rounded-xl font-medium shadow-sm hover:shadow-md transition-all duration-200 text-base"
    >
      {isCreating ? (
        <>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
          Creating...
        </>
      ) : (
        "Create Space"
      )}
    </Button>
  );
}
