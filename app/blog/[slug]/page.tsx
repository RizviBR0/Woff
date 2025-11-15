import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/navbar";
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
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          {post.content.map((para, idx) => (
            <p key={idx}>{para}</p>
          ))}
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
    </div>
  );
}
