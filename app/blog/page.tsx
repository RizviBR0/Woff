import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { blogPosts } from "@/lib/blog";
import { Navbar } from "@/components/navbar";

export const metadata = {
  title: "Woff Blog • Product Updates, Tips, Stories",
  description: "Product updates, tips, and behind-the-scenes from Woff.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Woff Blog • Product Updates, Tips, Stories",
    description: "Product updates, tips, and behind-the-scenes from Woff.",
    type: "website",
    siteName: "Woff",
  },
  twitter: {
    card: "summary_large_image",
    title: "Woff Blog • Product Updates, Tips, Stories",
    description: "Product updates, tips, and behind-the-scenes from Woff.",
  },
};

export default function BlogPage() {
  const [featured, ...rest] = blogPosts;
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <Navbar />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-10">
        <div className="text-center mt-8 mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            Woff Blog
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 tracking-tight bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
            What’s new at Woff
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground">
            Product updates, tips, and behind-the-scenes.
          </p>
        </div>

        {/* Featured post */}
        {featured && (
          <Link href={`/blog/${featured.slug}`}>
            <Card className="group overflow-hidden border-border/60 bg-gradient-to-br from-primary/5 via-background to-secondary/10 backdrop-blur-sm hover:shadow-xl hover:-translate-y-0.5 transition-all">
              <CardContent className="p-8">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <time>{new Date(featured.date).toLocaleDateString()}</time>
                  <span aria-hidden>·</span>
                  <div className="flex gap-1 flex-wrap">
                    {featured.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="rounded-full px-2 py-0.5 text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold mb-2 group-hover:text-primary transition-colors">
                  {featured.title}
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground max-w-3xl">
                  {featured.excerpt}
                </p>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Grid of remaining posts */}
        <div className="grid sm:grid-cols-2 gap-6 mt-8">
          {rest.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`}>
              <Card className="group overflow-hidden border-border/60 bg-background/80 backdrop-blur-sm hover:shadow-lg hover:-translate-y-0.5 transition-all">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <time>{new Date(post.date).toLocaleDateString()}</time>
                    <span aria-hidden>·</span>
                    <div className="flex gap-1 flex-wrap">
                      {post.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="rounded-full px-2 py-0.5 text-[10px]">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{post.excerpt}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* JSON-LD structured data for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Blog',
              name: 'Woff Blog',
              url: '/blog',
              blogPost: blogPosts.map((p) => ({
                '@type': 'BlogPosting',
                headline: p.title,
                datePublished: p.date,
                description: p.excerpt,
                url: `/blog/${p.slug}`,
              })),
            }),
          }}
        />
      </section>
    </div>
  );
}
