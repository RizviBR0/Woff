import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/s/",
        "/n/",
        "/new",
        "/sign-in",
        "/sign-up",
        "/auth/",
        "/account",
        "/checkout",
        "/dashboard",
        "/recover",
        "/settings/",
        "/search",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
