/**
 * Heuristic programming language detection and chat message code segmenter.
 * Parses fenced code blocks (including unspaced syntax like ```#include<stdio.h>)
 * and detects programming languages for syntax highlighting.
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
export const KNOWN_LANGUAGES: Record<string, string> = {
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
  sol: "Solidity",
  solidity: "Solidity",
  vue: "Vue",
  svelte: "Svelte",
  graphql: "GraphQL",
  gql: "GraphQL",
  proto: "Protobuf",
  protobuf: "Protobuf",
  elixir: "Elixir",
  ex: "Elixir",
  exs: "Elixir",
  lua: "Lua",
  haskell: "Haskell",
  hs: "Haskell",
  scala: "Scala",
  toml: "TOML",
  terraform: "Terraform",
  tf: "Terraform",
  docker: "Dockerfile",
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  make: "Makefile",
  r: "R",
  matlab: "MATLAB",
  perl: "Perl",
  pl: "Perl",
  ps1: "PowerShell",
  powershell: "PowerShell",
};

/**
 * Formats a language tag into a clean, human-readable display name.
 */
export function formatLanguageTag(tag: string): string {
  const clean = tag.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(KNOWN_LANGUAGES, clean)) {
    return KNOWN_LANGUAGES[clean];
  }
  if (clean === "c#" || clean === "c++") return clean.toUpperCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Checks if a string is a valid language identifier rather than actual code.
 */
