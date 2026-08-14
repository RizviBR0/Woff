import { MetadataRoute } from "next";
import { getPublishedBlogPosts } from "@/lib/blog";

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
  {
    path: "/about",
    changeFrequency: "monthly",
    priority: 0.5,
  },
  {
    path: "/privacy",
    changeFrequency: "monthly",
    priority: 0.5,
  },
  {
    path: "/terms",
    changeFrequency: "monthly",
    priority: 0.5,
  },
  {
    path: "/contact",
    changeFrequency: "monthly",
    priority: 0.5,
  },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
  const articles: MetadataRoute.Sitemap = getPublishedBlogPosts().map(
    (post) => ({
      url: `${siteUrl}/blog/${post.slug}`,
      lastModified: new Date(`${post.updatedDate || post.date}T00:00:00Z`),
      changeFrequency: "monthly",
      priority: 0.7,
    }),
  );
  return [...staticPages, ...articles];
}
