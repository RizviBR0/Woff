import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight, Clock3 } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { BlogArticleContent } from "@/components/blog-article-content";
import {
  getPostBySlug,
  getPostHeadings,
  getPublishedBlogPosts,
  getReadingTime,
  getRelatedPosts,
} from "@/lib/blog";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://woff.space";

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function generateStaticParams() {
  return getPublishedBlogPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Article not found", robots: { index: false } };

  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt;
  const image = post.coverImageUrl || `${siteUrl}/og-image.png`;

  return {
    title,
    description,
    keywords: post.tags,
    authors: [{ name: post.author.name }],
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title,
      description,
      type: "article",
      url: `/blog/${post.slug}`,
      siteName: "Woff Space",
      publishedTime: post.date,
      modifiedTime: post.updatedDate || post.date,
      authors: [post.author.name],
      tags: post.tags,
      images: [{ url: image, width: 1200, height: 630, alt: post.coverAlt || post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post || post.date > new Date().toISOString().slice(0, 10)) notFound();

  const headings = getPostHeadings(post);
  const relatedPosts = getRelatedPosts(post);
  const readingTime = getReadingTime(post);
  const articleUrl = `${siteUrl}/blog/${post.slug}`;
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seoDescription || post.excerpt,
    url: articleUrl,
    mainEntityOfPage: { "@type": "WebPage", "@id": articleUrl },
    image: post.coverImageUrl || `${siteUrl}/og-image.png`,
    datePublished: post.date,
    dateModified: post.updatedDate || post.date,
    author: { "@type": "Organization", name: post.author.name, url: siteUrl },
    publisher: {
      "@type": "Organization",
      name: "Woff Space",
      url: siteUrl,
      logo: { "@type": "ImageObject", url: `${siteUrl}/android-chrome-512x512.png` },
    },
    keywords: post.tags.join(", "),
    wordCount: post.content.join(" ").split(/\s+/).length,
    timeRequired: `PT${readingTime}M`,
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${siteUrl}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: articleUrl },
    ],
  };
  const faqSchema = post.faq?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: post.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      }
    : null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <article>
          <header className="border-b pt-24 sm:pt-28">
            <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
              <nav aria-label="Breadcrumb" className="mb-10">
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground transition hover:text-orange-600"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  All field notes
                </Link>
              </nav>

              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
                <div className="max-w-4xl">
                  <div className="mb-5 flex flex-wrap items-center gap-2">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-orange-500/25 bg-orange-500/[0.06] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h1 className="text-balance text-4xl font-extrabold leading-[1.04] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
                    {post.title}
                  </h1>
                  <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">
                    {post.excerpt}
                  </p>
                </div>

                <div className="border-l-2 border-orange-500 pl-5 font-mono text-[11px] leading-6 text-muted-foreground">
                  <p className="font-bold uppercase tracking-[0.14em] text-foreground">
                    Woff field note
                  </p>
                  <p className="mt-2">
                    Published <time dateTime={post.date}>{formatDate(post.date)}</time>
                  </p>
                  {post.updatedDate ? (
                    <p>Updated <time dateTime={post.updatedDate}>{formatDate(post.updatedDate)}</time></p>
                  ) : null}
                  <p className="inline-flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" /> {readingTime} min read
                  </p>
                  <div className="mt-3 flex items-center gap-2 border-t pt-3">
                    {post.author.avatarUrl ? (
                      <Image
                        src={post.author.avatarUrl}
                        alt=""
                        width={28}
                        height={28}
                        className="rounded-full"
                      />
                    ) : null}
                    <span>Written by {post.author.name}</span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {post.coverImageUrl ? (
            <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
              <div className="relative aspect-[16/8] overflow-hidden rounded-[1.5rem] bg-muted sm:rounded-[2rem]">
                <Image
                  src={post.coverImageUrl}
                  alt={post.coverAlt || post.title}
                  fill
                  sizes="(max-width: 1280px) 100vw, 1280px"
                  className="object-cover"
                  priority
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 to-transparent" />
              </div>
            </div>
          ) : null}

          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[220px_minmax(0,760px)_1fr] lg:px-8 lg:py-20">
            <aside className="hidden lg:block">
              <div className="sticky top-24 border-l pl-5">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  In this note
                </p>
                <nav aria-label="Article outline" className="mt-4 space-y-3">
                  {headings.map((heading) => (
                    <a
                      key={heading.id}
                      href={`#${heading.id}`}
                      className="block text-xs leading-5 text-muted-foreground transition hover:text-orange-600"
                    >
                      {heading.title}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            <div className="min-w-0">
              <BlogArticleContent post={post} />
            </div>

            <aside className="hidden xl:block">
              <div className="sticky top-24 rounded-2xl border bg-muted/25 p-5">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">
                  The Woff rule
                </p>
                <p className="mt-3 text-sm font-semibold leading-6">
                  Use the lightest tool that keeps the context clear.
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Quick handoffs belong in a quick space. Durable records belong in a durable system.
                </p>
              </div>
            </aside>
          </div>
        </article>

        <section className="border-y bg-zinc-950 py-14 text-white dark:bg-zinc-900" aria-labelledby="related-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">
                  Continue reading
                </p>
                <h2 id="related-heading" className="mt-2 text-3xl font-extrabold tracking-tight">
                  Related field notes
                </h2>
              </div>
              <Link href="/blog" className="hidden text-sm font-bold text-orange-400 sm:inline">
                Browse all
              </Link>
            </div>
            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl bg-white/15 md:grid-cols-3">
              {relatedPosts.map((related) => (
                <Link
                  key={related.slug}
                  href={`/blog/${related.slug}`}
                  className="group bg-zinc-950 p-6 transition hover:bg-zinc-900"
                >
                  <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    {formatDate(related.date)} · {getReadingTime(related)} min
                  </p>
                  <h3 className="mt-4 text-lg font-bold leading-6 group-hover:text-orange-400">
                    {related.title}
                  </h3>
                  <span className="mt-6 inline-flex items-center gap-1 text-xs font-bold text-orange-400">
                    Read note <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />
      {faqSchema ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }} />
      ) : null}
    </div>
  );
}
