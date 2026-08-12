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
      file_name: "review.py"
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
  summary: "The code is readable but repetitive.",
  findings: [{
    title: "Repeated assignments",
    severity: "medium",
    line_start: 2,
    line_end: 100,
    description: "The assignments repeat the same operation."
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
  assert.equal(report.findings[0]?.line_start, 2);
  assert.match(captured.request?.system ?? "", /Return one JSON object/);
  assert.match(captured.request?.system ?? "", /untrusted data/);
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

test("rejects line references outside the submitted code", () => {
  const report = JSON.parse(validReport) as { findings: Array<{ line_end: number }> };
  report.findings[0]!.line_end = 101;

  assert.throws(() => parseQualityReport(JSON.stringify(report), 100), /invalid quality report/i);
});
