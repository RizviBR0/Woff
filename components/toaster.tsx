"use client";

import { useTheme } from "next-themes";
import { Toaster as SonnerToaster } from "sonner";

export function Toaster(props: React.ComponentProps<typeof SonnerToaster>) {
  const { theme = "system" } = useTheme();
  return (
    <SonnerToaster
      theme={theme as "light" | "dark" | "system"}
      {...props}
    />
  );
}
