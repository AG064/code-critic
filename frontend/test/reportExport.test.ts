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
    file_name: "sample.ts",
    complexity: "standard"
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
    readability_score: 78,
    complexity_metrics: {
      complexity_score: 42,
      level: "medium",
      summary: "The repeated branch adds moderate complexity."
    },
    summary: "Clear structure with one repeated branch.",
    findings: [{
      title: "Repeated branch",
      severity: "medium",
      line_start: 12,
      line_end: 18,
      description: "Keep this table and example:\n\n| Case | Result |\n| --- | --- |\n| A | B |\n\n```ts\nrun();\n```"
    }],
    best_practice_violations: [{
      title: "Repeated control flow",
      severity: "medium",
      line_start: 12,
      line_end: 18,
      description: "The same branch is repeated.",
      recommendation: "Extract the shared branch into one function."
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
  assert.match(result, /Readability: 78\/100/);
  assert.match(result, /Complexity: 42\/100 \(medium\)/);
  assert.match(result, /## Best-practice violations/);
  assert.match(result, /Lines 12-18/);
  assert.match(result, /\| Case \| Result \|/);
  assert.match(result, /```ts\nrun\(\);\n```/);
  assert.match(result, /## Recommendations/);
});

test("includes empty sections in a Security report", () => {
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

test("exports highlighted fenced code with native interactive controls", () => {
  const payload = [
    "# Review",
    "",
    "Täpne ülevaade.",
    "",
    "```javascript",
    "const answer = 42;",
    "const label = \"safe\";",
    "// checked",
    "```"
  ].join("\n");
  const result = createExportFile(payload, "quality", "html");

  assert.match(result.content, /<details open>/);
  assert.match(result.content, /<summary>Report<\/summary>/);
  assert.match(result.content, /<summary>Code block \(javascript\)<\/summary>/);
  assert.match(result.content, /<span class="token keyword">const<\/span>/);
  assert.match(result.content, /<span class="token number">42<\/span>/);
  assert.match(result.content, /<span class="token string">&quot;safe&quot;<\/span>/);
  assert.match(result.content, /<span class="token comment">\/\/ checked<\/span>/);
  assert.match(result.content, /Täpne ülevaade\./);
  assert.doesNotMatch(result.content, /```javascript/);
});

test("escapes malicious text and code in a standalone HTML export", () => {
  const payload = [
    "</pre></details><script>alert(\"text\")</script>&'",
    "```html",
    "</code></pre><script>alert(\"code\")</script>",
    "```"
  ].join("\n");
  const result = createExportFile(payload, "security", "html");

  assert.equal(result.fileName, "security-report.html");
  assert.equal(result.mimeType, "text/html;charset=utf-8");
  assert.match(result.content, /^<!doctype html>/);
  assert.match(result.content, /default-src 'none'/);
  assert.match(result.content, /object-src 'none'/);
  assert.match(result.content, /&lt;\/pre&gt;&lt;\/details&gt;&lt;script&gt;alert\(&quot;text&quot;\)&lt;\/script&gt;&amp;&#39;/);
  assert.match(result.content, /&lt;\/code&gt;&lt;\/pre&gt;&lt;script&gt;alert\(<span class="token string">&quot;code&quot;<\/span>\)&lt;\/script&gt;/);
  assert.doesNotMatch(result.content, /<script[ >]/i);
  assert.doesNotMatch(result.content, /<link[ >]|<iframe[ >]|<object[ >]/i);
});
