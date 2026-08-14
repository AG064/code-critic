import type { AnalysisType, NormalizedInput, QualityReport, SecurityReport } from "./domain";

export type ExportFormat = "txt" | "md" | "html";

export type ExportFile = {
  content: string;
  fileName: string;
  mimeType: string;
};

function locationText(lineStart: number | null, lineEnd: number | null): string {
  if (lineStart === null || lineEnd === null) {
    return "Whole file";
  }
  return lineStart === lineEnd ? `Line ${lineStart}` : `Lines ${lineStart}-${lineEnd}`;
}

function reportHeader(title: string, input: NormalizedInput): string[] {
  return [
    `# ${title}`,
    "",
    `File: ${input.code.file_name}`,
    `Language: ${input.code.language}`,
    `Lines: ${input.code.line_count}`
  ];
}

function qualityMarkdown(input: NormalizedInput, report: QualityReport): string {
  const lines = [
    ...reportHeader("Quality report", input),
    `Score: ${report.score}/100`,
    `Readability: ${report.readability_score}/100`,
    `Complexity: ${report.complexity_metrics.complexity_score}/100 (${report.complexity_metrics.level})`,
    "",
    "## Summary",
    "",
    report.summary,
    "",
    "## Complexity assessment",
    "",
    report.complexity_metrics.summary,
    "",
    "## Findings",
    ""
  ];

  if (report.findings.length === 0) {
    lines.push("No findings.", "");
  } else {
    report.findings.forEach((finding, index) => {
      lines.push(
        `### ${index + 1}. ${finding.title}`,
        "",
        `Severity: ${finding.severity}`,
        `Location: ${locationText(finding.line_start, finding.line_end)}`,
        "",
        finding.description,
        ""
      );
    });
  }

  lines.push("## Best-practice violations", "");
  if (report.best_practice_violations.length === 0) {
    lines.push("No best-practice violations.", "");
  } else {
    report.best_practice_violations.forEach((violation, index) => {
      lines.push(
        `### ${index + 1}. ${violation.title}`,
        "",
        `Severity: ${violation.severity}`,
        `Location: ${locationText(violation.line_start, violation.line_end)}`,
        "",
        violation.description,
        "",
        `Recommendation: ${violation.recommendation}`,
        ""
      );
    });
  }

  lines.push("## Recommendations", "");
  if (report.recommendations.length === 0) {
    lines.push("No recommendations.");
  } else {
    report.recommendations.forEach((recommendation, index) => {
      lines.push(
        `### ${index + 1}. ${recommendation.title}`,
        "",
        recommendation.description,
        ""
      );
    });
  }

  return lines.join("\n").trimEnd();
}

function securityMarkdown(input: NormalizedInput, report: SecurityReport): string {
  const lines = [
    ...reportHeader("Security report", input),
    `Risk: ${report.risk_assessment.level}`,
    "",
    "## Risk assessment",
    "",
    report.risk_assessment.summary,
    "",
    "## Vulnerabilities",
    ""
  ];

  if (report.vulnerabilities.length === 0) {
    lines.push("No vulnerabilities found.", "");
  } else {
    report.vulnerabilities.forEach((vulnerability, index) => {
      lines.push(
        `### ${index + 1}. ${vulnerability.title}`,
        "",
        `Severity: ${vulnerability.severity}`,
        `Category: ${vulnerability.category}`,
        `Location: ${locationText(vulnerability.line_start, vulnerability.line_end)}`,
        "",
        vulnerability.description,
        "",
        `Mitigation: ${vulnerability.mitigation}`,
        ""
      );
    });
  }

  lines.push("## Mitigations", "");
  if (report.mitigations.length === 0) {
    lines.push("No additional mitigations.");
  } else {
    report.mitigations.forEach((mitigation, index) => {
      lines.push(
        `### ${index + 1}. ${mitigation.title}`,
        "",
        mitigation.description,
        ""
      );
    });
  }

  return lines.join("\n").trimEnd();
}

export function createEditableReport(
  input: NormalizedInput,
  report: QualityReport | SecurityReport
): string {
  return report.analysis_type === "quality"
    ? qualityMarkdown(input, report)
    : securityMarkdown(input, report);
}

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  };
  return value.replace(/[&<>"']/g, (character) => replacements[character] ?? character);
}

type ReportSegment =
  | { type: "text"; content: string }
  | { type: "code"; content: string; language: string };

const syntaxTokenPattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|\b(?:async|await|break|case|catch|class|const|continue|def|do|else|enum|export|extends|false|False|finally|fn|for|from|function|if|import|in|interface|let|match|module|namespace|new|null|None|package|private|protected|public|return|self|static|struct|super|switch|this|throw|true|True|try|type|undefined|use|var|while|yield)\b|\b(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?)\b)/g;

