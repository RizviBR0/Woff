/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
      // Increase body size limit to support multi-image uploads
      bodySizeLimit: "5mb",
    },
  },
  images: {
    // Allow external image hosts used in blog covers and avatars
    domains: ["picsum.photos", "i.pravatar.cc"],
    // Alternatively, remotePatterns can be used for more control
    // remotePatterns: [
    //   { protocol: "https", hostname: "picsum.photos" },
    //   { protocol: "https", hostname: "i.pravatar.cc" },
    // ],
  },
};

module.exports = nextConfig;
