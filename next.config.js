/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
      // Increase body size limit to support multi-image uploads
      bodySizeLimit: "5mb",
    },
    // Enable optimized package imports for smaller bundles
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
    ],
  },
  images: {
    // Allow external image hosts used in blog covers and avatars
    domains: ["picsum.photos", "i.pravatar.cc"],
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
  // Configure headers for caching
  async headers() {
    return [
      {
        // Cache static assets aggressively
        source: "/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif|woff|woff2)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Cache JS and CSS with revalidation
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
