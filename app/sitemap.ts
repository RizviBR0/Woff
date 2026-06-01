import { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://woff.space";

const staticRoutes = [
  {
    path: "",
    changeFrequency: "weekly",
    priority: 1,
  },
  {
    path: "/blog",
    changeFrequency: "weekly",
    priority: 0.8,
  },
  {
    path: "/blog/tips",
    changeFrequency: "monthly",
    priority: 0.6,
  },
  {
    path: "/online-notepad",
    changeFrequency: "monthly",
    priority: 0.9,
  },
  {
    path: "/share-notes-online-without-login",
    changeFrequency: "monthly",
    priority: 0.9,
  },
  {
    path: "/online-notepad-with-shareable-link",
    changeFrequency: "monthly",
    priority: 0.85,
  },
  {
    path: "/share-text-between-devices",
    changeFrequency: "monthly",
    priority: 0.85,
  },
  {
    path: "/share-code-snippets-online",
    changeFrequency: "monthly",
    priority: 0.85,
  },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return staticRoutes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
