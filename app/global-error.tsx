"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global uncaught error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-900 font-sans p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-md p-6 text-center space-y-4">
          <h2 className="text-xl font-bold">Something went wrong</h2>
          <p className="text-sm text-gray-600">
            A critical error occurred while rendering the page.
          </p>
          <Button
            onClick={() => reset()}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            Try again
          </Button>
        </div>
      </body>
    </html>
  );
}
