import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedInput, QualityReport, SecurityReport } from "../src/domain.ts";
import { createEditableReport, createExportFile } from "../src/reportExport.ts";

const qualityInput: NormalizedInput = {
  analysis_type: "quality",
  code: {
    content: "const value = 1;\n".repeat(100).trimEnd(),
    language: "typescript",
    line_count: 100,
    file_name: "sample.ts"
  },
  parameters: {
    strictness_level: "medium",
    naming_conventions: "language_default",
    code_organization: "modular"
  },
  generation_params: {
    temperature: 0.3,
    max_tokens: 1500,
    top_p: 0.9
  }
};

test("creates an editable Quality report", () => {
  const report: QualityReport = {
    analysis_type: "quality",
    score: 82,
    summary: "Clear structure with one repeated branch.",
    findings: [{
      title: "Repeated branch",
      severity: "medium",
      line_start: 12,
      line_end: 18,
      description: "Keep this table and example:\n\n| Case | Result |\n| --- | --- |\n| A | B |\n\n```ts\nrun();\n```"
    }],
    recommendations: [{
      title: "Extract the branch",
      description: "Move the shared work into one function."
    }]
  };

  const result = createEditableReport(qualityInput, report);

  assert.match(result, /^# Quality report/);
  assert.match(result, /File: sample\.ts/);
  assert.match(result, /Score: 82\/100/);
  assert.match(result, /Lines 12-18/);
  assert.match(result, /\| Case \| Result \|/);
  assert.match(result, /```ts\nrun\(\);\n```/);
  assert.match(result, /## Recommendations/);
});

test("creates an empty Security report without placeholder sections missing", () => {
  const input: NormalizedInput = {
    ...qualityInput,
    analysis_type: "security",
    parameters: {
      security_framework: "general",
      severity_threshold: "medium",
      security_focus_areas: ["injection"],
      threat_level: "medium"
    }
  };
  const report: SecurityReport = {
    analysis_type: "security",
    risk_assessment: {
      level: "low",
      summary: "No material issue was found. Täpne ülevaade."
    },
    vulnerabilities: [],
    mitigations: []
  };

  const result = createEditableReport(input, report);

  assert.match(result, /^# Security report/);
  assert.match(result, /Risk: low/);
  assert.match(result, /No vulnerabilities found\./);
  assert.match(result, /No additional mitigations\./);
  assert.match(result, /Täpne ülevaade/);
});

test("exports the current edit as readable plain text and exact Markdown", () => {
  const edited = [
    "# Changed by reviewer",
    "",
    "**Approved** after `manual review`.",
    "",
    "| Check | Result |",
    "| --- | --- |",
    "| Syntax | Ready |",
    "",
    "```ts",
    "run();",
    "```"
  ].join("\n");
  const plain = createExportFile(edited, "quality", "txt");
  const markdown = createExportFile(edited, "quality", "md");

  assert.deepEqual(plain, {
    content: "Changed by reviewer\n\nApproved after manual review.\n\nCheck    Result\nSyntax    Ready\n\nrun();",
    fileName: "quality-report.txt",
    mimeType: "text/plain;charset=utf-8"
  });
  assert.deepEqual(markdown, {
    content: edited,
    fileName: "quality-report.md",
    mimeType: "text/markdown;charset=utf-8"
  });
});

test("escapes edited text in a standalone HTML export", () => {
  const payload = "</pre><script>alert(\"x\")</script>&'";
  const result = createExportFile(payload, "security", "html");

  assert.equal(result.fileName, "security-report.html");
  assert.equal(result.mimeType, "text/html;charset=utf-8");
  assert.match(result.content, /^<!doctype html>/);
  assert.match(result.content, /Content-Security-Policy/);
  assert.match(result.content, /&lt;\/pre&gt;&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;&amp;&#39;/);
  assert.doesNotMatch(result.content, /<script>/);
  assert.doesNotMatch(result.content, /<\/pre><script>/);
});
