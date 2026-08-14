import assert from "node:assert/strict";
import test from "node:test";
import { ReviewError, type JsonCompletionClient, type JsonCompletionRequest } from "./DeepSeekClient.js";
import { runReview } from "./ReviewRunner.js";

const request = {
  system: "Return JSON.",
  user: "Review the supplied code.",
  generation: { temperature: 0.3, max_tokens: 1500, top_p: 0.9 }
};

function parse(raw: string): { valid: boolean } {
  const value = JSON.parse(raw) as { valid?: unknown };
  if (value.valid !== true) {
    throw new ReviewError("malformed_report", 502, "Invalid report.");
  }
  return { valid: true };
}

test("returns a valid first report without a repair request", async () => {
  const calls: JsonCompletionRequest[] = [];
  const client: JsonCompletionClient = {
    async completeJson(value) {
      calls.push(value);
      return '{"valid":true}';
    }
  };

  const report = await runReview(client, request, parse);

  assert.equal(report.valid, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.timeoutMs, 35_000);
});

test("repairs one malformed report and treats it as untrusted", async () => {
  const calls: JsonCompletionRequest[] = [];
  const responses = ['{"valid":false}', '{"valid":true}'];
  const client: JsonCompletionClient = {
    async completeJson(value) {
      calls.push(value);
      return responses[calls.length - 1] ?? "";
    }
  };

  const report = await runReview(client, request, parse);

  assert.equal(report.valid, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.timeoutMs, 18_000);
  assert.match(calls[1]?.user ?? "", /untrusted data/);
  assert.match(calls[1]?.user ?? "", /\{"valid":false\}/);
});

test("regenerates once after incomplete provider output", async () => {
  let calls = 0;
  const client: JsonCompletionClient = {
    async completeJson(value) {
      calls += 1;
      if (calls === 1) {
        throw new ReviewError("provider_output_incomplete", 502, "Incomplete report.");
      }
      assert.match(value.user, /previous response was incomplete/i);
      assert.doesNotMatch(value.user, /PREVIOUS RESPONSE START/);
      return '{"valid":true}';
    }
  };

  await runReview(client, request, parse);
  assert.equal(calls, 2);
});

test("stops after a failed repair", async () => {
  let calls = 0;
  const client: JsonCompletionClient = {
    async completeJson() {
      calls += 1;
      return '{"valid":false}';
    }
  };

  await assert.rejects(
    () => runReview(client, request, parse),
    (error: unknown) => error instanceof ReviewError
      && error.code === "report_repair_failed"
      && /required sections and metrics/i.test(error.message)
  );
  assert.equal(calls, 2);
});

test("does not retry provider errors", async () => {
  let calls = 0;
  const client: JsonCompletionClient = {
    async completeJson() {
      calls += 1;
      throw new ReviewError("provider_rate_limited", 429, "Rate limited.");
    }
  };

  await assert.rejects(
    () => runReview(client, request, parse),
    (error: unknown) => error instanceof ReviewError && error.code === "provider_rate_limited"
  );
  assert.equal(calls, 1);
});
