/**
 * Heuristic programming language detection and chat message code segmenter.
 * Automatically parses fenced code blocks (including unspaced syntax like ```#include<stdio.h>)
 * and detects raw code snippets in chat messages.
 */

export interface CodeSegment {
  type: "code";
  code: string;
  language: string;
  raw?: string;
}

export interface TextSegment {
  type: "text";
  content: string;
}

export type MessageSegment = CodeSegment | TextSegment;

// Map common markdown language tags to canonical display names
const KNOWN_LANGUAGES: Record<string, string> = {
  c: "C",
  cpp: "C++",
  "c++": "C++",
  cc: "C++",
  cxx: "C++",
  h: "C / C++ Header",
  hpp: "C++ Header",
  cs: "C#",
  csharp: "C#",
  py: "Python",
  python: "Python",
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JavaScript (JSX)",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TypeScript (TSX)",
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "Less",
  sql: "SQL",
  mysql: "MySQL",
  pgsql: "PostgreSQL",
  postgres: "PostgreSQL",
  sqlite: "SQLite",
  java: "Java",
  rs: "Rust",
  rust: "Rust",
  go: "Go",
  golang: "Go",
  sh: "Shell",
  bash: "Bash",
  zsh: "Zsh",
  shell: "Shell",
  json: "JSON",
  jsonc: "JSON",
  php: "PHP",
  rb: "Ruby",
  ruby: "Ruby",
  kt: "Kotlin",
  kotlin: "Kotlin",
  swift: "Swift",
  dart: "Dart",
  yaml: "YAML",
  yml: "YAML",
  xml: "XML",
  svg: "SVG",
  md: "Markdown",
  markdown: "Markdown",
};

/**
 * Checks if a string is a valid language identifier rather than actual code.
 */