function tokenClass(value: string): "comment" | "keyword" | "number" | "string" {
  if (value.startsWith("//") || value.startsWith("/*") || value.startsWith("#")) {
    return "comment";
  }
  if (value.startsWith("\"") || value.startsWith("'") || value.startsWith("`")) {
    return "string";
  }
  if (/^(?:0[xX][0-9a-fA-F]+|\d)/.test(value)) {
    return "number";
  }
  return "keyword";
}

function highlightCode(value: string): string {
  let output = "";
  let offset = 0;

  for (const match of value.matchAll(syntaxTokenPattern)) {
    const index = match.index;
    const token = match[0];
    output += escapeHtml(value.slice(offset, index));
    output += `<span class="token ${tokenClass(token)}">${escapeHtml(token)}</span>`;
    offset = index + token.length;
  }

  return output + escapeHtml(value.slice(offset));
}

function reportSegments(value: string): ReportSegment[] {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const segments: ReportSegment[] = [];
  let textLines: string[] = [];
  let codeLines: string[] | null = null;
  let openingFence = "";
  let language = "";

  const pushText = () => {
    if (textLines.length > 0) {
      segments.push({ type: "text", content: textLines.join("\n") });
      textLines = [];
    }
  };

  for (const line of lines) {
    if (codeLines === null) {
      const opening = line.match(/^\s{0,3}```\s*([a-z0-9_+#.-]+)?\s*$/i);
      if (opening) {
        pushText();
        codeLines = [];
        openingFence = line;
        language = opening[1] ?? "";
      } else {
        textLines.push(line);
      }
      continue;
    }

    if (/^\s{0,3}```\s*$/.test(line)) {
      segments.push({ type: "code", content: codeLines.join("\n"), language });
      codeLines = null;
      openingFence = "";
      language = "";
    } else {
      codeLines.push(line);
    }
  }

  if (codeLines !== null) {
    textLines.push(openingFence, ...codeLines);
  }
  pushText();

  return segments;
}

function reportHtml(value: string): string {
  return reportSegments(value).map((segment) => {
    if (segment.type === "text") {
      return `<pre class="report-text">${escapeHtml(segment.content)}</pre>`;
    }

    const label = segment.language ? `Code block (${segment.language})` : "Code block";
    return `<details class="code-section" open>
      <summary>${escapeHtml(label)}</summary>
      <pre class="code-block"><code>${highlightCode(segment.content)}</code></pre>
    </details>`;
  }).join("\n");
}

function htmlDocument(report: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>Code Critic report</title>
  <style>
    body { max-width: 900px; margin: 40px auto; padding: 0 20px; color: #202124; font-family: system-ui, sans-serif; }
    details { border: 1px solid #d8dadd; border-radius: 4px; }
    summary { cursor: pointer; padding: 10px 12px; font-weight: 600; }
    .report-body { padding: 0 12px 12px; }
    .report-text { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.5; }
    .code-section { margin: 12px 0; background: #f7f7f8; }
    .code-block { margin: 0; padding: 12px; overflow-x: auto; white-space: pre; color: #24292f; font: 14px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .token.comment { color: #5c6370; }
    .token.keyword { color: #7a3e9d; font-weight: 600; }
    .token.number { color: #986801; }
    .token.string { color: #0a6b3b; }
  </style>
</head>
<body>
  <main>
    <details open>
      <summary>Report</summary>
      <div class="report-body">
${reportHtml(report)}
      </div>
    </details>
  </main>
</body>
</html>
`;
}

function plainText(report: string): string {
  const output: string[] = [];
  let inCodeBlock = false;

  for (const sourceLine of report.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*```/.test(sourceLine)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      output.push(sourceLine);
      continue;
    }

    const trimmed = sourceLine.trim();
    if (/^([-*_]\s*){3,}$/.test(trimmed)) {
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
      if (cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
        continue;
      }
      if (cells.length > 1) {
        output.push(cells.join("    "));
        continue;
      }
    }

    const line = sourceLine
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s*>\s?/, "")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/`([^`\n]+)`/g, "$1");
    output.push(line);
  }

  while (output.at(-1)?.trim() === "") {
    output.pop();
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function createExportFile(
  report: string,
  analysisType: AnalysisType,
  format: ExportFormat
): ExportFile {
  const baseName = `${analysisType}-report`;

  if (format === "html") {
    return {
      content: htmlDocument(report),
      fileName: `${baseName}.html`,
      mimeType: "text/html;charset=utf-8"
    };
  }

  return {
    content: format === "txt" ? plainText(report) : report,
    fileName: `${baseName}.${format}`,
    mimeType: format === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8"
  };
}
