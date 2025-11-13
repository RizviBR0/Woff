/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
      // Increase body size limit to support multi-image uploads
      bodySizeLimit: "5mb",
    },
  },
};

module.exports = nextConfig;
