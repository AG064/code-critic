import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "./types.js";

const extensionLanguages: Record<string, SupportedLanguage> = {
  ".c": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cs": "csharp",
  ".css": "css",
  ".go": "go",
  ".h": "c",
  ".hpp": "cpp",
  ".html": "html",
  ".htm": "html",
  ".java": "java",
  ".js": "javascript",
  ".jsx": "javascript",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".php": "php",
  ".py": "python",
  ".rb": "ruby",
  ".rs": "rust",
  ".sh": "shell",
  ".bash": "shell",
  ".sql": "sql",
  ".swift": "swift",
  ".ts": "typescript",
  ".tsx": "typescript"
};

const languageAliases: Record<string, SupportedLanguage> = {
  c: "c",
  "c++": "cpp",
  cpp: "cpp",
  cs: "csharp",
  "c#": "csharp",
  csharp: "csharp",
  css: "css",
  golang: "go",
  go: "go",
  html: "html",
  java: "java",
  js: "javascript",
  javascript: "javascript",
  kotlin: "kotlin",
  php: "php",
  py: "python",
  python: "python",
  rb: "ruby",
  ruby: "ruby",
  rs: "rust",
  rust: "rust",
  bash: "shell",
  shell: "shell",
  sql: "sql",
  swift: "swift",
  ts: "typescript",
  typescript: "typescript"
};

interface LanguageSignal {
  language: SupportedLanguage;
  pattern: RegExp;
  weight: number;
}
const contentSignals: LanguageSignal[] = [
  { language: "python", pattern: /^\s*(?:async\s+)?def\s+\w+\s*\(/m, weight: 4 },
  { language: "python", pattern: /^\s*(?:from\s+[\w.]+\s+import|import\s+[\w.]+)/m, weight: 2 },
  { language: "python", pattern: /^\s*class\s+\w+.*:\s*$/m, weight: 3 },
  { language: "typescript", pattern: /\b(?:interface|type)\s+[A-Z]\w*\s*(?:=|\{)/, weight: 4 },
  { language: "typescript", pattern: /\b(?:const|let|function)\s+\w+[^\n]*:\s*[A-Za-z][\w<>, |\[\]]*/, weight: 3 },
  { language: "javascript", pattern: /\b(?:const|let|var)\s+\w+\s*=/, weight: 2 },
  { language: "javascript", pattern: /(?:=>|\bconsole\.(?:log|error|warn)\s*\()/, weight: 2 },
  { language: "java", pattern: /\bpublic\s+(?:final\s+)?class\s+\w+/, weight: 4 },
  { language: "java", pattern: /\bSystem\.out\.print(?:ln)?\s*\(/, weight: 3 },
  { language: "csharp", pattern: /^\s*using\s+System(?:\.\w+)*\s*;/m, weight: 4 },
  { language: "csharp", pattern: /\b(?:namespace\s+\w+|Console\.WriteLine\s*\()/, weight: 3 },
  { language: "cpp", pattern: /^\s*#include\s*<iostream>/m, weight: 4 },
  { language: "cpp", pattern: /\b(?:std::|cout\s*<<|cin\s*>>)/, weight: 3 },
  { language: "c", pattern: /^\s*#include\s*<(?:stdio|stdlib|string)\.h>/m, weight: 4 },
  { language: "c", pattern: /\b(?:printf|scanf|malloc|free)\s*\(/, weight: 2 },
  { language: "go", pattern: /^\s*package\s+\w+/m, weight: 3 },
  { language: "go", pattern: /^\s*func\s+(?:\([^)]*\)\s*)?\w+\s*\(/m, weight: 4 },
  { language: "rust", pattern: /\bfn\s+(?:main|\w+)\s*\([^)]*\)\s*(?:->[^\{]+)?\{/, weight: 3 },
  { language: "rust", pattern: /\b(?:let\s+mut|impl\s+\w+|use\s+std::)/, weight: 3 },
  { language: "ruby", pattern: /^\s*def\s+\w+[!?=]?/m, weight: 3 },
  { language: "ruby", pattern: /^\s*(?:puts|require)\b/m, weight: 2 },
  { language: "php", pattern: /<\?php/, weight: 5 },
  { language: "php", pattern: /\$[A-Za-z_]\w*\s*(?:=|->)/, weight: 2 },
  { language: "kotlin", pattern: /\bfun\s+main\s*\(/, weight: 4 },
  { language: "kotlin", pattern: /\b(?:val|var)\s+\w+\s*(?::[^=\n]+)?=/, weight: 2 },
  { language: "swift", pattern: /^\s*import\s+(?:Foundation|SwiftUI|UIKit)/m, weight: 4 },
  { language: "swift", pattern: /\bfunc\s+\w+\s*\([^)]*\)\s*(?:->[^\{]+)?\{/, weight: 2 },
  { language: "html", pattern: /<!doctype\s+html|<html\b|<(?:main|section|div|body)\b[^>]*>/i, weight: 5 },
  { language: "css", pattern: /(?:^|\n)\s*[.#]?[A-Za-z][\w\s.#:[\]="'-]*\{\s*(?:--)?[\w-]+\s*:\s*[^{}\n;]+;/m, weight: 4 },
  { language: "sql", pattern: /\bSELECT\b[\s\S]+\bFROM\b/i, weight: 4 },
  { language: "sql", pattern: /\b(?:CREATE\s+TABLE|INSERT\s+INTO|ALTER\s+TABLE)\b/i, weight: 4 },
  { language: "shell", pattern: /^#!\s*\/.*\b(?:ba|z|k)?sh\b/m, weight: 5 },
  { language: "shell", pattern: /^\s*(?:export\s+\w+=|echo\s+|if\s+\[)/m, weight: 2 }
];

export function normalizeLanguageHint(value: string): SupportedLanguage | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  return languageAliases[normalized] ?? null;
}

export function detectLanguage(code: string, fileName: string): SupportedLanguage | null {
  const extensionMatch = /(?:^|\.)([^./\\]+)$/.exec(fileName.toLowerCase());
  const extension = extensionMatch ? `.${extensionMatch[1]}` : "";
  const extensionLanguage = extensionLanguages[extension];

  if (extensionLanguage) {
    return extensionLanguage;
  }

  const scores = new Map<SupportedLanguage, number>();

  for (const signal of contentSignals) {
    if (signal.pattern.test(code)) {
      scores.set(signal.language, (scores.get(signal.language) ?? 0) + signal.weight);
    }
  }

  let detected: SupportedLanguage | null = null;
  let highestScore = 0;

  for (const language of SUPPORTED_LANGUAGES) {
    const score = scores.get(language) ?? 0;
    if (score > highestScore) {
      highestScore = score;
      detected = language;
    }
  }

  return highestScore >= 2 ? detected : null;
}
