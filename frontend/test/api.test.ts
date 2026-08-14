import assert from "node:assert/strict";
import test from "node:test";

import { analyzeQuality, analyzeSecurity, ApiError } from "../src/api.ts";
import type { AnalysisRequest } from "../src/domain.ts";

(globalThis as typeof globalThis & { window: typeof globalThis }).window = globalThis;

const code = Array.from({ length: 100 }, (_, index) => `const value${index} = ${index};`).join("\n");

const qualityPayload: Extract<AnalysisRequest, { analysis_type: "quality" }> = {
  analysis_type: "quality",
  code_input: code,
  parameters: {
    strictness_level: "medium",
    naming_conventions: "language_default",
    code_organization: "any"
  }
};

const securityPayload: Extract<AnalysisRequest, { analysis_type: "security" }> = {
  analysis_type: "security",
  code_input: code,
  parameters: {
    security_framework: "general",
    severity_threshold: "low",
    security_focus_areas: ["injection"],
    threat_level: "medium"
  }
};

function qualityResponse() {
  return {
    normalized_input: {
      analysis_type: "quality",
      code: {
        content: code,
        language: "javascript",
        line_count: 100,
        file_name: "pasted-code",
        complexity: "standard"
      },
      parameters: qualityPayload.parameters,
      generation_params: { temperature: 0.3, max_tokens: 1500, top_p: 0.9 }
    },
    report: {
      analysis_type: "quality",
      score: 80,
      readability_score: 75,
      complexity_metrics: {
        complexity_score: 20,
        level: "low",
        summary: "The control flow is direct."
      },
      summary: "The code is readable.",
      findings: [{
        title: "Repeated declarations",
        severity: "low",
        line_start: 1,
        line_end: 100,
        description: "The declarations follow the same pattern."
      }],
      best_practice_violations: [],
      recommendations: [{
        title: "Group related values",
        description: "Store the values in an array when they are processed together."
      }]
    }
  };
}

function securityResponse() {
  return {
    normalized_input: {
      analysis_type: "security",
      code: {
        content: code,
        language: "javascript",
        line_count: 100,
        file_name: "pasted-code",
        complexity: "standard"
      },
      parameters: securityPayload.parameters,
      generation_params: { temperature: 0.2, max_tokens: 1700, top_p: 0.85 }
    },
    report: {
      analysis_type: "security",
      risk_assessment: {
        level: "low",
        summary: "No high-risk behavior is present."
      },
      vulnerabilities: [],
      mitigations: []
    }
  };
}

function returnJson(body: unknown): void {
  globalThis.fetch = async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function isInvalidResponse(error: unknown): boolean {
  return error instanceof ApiError && error.code === "invalid_response";
}

test("accepts matching Quality and Security responses", async () => {
  returnJson(qualityResponse());
  const quality = await analyzeQuality(qualityPayload);
  assert.equal(quality.report.score, 80);

  returnJson(securityResponse());
  const security = await analyzeSecurity(securityPayload);
  assert.equal(security.report.risk_assessment.level, "low");
});

test("rejects a report paired with the wrong normalized analysis type", async () => {
  const response = qualityResponse();
  response.normalized_input.analysis_type = "security";
  response.normalized_input.parameters = securityPayload.parameters;
  returnJson(response);

  await assert.rejects(analyzeQuality(qualityPayload), isInvalidResponse);
});

test("rejects report line references outside the normalized source", async () => {
  const response = qualityResponse();
  response.report.findings[0].line_end = 101;
  returnJson(response);

  await assert.rejects(analyzeQuality(qualityPayload), isInvalidResponse);
});

test("rejects contradictory complexity metrics and blank report text", async () => {
  const response = qualityResponse();
  response.report.complexity_metrics.level = "high";
  response.report.summary = " ";
  returnJson(response);

  await assert.rejects(analyzeQuality(qualityPayload), isInvalidResponse);
});

test("rejects Quality issues without an overall recommendation", async () => {
  const response = qualityResponse();
  response.report.recommendations = [];
  returnJson(response);

  await assert.rejects(analyzeQuality(qualityPayload), isInvalidResponse);
});

test("rejects Security line references outside the normalized source", async () => {
  const response = securityResponse();
  response.report.vulnerabilities = [{
    title: "Out-of-range finding",
    severity: "high",
    category: "injection",
    line_start: 100,
    line_end: 101,
    description: "The line range exceeds the source.",
    mitigation: "Use a valid source reference."
  }];
  returnJson(response);

  await assert.rejects(analyzeSecurity(securityPayload), isInvalidResponse);
});
