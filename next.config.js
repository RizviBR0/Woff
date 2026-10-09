/** @type {import('next').NextConfig} */
const isDevelopment = process.env.NODE_ENV !== "production";

const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : "goitdofpzjjvwgxoykyy.supabase.co";
  } catch {
    return "goitdofpzjjvwgxoykyy.supabase.co";
  }
})();

const siteHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host
      : "woff.space";
  } catch {
    return "woff.space";
  }
})();

const nextConfig = {
  distDir: isDevelopment && process.env.WOFF_TEST_FIXTURE === "true" ? "internal/launch-next" : ".next",
  experimental: {
    serverActions: {
      allowedOrigins: Array.from(
        new Set([
          "localhost:3000",
          "http://localhost:3000",
          siteHost,
          `https://${siteHost}`,
          `http://${siteHost}`,
        ]),
      ),
      bodySizeLimit: "5mb",
    },
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "sonner",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-progress",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // Optimize image loading
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    formats: ["image/avif", "image/webp"],
  },
  // Enable compression
  compress: true,
  // Generate ETags for caching
  generateEtags: true,
  // Reduce powered by header
  poweredByHeader: false,
  // Optimize production builds
  productionBrowserSourceMaps: false,
  async redirects() {
    return [{ source: "/blog/tips", destination: "/blog", permanent: true }];
  },
  // Configure headers for caching
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "base-uri 'self'",
          "object-src 'none'",
          "frame-ancestors 'none'",
          "form-action 'self'",
          `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          "img-src 'self' data: blob: https:",
          `connect-src 'self' https://*.supabase.co wss://*.supabase.co${isDevelopment ? " http://127.0.0.1:* ws://127.0.0.1:*" : ""}`,
          "worker-src 'self' blob:",
          "upgrade-insecure-requests",
        ].join("; "),
      },
    ];
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      ...["/s/:path*", "/n/:path*", "/:slug(\\d{4})/:path*", "/account/:path*", "/auth/:path*", "/checkout/:path*", "/api/billing/:path*", "/dashboard", "/sign-in", "/sign-up", "/recover", "/new"].map((source) => ({ source, headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        { key: "Cache-Control", value: "private, no-store" },
      ] })),
      {
        // Development URLs are reused after edits; never cache their old content.
        source: "/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif|woff|woff2)",
        headers: [
          {
            key: "Cache-Control",
            value: isDevelopment ? "no-store, must-revalidate" : "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Only production chunks have content hashes safe for immutable caching.
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: isDevelopment ? "no-store, must-revalidate" : "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
