import assert from "node:assert/strict";
import test from "node:test";
import { DeepSeekClient, ReviewError, type DeepSeekConfig } from "./DeepSeekClient.js";

const config: DeepSeekConfig = {
  apiKey: "test-key",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  timeoutMs: 5000
};

const generation = {
  temperature: 0.3,
  max_tokens: 1500,
  top_p: 0.9
};

test("sends an authenticated JSON completion request", async () => {
  const captured: { body?: Record<string, unknown> } = {};

  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://api.deepseek.com/chat/completions");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-key");
    captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "{\"score\":90}" } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const client = new DeepSeekClient(config, fetcher);
  const content = await client.completeJson({ system: "Return JSON.", user: "Review code.", generation });

  assert.equal(content, "{\"score\":90}");
  assert.equal(captured.body?.model, "deepseek-v4-flash");
  assert.deepEqual(captured.body?.response_format, { type: "json_object" });
  assert.deepEqual(captured.body?.thinking, { type: "disabled" });
  assert.equal(captured.body?.temperature, 0.3);
  assert.equal(captured.body?.max_tokens, 1500);
  assert.equal(captured.body?.top_p, 0.9);
});

test("maps rate limits to a clear error", async () => {
  const fetcher: typeof fetch = async () => new Response(null, { status: 429 });
  const client = new DeepSeekClient(config, fetcher);

  await assert.rejects(
    () => client.completeJson({ system: "Return JSON.", user: "Review code.", generation }),
    (error: unknown) => error instanceof ReviewError && error.code === "provider_rate_limited" && error.status === 429
  );
});

test("rejects incomplete provider output", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ finish_reason: "length", message: { content: "{}" } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const client = new DeepSeekClient(config, fetcher);

  await assert.rejects(
    () => client.completeJson({ system: "Return JSON.", user: "Review code.", generation }),
    (error: unknown) => error instanceof ReviewError && error.code === "provider_output_incomplete"
  );
});

test("rejects missing provider configuration", () => {
  assert.throws(
    () => new DeepSeekClient({ ...config, apiKey: "" }),
    (error: unknown) => error instanceof ReviewError && error.code === "provider_not_configured"
  );
});
