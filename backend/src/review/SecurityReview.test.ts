import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedAnalysisInput } from "../input/types.js";
import type { JsonCompletionClient, JsonCompletionRequest } from "./DeepSeekClient.js";
import { parseSecurityReport, reviewSecurity } from "./SecurityReview.js";

function securityInput(): Extract<NormalizedAnalysisInput, { analysis_type: "security" }> {
  return {
    analysis_type: "security",
    code: {
      content: Array.from({ length: 100 }, (_, index) => index === 0 ? "def load_user():" : `    value_${index} = ${index}`).join("\n"),
      language: "python",
      line_count: 100,
      file_name: "users.py"
    },
    parameters: {
      security_framework: "owasp_top_10",
      severity_threshold: "medium",
      security_focus_areas: ["authentication", "injection"],
      threat_level: "high"
    },
    generation_params: {
      temperature: 0.3,
      max_tokens: 1500,
      top_p: 0.9
    }
  };
}

const validReport = JSON.stringify({
  risk_assessment: {
    level: "high",
    summary: "The input reaches a database query without validation."
  },
  vulnerabilities: [{
    title: "Unvalidated query input",
    severity: "high",
    category: "Injection",
    line_start: 20,
    line_end: 22,
    description: "User-controlled input may alter the query.",
    mitigation: "Use a parameterized query."
  }],
  mitigations: [{
    title: "Validate external input",
    description: "Validate input and use parameterized database calls."
  }]
});

test("builds a security request and parses the report", async () => {
  const captured: { request?: JsonCompletionRequest } = {};
  const client: JsonCompletionClient = {
    async completeJson(request) {
      captured.request = request;
      return validReport;
    }
  };

  const report = await reviewSecurity(securityInput(), client);

  assert.equal(report.analysis_type, "security");
  assert.equal(report.risk_assessment.level, "high");
  assert.equal(report.vulnerabilities[0]?.severity, "high");
  assert.match(captured.request?.system ?? "", /untrusted data/);
  assert.match(captured.request?.user ?? "", /Focus areas: authentication, injection/);
  assert.match(captured.request?.user ?? "", /Threat level: high/);
});

test("accepts an empty vulnerability list", () => {
  const report = parseSecurityReport(JSON.stringify({
    risk_assessment: { level: "low", summary: "No supported vulnerabilities were found." },
    vulnerabilities: [],
    mitigations: []
  }), 100);

  assert.equal(report.vulnerabilities.length, 0);
});

test("rejects a missing risk assessment", () => {
  assert.throws(
    () => parseSecurityReport(JSON.stringify({ vulnerabilities: [], mitigations: [] }), 100),
    /invalid security report/i
  );
});

test("rejects line references outside the submitted code", () => {
  const report = JSON.parse(validReport) as { vulnerabilities: Array<{ line_end: number }> };
  report.vulnerabilities[0]!.line_end = 101;

  assert.throws(() => parseSecurityReport(JSON.stringify(report), 100), /invalid security report/i);
});
