import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedAnalysisInput } from "../input/types.js";
import type { JsonCompletionClient, JsonCompletionRequest } from "./DeepSeekClient.js";
import { parseQualityReport, reviewQuality } from "./QualityReview.js";

function qualityInput(): Extract<NormalizedAnalysisInput, { analysis_type: "quality" }> {
  return {
    analysis_type: "quality",
    code: {
      content: Array.from({ length: 100 }, (_, index) => index === 0 ? "def review_code():" : `    value_${index} = ${index}`).join("\n"),
      language: "python",
      line_count: 100,
      file_name: "review.py",
      complexity: "standard"
    },
    parameters: {
      strictness_level: "high",
      naming_conventions: "snake_case",
      code_organization: "modular"
    },
    generation_params: {
      temperature: 0.3,
      max_tokens: 1500,
      top_p: 0.9
    }
  };
}

const validReport = JSON.stringify({
  score: 82,
  readability_score: 76,
  complexity_metrics: {
    complexity_score: 68,
    level: "high",
    summary: "The repeated assignments make the function difficult to maintain."
  },
  summary: "The code is readable but repetitive.",
  findings: [{
    title: "Repeated assignments",
    severity: "medium",
    line_start: 2,
    line_end: 100,
    description: "The assignments repeat the same operation."
  }],
  best_practice_violations: [{
    title: "Repeated statements",
    severity: "medium",
    line_start: 2,
    line_end: 100,
    description: "The function repeats one statement instead of expressing the operation once.",
    recommendation: "Use a loop to perform the repeated assignment."
  }],
  recommendations: [{
    title: "Use a loop",
    description: "Generate the values in one loop."
  }]
});

test("builds a quality request and parses the report", async () => {
  const captured: { request?: JsonCompletionRequest } = {};
  const client: JsonCompletionClient = {
    async completeJson(request) {
      captured.request = request;
      return validReport;
    }
  };

  const report = await reviewQuality(qualityInput(), client);

  assert.equal(report.analysis_type, "quality");
  assert.equal(report.score, 82);
  assert.equal(report.readability_score, 76);
  assert.equal(report.complexity_metrics.complexity_score, 68);
  assert.equal(report.complexity_metrics.level, "high");
  assert.equal(report.findings[0]?.line_start, 2);
  assert.equal(report.best_practice_violations[0]?.line_end, 100);
  assert.match(captured.request?.system ?? "", /Return one JSON object/);
  assert.match(captured.request?.system ?? "", /untrusted data/);
  assert.match(captured.request?.system ?? "", /low for scores from 0 to 33/);
  assert.match(captured.request?.system ?? "", /include at least one recommendation/);
  assert.match(captured.request?.system ?? "", /address the reported issues with specific changes/);
  assert.match(captured.request?.user ?? "", /Strictness: high/);
  assert.match(captured.request?.user ?? "", /100 \|     value_99 = 99/);
});

test("accepts a JSON report wrapped in a code fence", () => {
  const report = parseQualityReport(`\`\`\`json\n${validReport}\n\`\`\``, 100);
  assert.equal(report.score, 82);
});

test("rejects a report with a missing required section", () => {
  assert.throws(
    () => parseQualityReport(JSON.stringify({ score: 80, summary: "Good", findings: [] }), 100),
    /invalid quality report/i
  );
});

test("rejects missing quality metrics and best-practice violations", () => {
  const report = JSON.parse(validReport) as Record<string, unknown>;
  delete report.readability_score;

  assert.throws(() => parseQualityReport(JSON.stringify(report), 100), /invalid quality report/i);

  const withoutComplexity = JSON.parse(validReport) as Record<string, unknown>;
  delete withoutComplexity.complexity_metrics;

  assert.throws(() => parseQualityReport(JSON.stringify(withoutComplexity), 100), /invalid quality report/i);

  const withoutViolations = JSON.parse(validReport) as Record<string, unknown>;
  delete withoutViolations.best_practice_violations;

  assert.throws(() => parseQualityReport(JSON.stringify(withoutViolations), 100), /invalid quality report/i);
});

test("rejects invalid readability and complexity metrics", () => {
  const invalidReadability = JSON.parse(validReport) as { readability_score: number };
  invalidReadability.readability_score = 101;

  assert.throws(() => parseQualityReport(JSON.stringify(invalidReadability), 100), /invalid quality report/i);

  const invalidComplexity = JSON.parse(validReport) as {
    complexity_metrics: { complexity_score: number; level: string };
  };
  invalidComplexity.complexity_metrics.complexity_score = -1;

  assert.throws(() => parseQualityReport(JSON.stringify(invalidComplexity), 100), /invalid quality report/i);

  invalidComplexity.complexity_metrics.complexity_score = 50;
  invalidComplexity.complexity_metrics.level = "critical";

  assert.throws(() => parseQualityReport(JSON.stringify(invalidComplexity), 100), /invalid quality report/i);

  const inconsistentComplexity = JSON.parse(validReport) as {
    complexity_metrics: { complexity_score: number; level: string };
  };
  inconsistentComplexity.complexity_metrics.complexity_score = 20;
  inconsistentComplexity.complexity_metrics.level = "high";

  assert.throws(() => parseQualityReport(JSON.stringify(inconsistentComplexity), 100), /invalid quality report/i);
});

test("rejects an invalid best-practice violation", () => {
  const report = JSON.parse(validReport) as {
    best_practice_violations: Array<{ line_start: number; line_end: number }>;
  };
  report.best_practice_violations[0]!.line_start = 80;
  report.best_practice_violations[0]!.line_end = 20;

  assert.throws(() => parseQualityReport(JSON.stringify(report), 100), /invalid quality report/i);
});

test("requires an actionable recommendation when issues are present", () => {
  const report = JSON.parse(validReport) as { recommendations: unknown[] };
  report.recommendations = [];

  assert.throws(() => parseQualityReport(JSON.stringify(report), 100), /invalid quality report/i);
});

test("rejects line references outside the submitted code", () => {
  const report = JSON.parse(validReport) as { findings: Array<{ line_end: number }> };
  report.findings[0]!.line_end = 101;

  assert.throws(() => parseQualityReport(JSON.stringify(report), 100), /invalid quality report/i);
});

test("repairs one malformed quality report", async () => {
  let calls = 0;
  const client: JsonCompletionClient = {
    async completeJson() {
      calls += 1;
      return calls === 1 ? "{}" : validReport;
    }
  };

  const report = await reviewQuality(qualityInput(), client);

  assert.equal(report.score, 82);
  assert.equal(calls, 2);
});
