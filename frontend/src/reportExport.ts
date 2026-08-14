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
    "",
    "## Summary",
    "",
    report.summary,
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

function htmlDocument(report: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <title>Code Critic report</title>
  <style>
    body { max-width: 900px; margin: 40px auto; padding: 0 20px; color: #202124; font-family: system-ui, sans-serif; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.5; }
  </style>
</head>
<body>
<pre>${escapeHtml(report)}</pre>
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
