import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("maps authentication failures to a clear error", async () => {
  const fetcher: typeof fetch = async () => new Response(null, { status: 401 });
  const client = new DeepSeekClient(config, fetcher);

  await assert.rejects(
    () => client.completeJson({ system: "Return JSON.", user: "Review code.", generation }),
    (error: unknown) => error instanceof ReviewError
      && error.code === "provider_authentication_failed"
      && error.status === 503
  );
});

test("maps provider outages to a clear error", async () => {
  const fetcher: typeof fetch = async () => new Response(null, { status: 503 });
  const client = new DeepSeekClient(config, fetcher);

  await assert.rejects(
    () => client.completeJson({ system: "Return JSON.", user: "Review code.", generation }),
    (error: unknown) => error instanceof ReviewError
      && error.code === "provider_unavailable"
      && error.status === 503
  );
});

test("rejects malformed provider JSON", async () => {
  const fetcher: typeof fetch = async () => new Response("not JSON", {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
  const client = new DeepSeekClient(config, fetcher);

  await assert.rejects(
    () => client.completeJson({ system: "Return JSON.", user: "Review code.", generation }),
    (error: unknown) => error instanceof ReviewError && error.code === "provider_invalid_response"
  );
});

test("rejects empty provider output", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: "   " } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const client = new DeepSeekClient(config, fetcher);

  await assert.rejects(
    () => client.completeJson({ system: "Return JSON.", user: "Review code.", generation }),
    (error: unknown) => error instanceof ReviewError && error.code === "provider_invalid_response"
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

test("uses a lower timeout for a bounded request", async () => {
  const fetcher: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  const client = new DeepSeekClient(config, fetcher);

  await assert.rejects(
    () => client.completeJson({ system: "Return JSON.", user: "Review code.", generation, timeoutMs: 10 }),
    (error: unknown) => error instanceof ReviewError && error.code === "provider_timeout"
  );
});

test("rejects missing provider configuration", () => {
  assert.throws(
    () => new DeepSeekClient({ ...config, apiKey: "" }),
    (error: unknown) => error instanceof ReviewError && error.code === "provider_not_configured"
  );
});

test("uses a file-backed key before the environment key", async () => {
  const directory = mkdtempSync(join(tmpdir(), "code-critic-"));
  const keyFile = join(directory, "deepseek-key");
  const previousFile = process.env.DEEPSEEK_API_KEY_FILE;
  const previousKey = process.env.DEEPSEEK_API_KEY;
  writeFileSync(keyFile, "DEEPSEEK_API_KEY='file-key'\nDEEPSEEK_MODEL=ignored\n", "utf8");
  process.env.DEEPSEEK_API_KEY_FILE = keyFile;
  process.env.DEEPSEEK_API_KEY = "environment-key";

  try {
    const fetcher: typeof fetch = async (_input, init) => {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer file-key");
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "{}" } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const client = new DeepSeekClient(undefined, fetcher);
    await client.completeJson({ system: "Return JSON.", user: "Review code.", generation });
  } finally {
    if (previousFile === undefined) delete process.env.DEEPSEEK_API_KEY_FILE;
    else process.env.DEEPSEEK_API_KEY_FILE = previousFile;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fails closed when a configured key file cannot be read", () => {
  const previousFile = process.env.DEEPSEEK_API_KEY_FILE;
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY_FILE = join(tmpdir(), "missing-code-critic-key");
  process.env.DEEPSEEK_API_KEY = "environment-key";

  try {
    assert.throws(
      () => new DeepSeekClient(),
      (error: unknown) => error instanceof ReviewError
        && error.code === "provider_not_configured"
        && !error.message.includes("missing-code-critic-key")
    );
  } finally {
    if (previousFile === undefined) delete process.env.DEEPSEEK_API_KEY_FILE;
    else process.env.DEEPSEEK_API_KEY_FILE = previousFile;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});
