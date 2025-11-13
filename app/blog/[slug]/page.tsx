import { notFound } from "next/navigation";
import Link from "next/link";
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
            {new Date(post.date).toLocaleDateString()} • {post.tags.join(" · ")}
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
              '@context': 'https://schema.org',
              '@type': 'BlogPosting',
              headline: post.title,
              datePublished: post.date,
              description: post.excerpt,
              url: `/blog/${post.slug}`,
              mainEntityOfPage: {
                '@type': 'WebPage',
                '@id': `/blog/${post.slug}`,
              },
            }),
          }}
        />
      </article>
    </div>
  );
}
