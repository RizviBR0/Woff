import Image from "next/image";

interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Pure Server Component Logo.
 * Uses Tailwind's `block dark:hidden` and `hidden dark:block` CSS classes to toggle
 * the light and dark logo with 0ms delay, zero JS, zero hydration shift, and zero client bundle.
 */
export function Logo({ width = 120, height = 40, className = "" }: LogoProps) {
  const hasWidthClass = /\bw-/.test(className);
  return (
    <div
      className={`inline-block shrink-0 ${className}`}
      style={hasWidthClass ? undefined : { width: `${width}px` }}
    >
      {/* Light mode logo — hidden in dark mode */}
      <Image
        src="/logo_light.svg"
        alt="Woff Logo"
        width={width}
        height={height}
        className="block dark:hidden h-auto w-full"
      />
      {/* Dark mode logo — hidden in light mode */}
      <Image
        src="/logo_dark.svg"
        alt="Woff Logo"
        width={width}
        height={height}
        className="hidden dark:block h-auto w-full"
      />
    </div>
  );
}
