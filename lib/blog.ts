export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO
  tags: string[];
  content: string[]; // simple paragraphs for now
};

export const blogPosts: BlogPost[] = [
  {
    slug: "introducing-woff",
    title: "Introducing Woff: Simple Shareable Spaces",
    excerpt:
      "Meet Woff — a fast, minimal way to create and share collaborative spaces without friction.",
    date: "2025-11-01",
    tags: ["announcement", "product"],
    content: [
      "We built Woff to remove friction from sharing ideas. Create a space instantly, share a URL or QR code, and collaborate in real-time.",
      "No accounts are required to get started, and you can add a passcode if you need privacy.",
      "We're just getting started — expect frequent improvements and a growing set of building blocks for your documents.",
    ],
  },
  {
    slug: "tips-for-faster-sharing",
    title: "5 Tips for Faster Sharing with Woff",
    excerpt:
      "Speed up your workflow with these quick tips for links, photos, and notes.",
    date: "2025-11-05",
    tags: ["tips", "productivity"],
    content: [
      "Use the '+' menu to quickly add photos, notes, or drawings.",
      "Share a space via QR code for instant access across devices.",
      "Protect a space with a passcode when collaborating beyond your team.",
      "Try the rich note editor for headings, lists, and formatting.",
      "Use the image viewer for multi-photo previews and quick downloads.",
    ],
  },
  {
    slug: "behind-the-scenes",
    title: "Behind the Scenes: Designing Woff",
    excerpt: "A quick peek at the principles that drive our design decisions.",
    date: "2025-11-10",
    tags: ["design", "engineering"],
    content: [
      "Woff is built on a few principles: clarity, speed, and focus.",
      "We optimize common actions and keep UI elements purposeful and minimal.",
      "Your feedback shapes our roadmap — keep it coming!",
    ],
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}
