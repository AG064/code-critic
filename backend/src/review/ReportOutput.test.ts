import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInlineText, normalizeReportText, parseReportJson } from "./ReportOutput.js";

test("extracts one JSON object from common response artifacts", () => {
  const parsed = parseReportJson("\ufeffHere is the JSON response:\r\n```json\r\n{\"score\": 90}\r\n```\r\nEnd of response.") as { score?: number };
  assert.equal(parsed.score, 90);
});

test("rejects more than one JSON object", () => {
  assert.throws(() => parseReportJson('{"score": 80}\n{"score": 90}'), /one JSON object/i);
});

test("normalizes text without flattening code blocks or tables", () => {
  const value = "\ufeffLines 12-14 use `user_id`.\r\n\r\n\r\n| Item|Expression |\r\n|---|---|\r\n| Mask | `left | right` |\r\n\r\n``` javascript\r\nconst mask = left | right;  \r\n\r\nreturn mask;\r\n```\u0007";

  assert.equal(normalizeReportText(value), [
    "Lines 12-14 use `user_id`.",
    "",
    "| Item | Expression |",
    "| --- | --- |",
    "| Mask | `left | right` |",
    "",
    "```javascript",
    "const mask = left | right;  ",
    "",
    "return mask;",
    "```"
  ].join("\n"));
});

test("normalizes short labels to one line", () => {
  assert.equal(normalizeInlineText("  Unsafe\r\n  query  "), "Unsafe query");
});
