import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { getPostBySlug } from "@/lib/blog";

export async function generateMetadata({ params }: { params: any }) {
  const p = await Promise.resolve(params);
  const post = getPostBySlug(p.slug);
  if (!post) return { title: "Blog • Woff" };
  return {
    title: `${post.title} • Woff`,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: `${post.title} • Woff`,
      description: post.excerpt,
      type: "article",
      siteName: "Woff",
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} • Woff`,
      description: post.excerpt,
    },
  };
}

export default async function BlogPostPage({ params }: { params: any }) {
  const p = await Promise.resolve(params);
  const post = getPostBySlug(p.slug);
  if (!post) return notFound();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <Navbar />

      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20">
        <div className="mt-8 mb-6">
          <Link
            href="/blog"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to Blog
          </Link>
        </div>
        <header className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">{post.title}</h1>
          <div className="text-sm text-muted-foreground">
            {post.tags.join(" · ")}
          </div>
          {post.coverImageUrl && (
            <div className="mt-5">
              <Image
                src={post.coverImageUrl}
                alt={post.title}
                width={1200}
                height={630}
                className="w-full h-64 sm:h-80 object-cover rounded-xl"
                priority
              />
            </div>
          )}
          <div className="mt-4 flex items-center gap-3">
            {post.author?.avatarUrl ? (
              <Image
                src={post.author.avatarUrl}
                alt={post.author.name}
                width={32}
                height={32}
                className="rounded-full"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
                {post.author?.name?.charAt(0) ?? "W"}
              </div>
            )}
            <div className="text-sm text-muted-foreground">
              By{" "}
              <span className="text-foreground font-medium">
                {post.author?.name ?? "Woff"}
              </span>
            </div>
          </div>
        </header>
        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-4 text-zinc-600 dark:text-zinc-300">
          {post.content.map((para, idx) => {
            // H2 headings
            if (para.startsWith("## ")) {
              return (
                <h2 key={idx} className="text-2xl font-bold mt-8 mb-4 text-foreground border-b border-zinc-200 dark:border-zinc-800 pb-2">
                  {para.replace("## ", "")}
                </h2>
              );
            }
            // H3 headings
            if (para.startsWith("### ")) {
              return (
                <h3 key={idx} className="text-xl font-bold mt-6 mb-3 text-foreground">
                  {para.replace("### ", "")}
                </h3>
              );
            }
            // Lists (- or *)
            if (para.startsWith("- ") || para.startsWith("* ")) {
              return (
                <ul key={idx} className="list-disc pl-6 space-y-1 my-2 text-zinc-600 dark:text-zinc-300">
                  <li>{para.replace(/^[-*]\s+/, "")}</li>
                </ul>
              );
            }
            // Numbered lists (1., 2. etc.)
            if (para.match(/^\d+\.\s/)) {
              const num = para.match(/^\d+/)?.[0];
              const text = para.replace(/^\d+\.\s+/, "");
              return (
                <ol key={idx} className="list-decimal pl-6 space-y-1 my-2 text-zinc-600 dark:text-zinc-300">
                  <li value={num ? parseInt(num) : undefined}>{text}</li>
                </ol>
              );
            }
            // Code block checking
            if (para.startsWith("```")) {
              const lines = para.split("\n");
              const code = lines.slice(1, -1).join("\n");
              return (
                <pre key={idx} className="bg-zinc-100 dark:bg-zinc-900/50 p-4 rounded-xl overflow-x-auto my-4 text-sm font-mono border border-zinc-200 dark:border-zinc-800/80">
                  <code>{code}</code>
                </pre>
              );
            }
            // Table checking
            if (para.startsWith("|")) {
              const lines = para.trim().split("\n");
              const rows = lines.map(line => line.split("|").map(cell => cell.trim()).filter((_, i, a) => i > 0 && i < a.length - 1));
              const headerRow = rows[0];
              const bodyRows = rows.slice(2); // Skip separator row
              return (
                <div key={idx} className="overflow-x-auto my-6 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                    <thead className="bg-zinc-50 dark:bg-zinc-900/40">
                      <tr>
                        {headerRow.map((cell, cIdx) => (
                          <th key={cIdx} className="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-transparent">
                      {bodyRows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="px-6 py-4 text-sm text-muted-foreground whitespace-pre-wrap">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
            // CTA banner/button
            if (para.startsWith("**CTA:**") || para.startsWith("CTA:")) {
              const ctaText = para.replace(/^\*\*CTA:\*\*\s*|^CTA:\s*/, "");
              return (
                <div key={idx} className="my-10 p-8 rounded-3xl border border-[#ff5a00]/30 bg-gradient-to-r from-[#ff5a00]/10 via-[#ff5a00]/5 to-transparent dark:from-[#ff5a00]/20 dark:via-[#ff5a00]/10 dark:to-transparent backdrop-blur-xl relative overflow-hidden shadow-xl dark:shadow-[0_0_50px_rgba(255,90,0,0.06)]">
                  {/* Subtle decorative glow */}
                  <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-[#ff5a00]/20 blur-2xl pointer-events-none" />
                  <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="space-y-1 text-center md:text-left">
                      <h4 className="font-bold text-lg text-foreground">Ready to try it?</h4>
                      <p className="text-sm text-muted-foreground">{ctaText}</p>
                    </div>
                    <Link
                      href="/"
                      className="cta-button-glow inline-flex items-center gap-2 px-6 py-3.5 bg-zinc-950 dark:bg-white text-white dark:text-black font-semibold text-sm rounded-xl hover:scale-[1.02] transition-transform duration-200"
                    >
                      Go to Homepage
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </Link>
                  </div>
                </div>
              );
            }
            // Standard paragraph
            return (
              <p key={idx} className="leading-relaxed">
                {para}
              </p>
            );
          })}
        </div>

        {/* JSON-LD structured data for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BlogPosting",
              headline: post.title,
              description: post.excerpt,
              url: `/blog/${post.slug}`,
              image: post.coverImageUrl,
              author: post.author?.name
                ? { "@type": "Person", name: post.author.name }
                : undefined,
              mainEntityOfPage: {
                "@type": "WebPage",
                "@id": `/blog/${post.slug}`,
              },
            }),
          }}
        />
      </article>
      <Footer />
    </div>
  );
}
