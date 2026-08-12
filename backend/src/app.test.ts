import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { Express } from "express";
import { createApp } from "./app.js";
import { ReviewError } from "./review/DeepSeekClient.js";
import type { QualityReport } from "./review/QualityReview.js";
import type { SecurityReport } from "./review/SecurityReview.js";

function pythonLines(count: number): string {
  return Array.from({ length: count }, (_, index) => index === 0 ? "def review_code():" : `    value_${index} = ${index}`).join("\n");
}

async function withServer(action: (baseUrl: string) => Promise<void>, app: Express = createApp()): Promise<void> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address() as AddressInfo;
    await action(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

const qualityReport: QualityReport = {
  analysis_type: "quality",
  score: 90,
  summary: "The code is consistent.",
  findings: [],
  recommendations: []
};

const securityReport: SecurityReport = {
  analysis_type: "security",
  risk_assessment: {
    level: "low",
    summary: "No supported vulnerabilities were found."
  },
  vulnerabilities: [],
  mitigations: []
};

test("normalization endpoint returns a stable input object", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/normalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analysis_type: "quality",
        code_input: pythonLines(100),
        file_name: "review.py"
      })
    });
    const body = await response.json() as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(typeof body.normalized_input, "object");
  });
});

test("normalization endpoint returns structured validation errors", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/normalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analysis_type: "quality",
        code_input: pythonLines(99),
        file_name: "review.py"
      })
    });
    const body = await response.json() as Record<string, unknown>;

    assert.equal(response.status, 400);
    assert.equal(body.code, "invalid_line_count");
    assert.equal(body.field, "code_input");
  });
});

test("normalization endpoint rejects malformed JSON", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/normalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{"
    });
    const body = await response.json() as Record<string, unknown>;

    assert.equal(response.status, 400);
    assert.equal(body.code, "invalid_json");
  });
});

test("normalization endpoint rejects oversized request bodies", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/normalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code_input: "x".repeat(620_000) })
    });
    const body = await response.json() as Record<string, unknown>;

    assert.equal(response.status, 413);
    assert.equal(body.code, "request_too_large");
  });
});

test("analysis endpoint returns a quality report", async () => {
  const app = createApp({ reviewQuality: async () => qualityReport });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analysis_type: "quality",
        code_input: pythonLines(100),
        file_name: "review.py"
      })
    });
    const body = await response.json() as { report?: QualityReport };

    assert.equal(response.status, 200);
    assert.equal(body.report?.score, 90);
  }, app);
});

test("analysis endpoint returns provider errors without internal details", async () => {
  const app = createApp({
    reviewQuality: async () => {
      throw new ReviewError("provider_rate_limited", 429, "DeepSeek rate limit reached. Try again shortly.");
    }
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analysis_type: "quality",
        code_input: pythonLines(100),
        file_name: "review.py"
      })
    });
    const body = await response.json() as Record<string, unknown>;

    assert.equal(response.status, 429);
    assert.equal(body.code, "provider_rate_limited");
    assert.equal("stack" in body, false);
  }, app);
});

test("analysis endpoint returns a security report", async () => {
  const app = createApp({ reviewSecurity: async () => securityReport });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analysis_type: "security",
        code_input: pythonLines(100),
        file_name: "review.py",
        parameters: {
          security_focus_areas: ["authentication", "injection"],
          threat_level: "high"
        }
      })
    });
    const body = await response.json() as { report?: SecurityReport };

    assert.equal(response.status, 200);
    assert.equal(body.report?.risk_assessment.level, "low");
  }, app);
});
