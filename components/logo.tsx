"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Image from "next/image";

interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
}

export function Logo({ width = 120, height = 40, className = "" }: LogoProps) {
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Return a placeholder with the same dimensions to prevent layout shift
    return (
      <div
        className={`${className}`}
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    );
  }

  const isDark = resolvedTheme === "dark";
  const logoSrc = isDark ? "/logo_dark.svg" : "/logo_light.svg";

  return (
    <Image
      src={logoSrc}
      alt="Woff Logo"
      width={width}
      height={height}
      className={className}
      priority
    />
  );
}
