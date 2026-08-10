import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "./app.js";

function pythonLines(count: number): string {
  return Array.from({ length: count }, (_, index) => index === 0 ? "def review_code():" : `    value_${index} = ${index}`).join("\n");
}

async function withServer(action: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createApp().listen(0, "127.0.0.1");
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
