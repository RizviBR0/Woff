import Link from "next/link";
import type { BlogPost } from "@/lib/blog";

type ArticleBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbers"; items: string[] }
  | { type: "code"; language: string; code: string }
  | { type: "table"; rows: string[][] }
  | { type: "cta"; text: string };

function headingId(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseBlocks(content: string[]): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  for (let index = 0; index < content.length; index += 1) {
    const value = content[index].trim();
    if (!value) continue;
    if (value.startsWith("## ")) {
      blocks.push({ type: "heading", level: 2, text: value.slice(3) });
      continue;
    }
    if (value.startsWith("### ")) {
      blocks.push({ type: "heading", level: 3, text: value.slice(4) });
      continue;
    }
    if (value.startsWith("```")) {
      const lines = value.split("\n");
      blocks.push({
        type: "code",
        language: lines[0].slice(3).trim(),
        code: lines.slice(1, lines.at(-1)?.startsWith("```") ? -1 : undefined).join("\n"),
      });
      continue;
    }
    if (value.startsWith("|")) {
      const rows = value
        .split("\n")
        .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
        .filter(
          (row) =>
            row.length > 0 &&
            !row.every((cell) => /^:?-{3,}:?$/.test(cell)),
        );
      blocks.push({ type: "table", rows });
      continue;
    }
    if (value.startsWith("**CTA:**") || value.startsWith("CTA:")) {
      blocks.push({
        type: "cta",
        text: value.replace(/^\*\*CTA:\*\*\s*|^CTA:\s*/, ""),
      });
      continue;
    }
    if (/^[-*]\s+/.test(value)) {
      const items = [value.replace(/^[-*]\s+/, "")];
      while (index + 1 < content.length && /^[-*]\s+/.test(content[index + 1])) {
        index += 1;
        items.push(content[index].replace(/^[-*]\s+/, ""));
      }
      blocks.push({ type: "bullets", items });
      continue;
    }
    if (/^\d+\.\s+/.test(value)) {
      const items = [value.replace(/^\d+\.\s+/, "")];
      while (index + 1 < content.length && /^\d+\.\s+/.test(content[index + 1])) {
        index += 1;
        items.push(content[index].replace(/^\d+\.\s+/, ""));
      }
      blocks.push({ type: "numbers", items });
      continue;
    }
    blocks.push({ type: "paragraph", text: value });
  }
  return blocks;
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${part}-${index}`}
          className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.88em] text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const isExternal = /^https?:\/\//.test(link[2]);
      return (
        <a
          key={`${part}-${index}`}
          href={link[2]}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          className="font-semibold text-orange-600 underline decoration-orange-500/30 underline-offset-4 hover:decoration-orange-500 dark:text-orange-400"
        >
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

export function BlogArticleContent({ post }: { post: BlogPost }) {
  const blocks = parseBlocks(post.content);

  return (
    <>
      {post.takeaways?.length ? (
        <aside className="mb-12 border-y border-orange-500/25 bg-orange-500/[0.045] px-5 py-6 sm:px-7">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400">
            The short version
          </p>
          <ul className="mt-4 space-y-3">
            {post.takeaways.map((takeaway) => (
              <li key={takeaway} className="flex gap-3 text-sm leading-6 text-foreground/80">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                <span>{takeaway}</span>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      <div className="article-copy">
        {blocks.map((block, index) => {
          if (block.type === "heading") {
            const Tag = block.level === 2 ? "h2" : "h3";
            return (
              <Tag
                key={`${block.text}-${index}`}
                id={headingId(block.text)}
                className={
                  block.level === 2
                    ? "scroll-mt-24 border-t border-border pt-9 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl"
                    : "scroll-mt-24 pt-4 text-xl font-bold tracking-tight text-foreground"
                }
              >
                {block.text}
              </Tag>
            );
          }
          if (block.type === "bullets" || block.type === "numbers") {
            const List = block.type === "bullets" ? "ul" : "ol";
            return (
              <List
                key={`${block.type}-${index}`}
                className={`ml-5 space-y-2 text-[1.02rem] leading-8 text-foreground/75 ${
                  block.type === "bullets" ? "list-disc" : "list-decimal"
                }`}
              >
                {block.items.map((item) => (
                  <li key={item} className="pl-1 marker:font-bold marker:text-orange-500">
                    <InlineText text={item} />
                  </li>
                ))}
              </List>
            );
          }
          if (block.type === "code") {
            return (
              <div key={`code-${index}`} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-lg">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  <span>{block.language || "plain text"}</span>
                  <span>Copy-ready example</span>
                </div>
                <pre className="overflow-x-auto p-5 font-mono text-sm leading-6 text-zinc-200">
                  <code>{block.code}</code>
                </pre>
              </div>
            );
          }
          if (block.type === "table") {
            const [headings, ...rows] = block.rows;
            return (
              <div key={`table-${index}`} className="overflow-x-auto rounded-2xl border">
                <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                  <thead className="bg-zinc-950 text-white dark:bg-white dark:text-black">
                    <tr>
                      {headings?.map((cell) => (
                        <th key={cell} className="px-4 py-3 font-semibold">{cell}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row, rowIndex) => (
                      <tr key={`${row.join("-")}-${rowIndex}`} className="odd:bg-muted/35">
                        {row.map((cell, cellIndex) => (
                          <td key={`${cell}-${cellIndex}`} className="px-4 py-3 leading-6 text-foreground/75">
                            <InlineText text={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          if (block.type === "cta") {
            return (
              <aside
                key={`cta-${index}`}
                className="relative my-12 overflow-hidden rounded-[1.75rem] bg-zinc-950 px-6 py-7 text-white shadow-2xl sm:px-8 dark:bg-white dark:text-black"
              >
                <div className="absolute inset-y-0 left-0 w-1.5 bg-orange-500" />
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400 dark:text-orange-600">
                  Put it into practice
                </p>
                <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                  <p className="max-w-xl text-lg font-semibold leading-7">{block.text}</p>
                  <Link
                    href="/"
                    className="inline-flex shrink-0 items-center justify-center rounded-full bg-orange-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                  >
                    Open Woff
                  </Link>
                </div>
              </aside>
            );
          }
          return (
            <p key={`${block.text}-${index}`} className="text-[1.04rem] leading-8 text-foreground/75 sm:text-[1.08rem]">
              <InlineText text={block.text} />
            </p>
          );
        })}
      </div>

      {post.faq?.length ? (
        <section className="mt-14 border-t pt-10" aria-labelledby="faq-title">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400">
            Useful answers
          </p>
          <h2 id="faq-title" className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            Frequently asked questions
          </h2>
          <div className="mt-6 divide-y border-y">
            {post.faq.map((item) => (
              <details key={item.question} className="group py-5">
                <summary className="cursor-pointer list-none pr-8 font-bold marker:hidden">
                  {item.question}
                </summary>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