export function isLanguageIdentifier(tag: string): boolean {
  if (!tag) return false;
  const clean = tag.trim().toLowerCase();
  if (clean === "c#" || clean === "c++") return true;
  // If it contains syntax characters, it's code, not a tag
  if (/[\s<>;=(){}"'`]/.test(clean)) return false;
  if (Object.prototype.hasOwnProperty.call(KNOWN_LANGUAGES, clean)) return true;
  // Standard identifier word (e.g. 'solidity', 'vue', 'terraform')
  return /^[a-z0-9_#+.-]{1,25}$/.test(clean);
}

/**
 * Automatically detects the programming language of a code snippet using heuristic pattern matching.
 */
export function detectLanguage(code: string, hintedLang?: string): string {
  if (hintedLang && isLanguageIdentifier(hintedLang)) {
    return formatLanguageTag(hintedLang);
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
    Swift: 0,
    Kotlin: 0,
    Dart: 0,
    Ruby: 0,
    YAML: 0,
    Solidity: 0,
    GraphQL: 0,
    Dockerfile: 0,
  };

  const fullTrimmed = code.trim();
  // Cap heuristic regex scanning to avoid quadratic work on huge pastes
  const text = fullTrimmed.slice(0, 4000);

  // 1. JSON check (strict or structural)
  if (
    (fullTrimmed.startsWith("{") && fullTrimmed.endsWith("}")) ||
    (fullTrimmed.startsWith("[") && fullTrimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(fullTrimmed);
      return "JSON";
    } catch {
      if (/"[a-zA-Z0-9_]{1,64}"\s*:\s*("[^"\n]{0,200}"|\d+|true|false|null|{|\[)/.test(text)) {
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
    (/\bint\s+main\s*\([^)\n]{0,120}\)\s*\{/i.test(text) || /\bvoid\s+main\s*\([^)\n]{0,120}\)\s*\{/i.test(text)) &&
    !/static\s+void\s+main/i.test(text)
  ) {
    scores.C += 25;
    scores["C++"] += 20;
  }

  // 3. Python patterns
  if (/def\s+[a-zA-Z_]\w*\s*\([^)\n]{0,160}\)\s*:/i.test(text)) {
    scores.Python += 30;
  }
  if (/if\s+__name__\s*==\s*["']__main__["']\s*:/i.test(text)) {
    scores.Python += 35;
  }
  if (/\belif\s+[^\n:]{1,160}:/i.test(text)) {
    scores.Python += 25;
  }
  if (/(^|\n)(import\s+[a-zA-Z0-9_]+(\s+as\s+[a-zA-Z0-9_]+)?|from\s+[a-zA-Z0-9_.]+\s+import\s+)/.test(text)) {
    scores.Python += 20;
  }
  if (/\bprint\s*\([^)\n]{0,200}\)/.test(text)) {
    scores.Python += 15;
  }
  if (/\bself\.[a-zA-Z_]/.test(text)) {
    scores.Python += 15;
  }
  if (/\b(None|True|False)\b/.test(text)) {
    scores.Python += 10;
  }

  // 4. JavaScript / TypeScript
  if (/\bconsole\.(log|error|warn|info|debug)\s*\(/.test(text)) {
    scores.JavaScript += 25;
  }
  if (/\b(const|let|var)\s+[a-zA-Z_$]\w*\s*=/i.test(text)) {
    scores.JavaScript += 15;
  }
  if (/=>\s*\{|=>\s*[a-zA-Z0-9_$]/.test(text)) {
    scores.JavaScript += 15;
  }
  if (/import\s+[^\n]{1,160}\s+from\s+['"][^'\n"]{1,200}['"]/.test(text)) {
    scores.JavaScript += 20;
  }
  if (/export\s+(default\s+)?(const|function|class)/.test(text)) {
    scores.JavaScript += 18;
  }
  // TypeScript specific indicators (explicitly separated from JS)
  let tsIndicators = 0;
  if (/:\s*(string|number|boolean|any|void|unknown|never|Record<|Array<|Promise<)[,\s;=)]/.test(text)) {
    tsIndicators += 25;
  }
  if (/\binterface\s+[A-Z]\w*\s*(\{|extends)/.test(text)) {
    tsIndicators += 30;
  }
  if (/\btype\s+[A-Z]\w*\s*=/.test(text)) {
    tsIndicators += 30;
  }
  if (/\bas\s+(const|[A-Z]\w*)/.test(text)) {
    tsIndicators += 20;
  }
  // Only count explicit generic constraints (not plain JSX tags like <Header>)
  if (/<[A-Z]\w*\s+extends\s+[^>\n]{1,120}>/.test(text)) {
    tsIndicators += 20;
  }
  if (/\b(private|protected|public|readonly)\s+[a-zA-Z_$]\w*\s*:/.test(text)) {
    tsIndicators += 25;
  }
  scores.TypeScript = tsIndicators;

  // React JSX / TSX detection
  const hasReactOrJsx =
    (/<(div|span|button|input|form|section|article|header|footer|table|p|h1|h2|h3)[^>\n]{0,200}>/i.test(text) ||
     /<[A-Z]\w*[^>\n]{0,200}>/m.test(text)) &&
    (/\bclassName=/i.test(text) ||
     /\bonClick=/i.test(text) ||
     /\buseState\b/i.test(text) ||
     /\buseEffect\b/i.test(text) ||
     /import\s+React/i.test(text) ||
     /return\s*\(\s*</m.test(text));

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
  if (/fn\s+main\s*\([^)\n]{0,80}\)/i.test(text) || /fn\s+[a-zA-Z_]\w*\s*\([^)\n]{0,160}\)\s*(->\s*[^{\n]{1,80})?\{/.test(text)) {
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
  if (/^package\s+(main|[a-z_][a-z0-9_]*)\s*$/m.test(text)) {
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
  if (/<(html|head|body|div|span|button|input|form|section|article|header|footer|table|tbody|tr|td)[^>\n]{0,200}>/i.test(text) && !hasReactOrJsx) {
    scores.HTML += 25;
  }

  // 10. CSS
  if (/@media\s*\(|@keyframes\s+[a-zA-Z_-]/i.test(text)) {
    scores.CSS += 35;
  }
  if (/\b(margin|padding|display|background|border|font-family|font-size|flex|grid|position)\s*:\s*[^;\n]{1,160};/i.test(text)) {
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

  // 14. Swift
  if (/\bimport\s+(UIKit|Foundation|SwiftUI|Cocoa)\b/.test(text)) {
    scores.Swift += 35;
  }
  if (/\bguard\s+let\s+[a-zA-Z_$]\w*\s*=\s*/.test(text) || /\bfunc\s+[a-zA-Z_]\w*\s*\([^)\n]{0,160}\)\s*->/.test(text)) {
    scores.Swift += 30;
  }

  // 15. Kotlin
  if (/\b(fun\s+[a-zA-Z_]\w*\s*\(|val\s+[a-zA-Z_]\w*\s*=|import\s+kotlin\.)/.test(text) || /\bpackage\s+[a-z]+(\.[a-z0-9_]+)+\b/.test(text)) {
    scores.Kotlin += 35;
  }

  // 16. Dart
  if (/\b(import\s+['"]package:flutter|Widget\s+build\(|StatefulWidget|StatelessWidget)\b/.test(text) || (/\bvoid\s+main\s*\(\)/.test(text) && /\b(print\s*\(|final\s+|var\s+|Future<|async\s*\{)/.test(text))) {
    scores.Dart += 35;
  }

  // 17. Ruby
  if (/(^|\n)[ \t]*(def\s+[a-zA-Z_]\w*|class\s+[A-Z]\w*\s*<|puts\s+|require\s+['"][^'\n"]{1,120}['"]|attr_accessor)\b/.test(text) && /\bend\b/.test(text)) {
    scores.Ruby += 35;
  }

  // 18. YAML
  if (/^[a-zA-Z0-9_-]+:\s*(\n\s*-\s+|\n\s+[a-zA-Z0-9_-]+:|"[^"]*"|'[^']*'|\S+)/m.test(text) && !/[;{}]/.test(text)) {
    scores.YAML += 30;
  }

  // 19. Solidity
  if (/pragma\s+solidity\b|contract\s+[A-Z]\w*\s*\{/i.test(text)) {
    scores.Solidity += 45;
  }

  // 20. GraphQL
  if (/\b(query|mutation|subscription|schema|type|input)\s+[A-Z]\w*\s*\{/i.test(text)) {
    scores.GraphQL += 35;
  }

  // 21. Dockerfile
  if (/^(FROM|RUN|COPY|ADD|ENTRYPOINT|CMD|WORKDIR|EXPOSE|ENV)\s+[^\n]+/m.test(text)) {
    scores.Dockerfile += 35;
  }

  // React JSX / TSX override
  if (hasReactOrJsx) {
    return scores.TypeScript >= 20 ? "TypeScript (TSX)" : "JavaScript (JSX)";
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

  // TypeScript vs JavaScript: Only promote to TypeScript if there are genuine TypeScript type constructs
  if (detected === "JavaScript" && scores.TypeScript >= 20) {
    return "TypeScript";
  }

  return maxScore >= 12 ? detected : "Code";
}

/**
 * Parses a chat message string into an ordered array of text and code segments.
 * Correctly handles:
 * 1. Standard fenced code blocks (```python ... ```)
 * 2. Unspaced / malformed fences (```#include<stdio.h> ... ```)
 * 3. Preserves unfenced text verbatim as plain text
 */
export function parseMessageSegments(content: string): MessageSegment[] {
  if (!content) return [];

  const segments: MessageSegment[] = [];

  // Regex matching fenced code blocks (supports both LF and CRLF)
  const fenceRegex = /```([^\r\n`]*)(?:\r?\n)?([\s\S]*?)```/g;

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
      // Valid language tag identifier (e.g. ```python, ```solidity, ```ts)
      finalCode = rawBody;
      language = detectLanguage(rawBody, rawTag);
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
 * Processes plain text outside of code fences.
 * Unfenced text is preserved as plain text without automatic code block conversion.
 * Code blocks are only created when explicitly fenced with triple backticks (```).
 */
function processTextChunk(chunk: string, segments: MessageSegment[]): void {
  if (!chunk) return;
  segments.push({ type: "text", content: chunk });
}

