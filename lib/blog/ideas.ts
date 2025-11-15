export type BlogIdea = {
  title: string;
  slug: string;
  primaryKeyword: string;
  metaTitle: string;
  metaDescription: string;
  pillar: "A" | "B" | "C";
};

export const firstTenIdeas: BlogIdea[] = [
  {
    title: "How to Share Notes Online Without Login in Under 10 Seconds",
    slug: "share-notes-online-without-login",
    primaryKeyword: "share notes online without login",
    metaTitle: "Share Notes Online Without Login in Seconds | Woff",
    metaDescription:
      "Learn how to share notes online without login in under 10 seconds using Woff – a fast, free online notepad with instant shareable links.",
    pillar: "A",
  },
  {
    title: "What Is an Online Notepad and Why It’s Faster Than Docs or Email",
    slug: "what-is-an-online-notepad",
    primaryKeyword: "online notepad",
    metaTitle: "What Is an Online Notepad? Faster than Docs or Email | Woff",
    metaDescription:
      "Understand what an online notepad is and why it’s the fastest way to capture and share quick notes compared to Docs or email.",
    pillar: "A",
  },
  {
    title:
      "Online Notepad With Shareable Link – The Easiest Way to Send Text Between Devices",
    slug: "online-notepad-with-shareable-link",
    primaryKeyword: "online notepad with shareable link",
    metaTitle: "Online Notepad With Shareable Link | Woff",
    metaDescription:
      "Send text between devices instantly using a shareable link. Learn how an online notepad like Woff makes it effortless.",
    pillar: "A",
  },
  {
    title:
      "Best Free Online Notepad Tools in 2025 (and When You Should Use Woff)",
    slug: "best-free-online-notepad-tools-2025",
    primaryKeyword: "free online notepad",
    metaTitle: "Best Free Online Notepad Tools (2025) | Woff",
    metaDescription:
      "Compare top free online notepad tools in 2025 and learn when a fast, link-based notepad like Woff is the best fit.",
    pillar: "A",
  },
  {
    title: "How Teachers Can Share Class Notes Online With Students for Free",
    slug: "share-class-notes-online",
    primaryKeyword: "share class notes online",
    metaTitle: "Share Class Notes Online With Students (Free) | Woff",
    metaDescription:
      "A quick way for teachers to share class notes online with students for free — using instant links, no accounts.",
    pillar: "B",
  },
  {
    title: "How Students Can Share Notes Online With Friends Before Exams",
    slug: "share-notes-online-for-students",
    primaryKeyword: "share notes online with friends",
    metaTitle: "How Students Share Notes Online With Friends | Woff",
    metaDescription:
      "The fastest way for students to share notes online with friends before exams — create, paste, share a link.",
    pillar: "B",
  },
  {
    title: "The Fastest Way to Share Meeting Notes Online With a Remote Team",
    slug: "share-meeting-notes-online",
    primaryKeyword: "share meeting notes online",
    metaTitle: "Share Meeting Notes Online Fast | Woff",
    metaDescription:
      "Share meeting notes online with a remote team in seconds — a simple workflow with instant shareable links.",
    pillar: "B",
  },
  {
    title:
      "A Simple Way to Share To-Do Lists and Grocery Lists Online With Family",
    slug: "share-lists-online-with-family",
    primaryKeyword: "share to do list online",
    metaTitle: "Share To-Do & Grocery Lists Online With Family | Woff",
    metaDescription:
      "Keep family lists in sync by sharing a single link. Create, edit, and share to-do and grocery lists online.",
    pillar: "B",
  },
  {
    title:
      "Minimalist Note-Taking – How to Keep Your Notes Simple and Still Find Them Later",
    slug: "minimalist-note-taking",
    primaryKeyword: "minimalist note taking",
    metaTitle: "Minimalist Note-Taking: Simple and Findable | Woff",
    metaDescription:
      "A minimalist note-taking approach that keeps notes simple and still easy to find later.",
    pillar: "C",
  },
  {
    title: "Online Notepad vs Full Note-Taking Apps – When You Need Which One",
    slug: "online-notepad-vs-note-taking-apps",
    primaryKeyword: "online notepad vs note taking apps",
    metaTitle: "Online Notepad vs Note-Taking Apps | Woff",
    metaDescription:
      "When to use a lightweight online notepad vs a full note-taking app — strengths, tradeoffs, and workflows.",
    pillar: "C",
  },
];

export const pillars = {
  A: "Online Notepad & Sharing",
  B: "Use-Case Focused",
  C: "Productivity & Systems",
};
