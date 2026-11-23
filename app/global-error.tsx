"use client";

import "./globals.css";
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
        <main className="max-w-md w-full bg-white rounded-xl shadow-md p-6 text-center space-y-4">
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="text-sm text-gray-600">
            A critical error occurred while rendering the page.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              type="button"
              onClick={() => reset()}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Try again
            </Button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- hard navigation required because root router context may have crashed */}
            <a
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-md border border-gray-200 px-4 text-sm font-medium text-gray-800 hover:bg-gray-100"
            >
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
