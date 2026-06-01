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
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Before mount: show both logos with CSS media query selection
  // This paints the correct logo immediately on the server without waiting for JS
  if (!mounted) {
    return (
      <div className={className} style={{ width: `${width}px`, height: `${height}px`, position: 'relative' }}>
        {/* Light mode logo — hidden in dark mode */}
        <Image
          src="/logo_light.svg"
          alt="Woff Logo"
          width={width}
          height={height}
          className="block dark:hidden"
          style={{ position: 'absolute', inset: 0 }}
          priority
        />
        {/* Dark mode logo — hidden in light mode */}
        <Image
          src="/logo_dark.svg"
          alt="Woff Logo"
          width={width}
          height={height}
          className="hidden dark:block"
          style={{ position: 'absolute', inset: 0 }}
          priority
        />
      </div>
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
