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
  return (
    <div
      className={className}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        position: "relative",
      }}
    >
      {/* Light mode logo — hidden in dark mode */}
      <Image
        src="/logo_light.svg"
        alt="Woff Logo"
        width={width}
        height={height}
        className="block dark:hidden"
        style={{ position: "absolute", inset: 0 }}
        priority
      />
      {/* Dark mode logo — hidden in light mode */}
      <Image
        src="/logo_dark.svg"
        alt="Woff Logo"
        width={width}
        height={height}
        className="hidden dark:block"
        style={{ position: "absolute", inset: 0 }}
        priority
      />
    </div>
  );
}
