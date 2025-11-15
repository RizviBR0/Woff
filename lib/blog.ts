export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO
  tags: string[];
  content: string[]; // simple paragraphs for now
  author: {
    name: string;
    avatarUrl?: string;
  };
  coverImageUrl?: string;
};

export const blogPosts: BlogPost[] = [
  {
    slug: "share-notes-online-without-login",
    title: "How to Share Notes Online Without Login in Under 10 Seconds",
    excerpt:
      "Share notes online without login in under 10 seconds using Woff — a fast, free online notepad with instant shareable links.",
    date: "2025-11-16",
    tags: ["how-to", "guide", "online-notepad"],
    author: { name: "Woff Team", avatarUrl: "/woff_team.png" },
    coverImageUrl: "https://picsum.photos/seed/woff-share-notes/1200/630",
    content: [
      "Need to share text fast without creating an account? Woff lets you write anything and share it instantly with a link.",
      "Open Woff, paste or type your note, and click Share. You'll get a short link you can send anywhere — no login required.",
      "This is perfect for quick instructions, ideas, meeting notes, or text you want to move from your phone to your laptop.",
      "Tip: Add a passcode if you want a little extra privacy before sharing your link.",
      "Next up, compare this flow with email or docs — Woff keeps it frictionless so you can focus on the message, not the tool.",
    ],
  },
  {
    slug: "online-notepad-with-shareable-link",
    title:
      "Online Notepad With Shareable Link – The Easiest Way to Send Text Between Devices",
    excerpt:
      "Send text between devices instantly with a shareable link. See why an online notepad like Woff makes this effortless.",
    date: "2025-11-16",
    tags: ["online-notepad", "shareable-link", "how-to"],
    author: { name: "Woff Team", avatarUrl: "/woff_team.png" },
    coverImageUrl: "https://picsum.photos/seed/woff-shareable-link/1200/630",
    content: [
      "Need to move text from phone to laptop quickly? A shareable link beats email drafts and messaging groups.",
      "Open Woff on your phone, paste your text, tap Share, and open the link on your laptop — done.",
      "Because there's no login, the flow stays fast. Add a passcode when you need a little extra privacy.",
      "For longer-term docs or formatting-heavy content, switch to a full editor — but for speed, Woff is ideal.",
    ],
  },
  {
    slug: "best-free-online-notepad-tools-2025",
    title:
      "Best Free Online Notepad Tools in 2025 (and When You Should Use Woff)",
    excerpt:
      "Compare the top free online notepads in 2025 and learn when a fast, link-based notepad like Woff is the best fit.",
    date: "2025-11-16",
    tags: ["comparison", "online-notepad", "2025"],
    author: { name: "Woff Team", avatarUrl: "/woff_team.png" },
    coverImageUrl: "https://picsum.photos/seed/woff-best-free/1200/630",
    content: [
      "Online notepads shine when you need speed and simplicity. We review popular options and where each excels.",
      "If instant sharing is your priority, Woff's no-login, shareable link model keeps you moving.",
      "Use this guide to pick the fastest tool for your specific job: quick capture, comparison, or collaboration.",
    ],
  },
  {
    slug: "share-class-notes-online",
    title: "How Teachers Can Share Class Notes Online With Students for Free",
    excerpt:
      "A quick, free way for teachers to share class notes online: create, paste, share a link — no accounts required.",
    date: "2025-11-16",
    tags: ["education", "teachers", "how-to"],
    author: { name: "Woff Team", avatarUrl: "/woff_team.png" },
    coverImageUrl: "https://picsum.photos/seed/woff-teachers/1200/630",
    content: [
      "Teachers often need to get notes out fast. Woff creates a link you can post in LMS, email, or chat.",
      "Open Woff, paste your notes, click Share. Students can view instantly on any device.",
      "You can add a passcode if needed, and update notes later without changing the link.",
    ],
  },
  {
    slug: "share-notes-online-for-students",
    title: "How Students Can Share Notes Online With Friends Before Exams",
    excerpt:
      "The fastest way for students to share notes online with friends before exams — create, paste, share one link.",
    date: "2025-11-16",
    tags: ["students", "study", "how-to"],
    author: { name: "Woff Team", avatarUrl: "/woff_team.png" },
    coverImageUrl: "https://picsum.photos/seed/woff-students/1200/630",
    content: [
      "Group chats get messy; screenshots are hard to read. A single Woff link keeps everyone on the same page.",
      "Paste your notes, add headings or bullet points, share the link with your study group.",
      "Edit live to fix typos or add tips; changes show up instantly for your friends.",
    ],
  },
  {
    slug: "share-meeting-notes-online",
    title: "The Fastest Way to Share Meeting Notes Online With a Remote Team",
    excerpt:
      "Capture meeting notes and share them online with a remote team in seconds using an instant link.",
    date: "2025-11-16",
    tags: ["remote", "teams", "how-to"],
    author: { name: "Woff Team", avatarUrl: "/woff_team.png" },
    coverImageUrl: "https://picsum.photos/seed/woff-remote/1200/630",
    content: [
      "After a call, speed matters. Open Woff, drop your notes, click Share, and post the link in chat.",
      "No file attachments, no permission hurdles — just one link the team can open anywhere.",
      "When ready, move decisions into project tools. Use Woff for the fast capture and broadcast step.",
    ],
  },
  {
    slug: "share-lists-online-with-family",
    title:
      "A Simple Way to Share To-Do Lists and Grocery Lists Online With Family",
    excerpt:
      "Keep family to-do and grocery lists in sync by sharing a single link that anyone can open on any device.",
    date: "2025-11-16",
    tags: ["family", "lists", "how-to"],
    author: { name: "Woff Team", avatarUrl: "/woff_team.png" },
    coverImageUrl: "https://picsum.photos/seed/woff-family/1200/630",
    content: [
      "Create a list in Woff and share the link with family. Everyone can reference the same page.",
      "Update the list before heading out; the latest version is always just a tap away.",
      "Great for groceries, chores, travel prep, and quick household notes.",
    ],
  },
  {
    slug: "minimalist-note-taking",
    title:
      "Minimalist Note-Taking – How to Keep Your Notes Simple and Still Find Them Later",
    excerpt:
      "A minimalist note-taking approach that keeps notes simple and still easy to find later.",
    date: "2025-11-16",
    tags: ["productivity", "note-taking"],
    author: { name: "Woff Team", avatarUrl: "/woff_team.png" },
    coverImageUrl: "https://picsum.photos/seed/woff-minimal/1200/630",
    content: [
      "Less is more: concise notes are faster to review and reuse.",
      "Use quick headings, short bullets, and one link to share or reference across devices.",
      "Combine Woff for capture/sharing with your favorite long-term archive for the best of both.",
    ],
  },
  {
    slug: "online-notepad-vs-note-taking-apps",
    title: "Online Notepad vs Full Note-Taking Apps – When You Need Which One",
    excerpt:
      "When to use a lightweight online notepad vs a full note-taking app — strengths, tradeoffs, and workflows.",
    date: "2025-11-16",
    tags: ["comparison", "note-taking"],
    author: { name: "Woff Team", avatarUrl: "/woff_team.png" },
    coverImageUrl: "https://picsum.photos/seed/woff-compare/1200/630",
    content: [
      "Use an online notepad for speed: quick capture, share a link, move on.",
      "Use full apps for structure: collaboration, formatting, and long-term archives.",
      "Pick the fastest tool for each step in your workflow, not one tool for everything.",
    ],
  },
  {
    slug: "what-is-an-online-notepad",
    title: "What Is an Online Notepad and Why It's Faster Than Docs or Email",
    excerpt:
      "Learn what an online notepad is and why it's the fastest way to capture and share quick notes compared to Docs or email.",
    date: "2025-11-16",
    tags: ["online-notepad", "comparison", "guide"],
    author: { name: "Woff Team", avatarUrl: "/woff_team.png" },
    coverImageUrl: "https://picsum.photos/seed/woff-online-notepad/1200/630",
    content: [
      "An online notepad is a lightweight, in-browser editor where you can type or paste text and share it instantly with a link.",
      "Unlike email or full document tools, it removes setup steps — no files, permissions, or formatting overhead to slow you down.",
      "With Woff, you open a page, write your note, click Share, and send one link. There's no login required for quick sharing.",
      "Use it for quick instructions, ideas, code snippets, or text you need to move across devices in seconds.",
      "When you need collaboration, structure, or long-term archives, a full doc app makes sense — but for speed, an online notepad wins.",
    ],
  },
  {
    slug: "introducing-woff",
    title: "Introducing Woff: Simple Shareable Spaces",
    excerpt:
      "Meet Woff — a fast, minimal way to create and share collaborative spaces without friction.",
    date: "2025-11-01",
    tags: ["announcement", "product"],
    author: { name: "Woff Team", avatarUrl: "/woff_team.png" },
    coverImageUrl: "https://picsum.photos/seed/woff-intro/1200/630",
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
    author: { name: "Rizvi", avatarUrl: "/rizvi.png" },
    coverImageUrl: "https://picsum.photos/seed/woff-tips/1200/630",
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
    author: {
      name: "Woff Design",
      avatarUrl: "/woff_team.png",
    },
    coverImageUrl: "https://picsum.photos/seed/woff-design/1200/630",
    content: [
      "Woff is built on a few principles: clarity, speed, and focus.",
      "We optimize common actions and keep UI elements purposeful and minimal.",
      "Your feedback shapes our roadmap — keep it coming!",
    ],
  },
  // Additional posts
  {
    slug: "introducing-woff-simple-shareable-spaces",
    title: "Introducing Woff: Simple, Shareable Spaces",
    date: "2025-11-10",
    excerpt:
      "Meet Woff — the fastest way to create a minimal space you can share instantly for notes, photos, files and quick ideas.",
    tags: ["Product", "Launch"],
    author: { name: "Woff Team", avatarUrl: "/woff_team.png" },
    coverImageUrl: "https://picsum.photos/seed/woff-launch/1200/630",
    content: [
      "Woff helps you spin up a clean, minimal space instantly. No setup. No signup required for quick sharing.",
      "Each space gets a short link you can share. Drop text, images, drawings, and files — everything stays simple and delightful.",
      "We built Woff with speed, clarity, and modern UI patterns in mind. More improvements are coming soon!",
    ],
  },
  {
    slug: "quick-tips-speed-up-your-workflows",
    title: "Quick Tips: Speed Up Your Woff Workflows",
    date: "2025-11-12",
    excerpt:
      "Three power-user tips to move faster in Woff: keyboard actions, instant uploads, and clean sharing.",
    tags: ["Tips", "Guides"],
    author: { name: "Rizvi", avatarUrl: "/rizvi.png" },
    coverImageUrl: "https://picsum.photos/seed/woff-tips2/1200/630",
    content: [
      "Use keyboard-driven actions to keep momentum. Common actions like copy, download, and open are right where you need them.",
      "Drag and drop images or files directly into a space — they upload instantly and render beautifully.",
      "Share your space link confidently. The interface is clean by default and looks great in both light and dark mode.",
    ],
  },
  {
    slug: "october-november-updates-better-uploads-and-ui-polish",
    title: "October–November Updates: Better Uploads and UI Polish",
    date: "2025-11-14",
    excerpt:
      "Improved image handling, file ZIP downloads, and a refined Discord-style chat layout with avatars and time.",
    tags: ["Updates", "Changelog"],
    author: {
      name: "Woff Engineering",
      avatarUrl: "/woff_team.png",
    },
    coverImageUrl: "https://picsum.photos/seed/woff-changelog/1200/630",
    content: [
      "Photos now support multi-select galleries with quick ZIP downloads.",
      "We introduced a cleaner chat-style layout with avatars and simplified timestamps.",
      "General polish across components, better dark mode ergonomics, and faster interactions.",
    ],
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}
