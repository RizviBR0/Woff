import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, Clock3 } from "lucide-react";
import { getPublishedBlogPosts, getReadingTime } from "@/lib/blog";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://woff.space";

export const metadata: Metadata = {
  title: "Woff Field Notes: Faster Ways to Share Online",
  description:
    "Practical guides for sharing notes, text, images, files, and code with less setup. Learn lightweight workflows for quick online handoffs.",
  keywords: [
    "share notes online",
    "online notepad",
    "share text between devices",
    "share code snippets",
    "temporary file sharing",
  ],
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Woff Field Notes: Faster Ways to Share Online",
    description:
      "Clear, practical guides to moving notes, files, images, and code between people and devices.",
    type: "website",
    url: "/blog",
    siteName: "Woff Space",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Woff Space field notes" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Woff Field Notes: Faster Ways to Share Online",
    description: "Practical guides for faster, clearer online handoffs.",
    images: ["/og-image.png"],
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default function BlogPage() {
  const posts = getPublishedBlogPosts();
  const featured = posts.find((post) => post.featured) || posts[0];
  const rest = posts.filter((post) => post.slug !== featured?.slug);

  const blogSchema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Woff Field Notes",
    description: metadata.description,
    url: `${siteUrl}/blog`,
    publisher: { "@type": "Organization", name: "Woff Space", url: siteUrl },
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      dateModified: post.updatedDate || post.date,
      url: `${siteUrl}/blog/${post.slug}`,
      image: post.coverImageUrl,
      author: { "@type": "Organization", name: post.author.name },
    })),
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 sm:pt-28">
        <section className="border-b">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_330px] lg:px-8 lg:pb-20">
            <div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-orange-600 dark:text-orange-400">
                Woff field notes
              </p>
              <h1 className="mt-5 max-w-4xl text-balance text-5xl font-extrabold leading-[0.98] tracking-[-0.055em] sm:text-7xl lg:text-8xl">
                Move information
                <span className="block text-orange-500">without ceremony.</span>
              </h1>
            </div>
            <div className="flex items-end border-l-2 border-orange-500 pl-6">
              <div>
                <p className="text-lg font-semibold leading-7">
                  Practical notes on quick sharing, useful context, and choosing the lightest tool for the job.
                </p>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Guides · Workflows · Product decisions
                </p>
              </div>
            </div>
          </div>
        </section>

        {featured ? (
          <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16" aria-labelledby="featured-title">
            <Link
              href={`/blog/${featured.slug}`}
              className="group grid overflow-hidden rounded-[1.75rem] border bg-muted/20 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl lg:grid-cols-[1.18fr_0.82fr]"
            >
              <div className="relative min-h-72 overflow-hidden bg-muted lg:min-h-[470px]">
                {featured.coverImageUrl ? (
                  <Image
                    src={featured.coverImageUrl}
                    alt={featured.coverAlt || featured.title}
                    fill
                    sizes="(max-width: 1024px) 100vw, 720px"
                    className="object-cover transition duration-700 group-hover:scale-[1.025]"
                    priority
                  />
                ) : null}
                <span className="absolute left-5 top-5 rounded-full bg-zinc-950/90 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur">
                  Featured dispatch
                </span>
              </div>
              <div className="flex flex-col justify-between p-6 sm:p-9 lg:p-10">
                <div>
                  <div className="flex flex-wrap gap-2">
                    {featured.tags.map((tag) => (
                      <span key={tag} className="font-mono text-[10px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h2 id="featured-title" className="mt-5 text-3xl font-extrabold leading-tight tracking-[-0.035em] sm:text-4xl">
                    {featured.title}
                  </h2>
                  <p className="mt-4 text-base leading-7 text-muted-foreground">
                    {featured.excerpt}
                  </p>
                </div>
                <div className="mt-10 flex items-center justify-between border-t pt-5">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {formatDate(featured.date)} · {getReadingTime(featured)} min read
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white transition group-hover:rotate-45">
                    <ArrowUpRight className="h-5 w-5" />
                  </span>
                </div>
              </div>
            </Link>
          </section>
        ) : null}

        <section className="border-t bg-muted/15 py-14 lg:py-20" aria-labelledby="latest-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400">
                  The archive
                </p>
                <h2 id="latest-title" className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
                  Latest field notes
                </h2>
              </div>
              <p className="hidden max-w-sm text-right text-sm leading-6 text-muted-foreground md:block">
                Specific answers for the moments when a full workspace is more tool than you need.
              </p>
            </div>

            <div className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {rest.map((post, index) => (
                <article
                  key={post.slug}
                  className={`group flex flex-col overflow-hidden rounded-2xl border bg-background transition hover:-translate-y-0.5 hover:border-orange-500/35 hover:shadow-lg ${
                    index === 0 ? "md:col-span-2 lg:col-span-1" : ""
                  }`}
                >
                  {post.coverImageUrl ? (
                    <Link href={`/blog/${post.slug}`} className="relative aspect-[16/9] overflow-hidden bg-muted" tabIndex={-1}>
                      <Image
                        src={post.coverImageUrl}
                        alt={post.coverAlt || post.title}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 400px"
                        className="object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                    </Link>
                  ) : null}
                  <div className="flex flex-1 flex-col p-6">
                    <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <time dateTime={post.date}>{formatDate(post.date)}</time>
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {getReadingTime(post)} min</span>
                    </div>
                    <h3 className="mt-5 text-xl font-extrabold leading-7 tracking-[-0.02em] group-hover:text-orange-600 dark:group-hover:text-orange-400">
                      <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                    </h3>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                      {post.excerpt}
                    </p>
                    <Link
                      href={`/blog/${post.slug}`}
                      className="mt-7 inline-flex items-center gap-2 self-start text-xs font-bold text-foreground transition group-hover:text-orange-600"
                    >
                      Read field note <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(blogSchema) }} />
    </div>
  );
}
