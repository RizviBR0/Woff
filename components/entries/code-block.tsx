"use client";

import { useMemo, useState } from "react";
import { Check, Code2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface CodeBlockProps {
  code: string;
  language: string;
}

// Language-specific accent colors for badges
const BADGE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  C: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400" },
  "C++": { bg: "bg-indigo-500/10", text: "text-indigo-400", dot: "bg-indigo-400" },
  "C#": { bg: "bg-purple-500/10", text: "text-purple-400", dot: "bg-purple-400" },
  Python: { bg: "bg-yellow-500/10", text: "text-yellow-400", dot: "bg-yellow-400" },
  JavaScript: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-400" },
  TypeScript: { bg: "bg-sky-500/10", text: "text-sky-400", dot: "bg-sky-400" },
  HTML: { bg: "bg-orange-500/10", text: "text-orange-400", dot: "bg-orange-400" },
  CSS: { bg: "bg-pink-500/10", text: "text-pink-400", dot: "bg-pink-400" },
  SQL: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  Java: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400" },
  Go: { bg: "bg-cyan-500/10", text: "text-cyan-400", dot: "bg-cyan-400" },
  Rust: { bg: "bg-orange-600/10", text: "text-orange-500", dot: "bg-orange-500" },
  JSON: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  Shell: { bg: "bg-teal-500/10", text: "text-teal-400", dot: "bg-teal-400" },
  Bash: { bg: "bg-teal-500/10", text: "text-teal-400", dot: "bg-teal-400" },
  PHP: { bg: "bg-violet-500/10", text: "text-violet-400", dot: "bg-violet-400" },
  Markdown: { bg: "bg-sky-500/10", text: "text-sky-400", dot: "bg-sky-400" },
  md: { bg: "bg-sky-500/10", text: "text-sky-400", dot: "bg-sky-400" },
};

/**
 * Fast token highlighter that colors keywords, strings, comments, numbers, and types.
 */
function highlightLine(line: string) {
  // Regex splitting comments, strings, keywords, numbers, and punctuation
  const tokenRegex =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b(?:int|char|float|double|void|bool|boolean|string|number|any|auto|const|let|var|def|function|func|fn|class|struct|interface|type|enum|public|private|protected|static|return|if|else|elif|for|while|do|switch|case|break|continue|default|import|from|export|package|using|namespace|include|template|typename|null|nullptr|nil|None|True|False|true|false|new|delete|try|catch|finally|throw|async|await|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|TABLE)\b)|(\b\d+(?:\.\d+)?\b)|([a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\())|([{}()[\];,.<>=!&|+*~/-]+)/g;

  let lastIndex = 0;
  const elements: React.ReactNode[] = [];
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      elements.push(line.slice(lastIndex, match.index));
    }

    const [full, comment, stringLit, keyword, numberLit, funcCall, symbol] = match;

    if (comment) {
      elements.push(
        <span key={match.index} className="text-zinc-500 italic">
          {comment}
        </span>
      );
    } else if (stringLit) {
      elements.push(
        <span key={match.index} className="text-emerald-400">
          {stringLit}
        </span>
      );
    } else if (keyword) {
      elements.push(
        <span key={match.index} className="text-purple-400 font-medium">
          {keyword}
        </span>
      );
    } else if (numberLit) {
      elements.push(
        <span key={match.index} className="text-amber-400">
          {numberLit}
        </span>
      );
    } else if (funcCall) {
      elements.push(
        <span key={match.index} className="text-sky-300">
          {funcCall}
        </span>
      );
    } else if (symbol) {
      elements.push(
        <span key={match.index} className="text-zinc-400">
          {symbol}
        </span>
      );
    } else {
      elements.push(full);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < line.length) {
    elements.push(line.slice(lastIndex));
  }

  return elements.length > 0 ? elements : line;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const cleanCode = useMemo(() => code.trim(), [code]);
  const lines = useMemo(() => cleanCode.split("\n"), [cleanCode]);

  const badgeStyle = BADGE_COLORS[language] || {
    bg: "bg-zinc-800",
    text: "text-zinc-300",
    dot: "bg-zinc-400",
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanCode);
      setCopied(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy code");
    }
  };

  return (
    <div className="not-prose my-3 w-full max-w-full overflow-hidden rounded-xl border border-zinc-800 bg-[#0d1117] text-zinc-100 shadow-md">
      {/* Top Header with Language Badge and Copy Button */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 bg-[#161b22] px-3.5 py-2">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-zinc-400" />
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium tracking-wide ${badgeStyle.bg} ${badgeStyle.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${badgeStyle.dot}`} />
            {language}
          </span>
          <span className="text-[11px] text-zinc-500 select-none">
            {lines.length} {lines.length === 1 ? "line" : "lines"}
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 gap-1.5 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium text-[11px]">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span className="text-[11px]">Copy</span>
            </>
          )}
        </Button>
      </div>

      {/* Code Display Area with Line Numbers */}
      <div className="overflow-x-auto p-3 text-xs sm:text-[13px] leading-relaxed font-mono">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                <td className="w-10 select-none pr-3 text-right text-[11px] text-zinc-600 font-mono align-top">
                  {idx + 1}
                </td>
                <td className="whitespace-pre pl-2 font-mono text-zinc-200 select-text">
                  {highlightLine(line) || "\n"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