function isLanguageIdentifier(tag: string): boolean {
  if (!tag) return false;
  const clean = tag.trim().toLowerCase();
  // If it contains symbols like #, <, >, ;, =, (, ), {, }, quotes or spaces, it's code, not a tag
  // Exception: 'c#' and 'c++'
  if (clean === "c#" || clean === "c++") return true;
  if (/[\s#<>;=(){}"'`]/.test(clean)) return false;
  return clean in KNOWN_LANGUAGES;
}

/**
 * Automatically detects the programming language of a code snippet using heuristic pattern matching.
 */
export function detectLanguage(code: string, hintedLang?: string): string {
  if (hintedLang && isLanguageIdentifier(hintedLang)) {
    const known = KNOWN_LANGUAGES[hintedLang.trim().toLowerCase()];
    if (known) return known;
  }

  const scores: Record<string, number> = {
    C: 0,
    "C++": 0,
    Python: 0,
    JavaScript: 0,
    TypeScript: 0,
    Java: 0,
    Rust: 0,
    Go: 0,
    SQL: 0,
    HTML: 0,
    CSS: 0,
    JSON: 0,
    Bash: 0,
    PHP: 0,
    "C#": 0,
  };

  const text = code.trim();

  // 1. JSON check (strict or structural)
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    try {
      JSON.parse(text);
      return "JSON";
    } catch {
      if (/"[a-zA-Z0-9_]+"\s*:\s*("[^"]*"|\d+|true|false|null|{|\[)/.test(text)) {
        scores.JSON += 25;
      }
    }
  }

  // 2. C / C++ patterns
  if (/#include\s*<stdio\.h>/i.test(text) || /#include\s*<stdlib\.h>/i.test(text) || /#include\s*<string\.h>/i.test(text)) {
    scores.C += 35;
  }
  if (/#include\s*<iostream>/i.test(text) || /#include\s*<vector>/i.test(text) || /#include\s*<algorithm>/i.test(text) || /#include\s*<string>/i.test(text)) {
    scores["C++"] += 40;
  }
  if (/#include\s*<[a-zA-Z0-9_.]+>/i.test(text) || /#include\s*"[a-zA-Z0-9_.]+"/i.test(text)) {
    scores.C += 20;
    scores["C++"] += 20;
  }
  if (/\bstd::/i.test(text) || /cout\s*<</i.test(text) || /cin\s*>>/i.test(text) || /using\s+namespace\s+std/i.test(text)) {
    scores["C++"] += 35;
  }
  if (/\bprintf\s*\(/.test(text) || /\bscanf\s*\(/.test(text)) {
    scores.C += 20;
    scores["C++"] += 15;
  }
  if (/\bmalloc\s*\(/.test(text) || /\bfree\s*\(/.test(text) || /\bsizeof\s*\(/.test(text)) {
    scores.C += 15;
    scores["C++"] += 10;
  }
  if (
    (/\bint\s+main\s*\([^)]*\)\s*\{/i.test(text) || /\bvoid\s+main\s*\([^)]*\)\s*\{/i.test(text)) &&
    !/static\s+void\s+main/i.test(text)
  ) {
    scores.C += 25;
    scores["C++"] += 20;
  }

  // 3. Python patterns
  if (/def\s+[a-zA-Z_]\w*\s*\([^)]*\)\s*:/i.test(text)) {
    scores.Python += 30;
  }
  if (/if\s+__name__\s*==\s*["']__main__["']\s*:/i.test(text)) {
    scores.Python += 35;
  }
  if (/elif\s+.*:/i.test(text)) {
    scores.Python += 25;
  }
  if (/(^|\n)(import\s+[a-zA-Z0-9_]+(\s+as\s+[a-zA-Z0-9_]+)?|from\s+[a-zA-Z0-9_.]+\s+import\s+)/.test(text)) {
    scores.Python += 20;
  }
  if (/\bprint\s*\([^)]*\)/.test(text) && !/[;{}]/.test(text)) {
    scores.Python += 15;
  }
  if (/\bself\.[a-zA-Z_]/.test(text)) {
    scores.Python += 15;
  }
  if (/\b(None|True|False)\b/.test(text) && !/[;{}]/.test(text)) {
    scores.Python += 10;
  }

  // 4. JavaScript / TypeScript
  if (/\bconsole\.(log|error|warn|info|debug)\s*\(/.test(text)) {
    scores.JavaScript += 25;
    scores.TypeScript += 25;
  }
  if (/\b(const|let|var)\s+[a-zA-Z_$]\w*\s*=/i.test(text)) {
    scores.JavaScript += 15;
    scores.TypeScript += 15;
  }
  if (/=>\s*\{|=>\s*[a-zA-Z0-9_$]/.test(text)) {
    scores.JavaScript += 15;
    scores.TypeScript += 15;
  }
  if (/import\s+.*\s+from\s+['"][^'"]+['"]/.test(text)) {
    scores.JavaScript += 20;
    scores.TypeScript += 20;
  }
  if (/export\s+(default\s+)?(const|function|class|type|interface)/.test(text)) {
    scores.JavaScript += 18;
    scores.TypeScript += 18;
  }
  // TypeScript specific indicators
  if (
    /:\s*(string|number|boolean|any|void|unknown|never|Record<|Array<)[,\s;=)]/.test(text) ||
    /\binterface\s+[A-Z]\w*\s*\{/.test(text) ||
    /\btype\s+[A-Z]\w*\s*=/.test(text) ||
    /\bas\s+const\b/.test(text) ||
    /<[A-Z]\w*>/g.test(text)
  ) {
    scores.TypeScript += 30;
  }

  // 5. Java
  if (/public\s+static\s+void\s+main\s*\(/i.test(text)) {
    scores.Java += 40;
  }
  if (/System\.out\.print(ln)?\s*\(/i.test(text)) {
    scores.Java += 35;
  }
  if (/public\s+(class|interface|enum)\s+[A-Z]\w*/i.test(text)) {
    scores.Java += 20;
  }
  if (/@Override\b|@Autowired\b|@Component\b/.test(text)) {
    scores.Java += 20;
  }

  // 6. Rust
  if (/fn\s+main\s*\([^)]*\)/i.test(text) || /fn\s+[a-zA-Z_]\w*\s*\([^)]*\)\s*(->\s*[^{]+)?\{/.test(text)) {
    scores.Rust += 35;
  }
  if (/println!\s*\(|eprintln!\s*\(|vec!\s*\[/.test(text)) {
    scores.Rust += 30;
  }
  if (/\blet\s+mut\s+/.test(text)) {
    scores.Rust += 25;
  }
  if (/use\s+std::/.test(text)) {
    scores.Rust += 25;
  }
  if (/impl(\s+[A-Z]\w*)?\s+for\s+[A-Z]/.test(text)) {
    scores.Rust += 25;
  }

  // 7. Go
  if (/package\s+(main|[a-zA-Z_]\w*)/.test(text)) {
    scores.Go += 30;
  }
  if (/func\s+main\s*\(\)/.test(text) || /func\s+\([a-zA-Z_]+\s+\*?[a-zA-Z_]+\)/.test(text)) {
    scores.Go += 30;
  }
  if (/fmt\.Print(ln|f)?\s*\(/.test(text)) {
    scores.Go += 30;
  }
  if (/:=/.test(text)) {
    scores.Go += 15;
  }

  // 8. SQL
  if (/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/i.test(text)) {
    scores.SQL += 35;
  }
  if (/\b(FROM|WHERE|LEFT\s+JOIN|INNER\s+JOIN|GROUP\s+BY|ORDER\s+BY|HAVING)\b/i.test(text)) {
    scores.SQL += 20;
  }

  // 9. HTML
  if (/<!DOCTYPE\s+html>/i.test(text)) {
    scores.HTML += 40;
  }
  if (/<(html|head|body|div|span|button|input|form|section|article|header|footer|table|tbody|tr|td)[^>]*>/i.test(text)) {
    scores.HTML += 25;
  }

  // 10. CSS
  if (/@media\s*\(|@keyframes\s+[a-zA-Z_-]/i.test(text)) {
    scores.CSS += 35;
  }
  if (/\b(margin|padding|display|background|border|font-family|font-size|flex|grid|position)\s*:\s*[^;]+;/i.test(text)) {
    scores.CSS += 25;
  }

  // 11. Bash / Shell
  if (/^#!\s*\/bin\/(bash|sh|zsh)/m.test(text)) {
    scores.Bash += 40;
  }
  if (/\b(npm\s+(install|run|start|test|build)|npx\s+|pnpm\s+|yarn\s+)/.test(text)) {
    scores.Bash += 25;
  }
  if (/\b(sudo\s+|chmod\s+|chown\s+|curl\s+-|wget\s+|grep\s+-|mkdir\s+-p)/.test(text)) {
    scores.Bash += 25;
  }
  if (/\bgit\s+(checkout|commit|push|pull|clone|branch|merge|status|add)\b/.test(text)) {
    scores.Bash += 20;
  }

  // 12. PHP
  if (/<\?php/i.test(text)) {
    scores.PHP += 45;
  }
  if (/\$this->/.test(text)) {
    scores.PHP += 25;
  }

  // 13. C#
  if (/using\s+System(\.[a-zA-Z0-9_]+)*;/i.test(text)) {
    scores["C#"] += 35;
  }
  if (/Console\.WriteLine\s*\(/i.test(text)) {
    scores["C#"] += 30;
  }

  // Find best match
  let maxScore = 0;
  let detected = "Code";

  for (const [lang, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detected = lang;
    }
  }

  // Special disambiguation: If C or C++ won the max score
  if (detected === "C" || detected === "C++") {
    if (scores["C++"] > scores.C && scores["C++"] >= 15) {
      return "C++";
    }
    if (scores.C >= 15) {
      return "C";
    }
  }

  // TypeScript vs JavaScript disambiguation
  if (detected === "JavaScript" && scores.TypeScript >= 25) {
    return "TypeScript";
  }

  return maxScore >= 12 ? detected : "Code";
}

/**
 * Checks if an unfenced block of text strongly looks like source code.
 */
function isRawCodeParagraph(paragraph: string): boolean {
  const trimmed = paragraph.trim();
  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;

  // Obvious starts
  if (
    /^#include\s*[<"][^>"]+[>"]/i.test(trimmed) ||
    /^(import|export)\s+/m.test(trimmed) ||
    /^(public|private|protected)\s+(class|interface|static|void)/m.test(trimmed) ||
    /^def\s+[a-zA-Z_]\w*\s*\([^)]*\)\s*:/m.test(trimmed) ||
    /^func(tion)?\s+[a-zA-Z_]/m.test(trimmed) ||
    /^package\s+[a-zA-Z_]/m.test(trimmed) ||
    /^fn\s+main\s*\(/m.test(trimmed) ||
    /^<!DOCTYPE\s+html>/i.test(trimmed) ||
    /^<\?php/i.test(trimmed) ||
    /^using\s+System;/i.test(trimmed) ||
    /^(SELECT|INSERT\s+INTO|CREATE\s+TABLE)\b/i.test(trimmed)
  ) {
    return true;
  }

  // Count code-like syntax characteristics
  let codeSignals = 0;
  for (const line of lines) {
    const l = line.trim();
    if (l.endsWith(";") || l.endsWith("{") || l.endsWith("}") || l.endsWith(":")) {
      codeSignals++;
    }
    if (/(\bconst\b|\blet\b|\bvar\b|\bfunction\b|\bdef\b|\bclass\b|\breturn\b|\bif\s*\(|\bfor\s*\(|\bwhile\s*\()/.test(l)) {
      codeSignals++;
    }
    if (/\bconsole\.(log|error)|\bprintf\(|\bstd::|\bSystem\.out|\bprintln!/.test(l)) {
      codeSignals += 2;
    }
  }

  // If at least half the lines have distinct code tokens
  return codeSignals >= Math.max(3, Math.ceil(lines.length * 0.4));
}

/**
 * Parses a chat message string into an ordered array of text and code segments.
 * Correctly handles:
 * 1. Standard fenced code blocks (```python ... ```)
 * 2. Unspaced / malformed fences (```#include<stdio.h> ... ```)
 * 3. Multiple code blocks interspersed with normal text
 * 4. Raw code paragraphs that lack fences
 */
export function parseMessageSegments(content: string): MessageSegment[] {
  if (!content) return [];

  const segments: MessageSegment[] = [];

  // Regex matching fenced code blocks: ```[tag or first line]\n[rest of body]``` or single-line ```...```
  const fenceRegex = /```([^\r\n`]*)[\r\n]?([\s\S]*?)```/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    const matchStart = match.index;
    const matchEnd = fenceRegex.lastIndex;

    // Push preceding text segment if non-empty
    if (matchStart > lastIndex) {
      const textChunk = content.slice(lastIndex, matchStart);
      processTextChunk(textChunk, segments);
    }

    const rawTag = (match[1] || "").trim();
    const rawBody = match[2] || "";

    let finalCode: string;
    let language: string;

    if (isLanguageIdentifier(rawTag)) {
      // Valid language tag provided by user
      finalCode = rawBody;
      const detected = detectLanguage(rawBody, rawTag);
      language = detected !== "Code" ? detected : KNOWN_LANGUAGES[rawTag.toLowerCase()] || rawTag;
    } else if (rawTag.length > 0) {
      // The tag itself is actually the first line of code! (e.g. ```#include<stdio.h>)
      finalCode = rawBody ? `${rawTag}\n${rawBody}` : rawTag;
      language = detectLanguage(finalCode);
    } else {
      // No tag provided: ```\ncode\n```
      finalCode = rawBody;
      language = detectLanguage(finalCode);
    }

    segments.push({
      type: "code",
      code: finalCode.replace(/\r\n/g, "\n"),
      language,
      raw: match[0],
    });

    lastIndex = matchEnd;
  }

  // Process any remaining text after the last code block
  if (lastIndex < content.length) {
    const tailChunk = content.slice(lastIndex);
    processTextChunk(tailChunk, segments);
  }

  return segments;
}

/**
 * Inspects a plain text chunk (outside of fences).
 * If the chunk contains multiline raw code paragraphs, separates them as code segments.
 */
function processTextChunk(chunk: string, segments: MessageSegment[]): void {
  if (!chunk) return;

  // Split by double newlines into logical paragraphs
  const paragraphs = chunk.split(/\n\s*\n/);
  if (paragraphs.length <= 1) {
    // Single block - check if entire block is raw code
    if (isRawCodeParagraph(chunk)) {
      segments.push({
        type: "code",
        code: chunk.trim().replace(/\r\n/g, "\n"),
        language: detectLanguage(chunk),
      });
      return;
    }
    segments.push({ type: "text", content: chunk });
    return;
  }

  let accumulatedText = "";

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const isCode = isRawCodeParagraph(p);

    if (isCode) {
      if (accumulatedText) {
        segments.push({ type: "text", content: accumulatedText });
        accumulatedText = "";
      }
      segments.push({
        type: "code",
        code: p.trim().replace(/\r\n/g, "\n"),
        language: detectLanguage(p),
      });
    } else {
      accumulatedText += (accumulatedText ? "\n\n" : "") + p;
    }
  }

  if (accumulatedText) {
    segments.push({ type: "text", content: accumulatedText });
  }
}
