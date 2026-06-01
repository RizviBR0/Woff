import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://woff.space";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/n/",
        "/cleanup-storage/",
        "/dashboard/",
        "/settings/",
        "/search",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
