import { Navbar } from "@/components/navbar";

export const metadata = {
  title: "Blog Tips • Woff (Internal)",
  robots: { index: false, follow: false },
  alternates: { canonical: "/blog/tips" },
};

export default function BlogTipsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20">
        <h1 className="text-3xl sm:text-4xl font-bold mt-8 mb-6">
          Woff Blog Content Strategy
        </h1>
        <p className="text-muted-foreground mb-8">
          This page summarizes our content strategy for the Woff blog:
          positioning, content pillars, the first 10 posts to publish, and an
          SEO-friendly post template.
        </p>

        <section className="space-y-4 mb-10">
          <h2 className="text-2xl font-semibold">
            Positioning & Core Keywords
          </h2>
          <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground">
            <li>
              Positioning: “A super fast online notepad where you can write
              anything and share it instantly with a link — no login, no
              friction.”
            </li>
            <li>
              Primary keyword family: online notepad; share notes online; no
              login, instant link; use-cases.
            </li>
            <li>
              Competitors: aNotepad, HyperNotepad, ProtectedText, Notepad.link,
              ShareText, OnlineNotepad.io.
            </li>
            <li>
              Approach: Start with long-tail and use-case content; expand later.
            </li>
          </ul>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="text-2xl font-semibold">Content Pillars</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold">
                Pillar A — Online Notepad & Sharing
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                <li>
                  What Is an Online Notepad and Why It’s Faster Than Docs or
                  Email
                </li>
                <li>
                  How to Share Notes Online Without Login in Under 10 Seconds
                </li>
                <li>
                  Best Free Online Notepad Tools in 2025 (and When You Should
                  Use Woff)
                </li>
                <li>
                  Online Notepad With Shareable Link – The Easiest Way to Send
                  Text Between Devices
                </li>
                <li>
                  Pastebin vs Online Notepad vs Woff – Which Is Better for
                  Sharing Code Snippets?
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-xl font-semibold">
                Pillar B — Use-Case Focused
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                <li>
                  How Teachers Can Share Class Notes Online With Students for
                  Free
                </li>
                <li>
                  The Fastest Way to Share Meeting Notes Online With a Remote
                  Team
                </li>
                <li>
                  How Students Can Share Notes Online With Friends Before Exams
                </li>
                <li>
                  How to Send Text From Phone to PC Without Email or Messaging
                  Apps
                </li>
                <li>
                  A Simple Way to Share To-Do Lists and Grocery Lists Online
                  With Family
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-xl font-semibold">
                Pillar C — Productivity & Systems
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
                <li>
                  Minimalist Note-Taking: How to Keep Your Notes Simple and
                  Still Find Them Later
                </li>
                <li>
                  Digital Note-Taking for Students: Tools and Workflows That
                  Actually Work
                </li>
                <li>
                  How to Capture Ideas Fast When You’re Busy – An Online
                  Note-Taking Workflow
                </li>
                <li>
                  Online Notepad vs Full Note-Taking Apps – When You Need Which
                  One
                </li>
                <li>
                  How Bloggers and Content Writers Use Online Notepads to Plan
                  Articles Faster
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="text-2xl font-semibold">First 10 Posts (Order)</h2>
          <ol className="list-decimal pl-6 space-y-2 text-sm text-muted-foreground">
            <li>How to Share Notes Online Without Login in Under 10 Seconds</li>
            <li>
              What Is an Online Notepad and Why It’s Faster Than Docs or Email
            </li>
            <li>
              Online Notepad With Shareable Link – The Easiest Way to Send Text
              Between Devices
            </li>
            <li>
              Best Free Online Notepad Tools in 2025 (and When You Should Use
              Woff)
            </li>
            <li>
              How Teachers Can Share Class Notes Online With Students for Free
            </li>
            <li>
              How Students Can Share Notes Online With Friends Before Exams
            </li>
            <li>
              The Fastest Way to Share Meeting Notes Online With a Remote Team
            </li>
            <li>
              A Simple Way to Share To-Do Lists and Grocery Lists Online With
              Family
            </li>
            <li>
              Minimalist Note-Taking – How to Keep Your Notes Simple and Still
              Find Them Later
            </li>
            <li>
              Online Notepad vs Full Note-Taking Apps – When You Need Which One
            </li>
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">
            Post Structure & On-Page SEO Template
          </h2>
          <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground">
            <li>
              Choose one primary keyword and place it in title, slug, intro, one
              H2, and meta description.
            </li>
            <li>
              Structure: short intro; 3–5 H2 sections; concise paragraphs;
              screenshots/GIFs if helpful.
            </li>
            <li>
              Inline product placement with a simple CTA in the middle and near
              the end.
            </li>
            <li>
              Internal links: two related blog posts + one main product/landing
              page.
            </li>
          </ul>
          <div className="mt-4 p-4 rounded-lg border bg-card">
            <div className="text-sm font-medium mb-2">CTA example</div>
            <p className="text-sm text-muted-foreground">
              Try Woff in your browser — Open Woff, type your note, click
              “Share,” and send the link anywhere — no sign-up required.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
