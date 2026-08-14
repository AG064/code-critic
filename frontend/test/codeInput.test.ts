import assert from "node:assert/strict";
import test from "node:test";
import { countCodeLines, MAX_FILE_BYTES, sourceFileError } from "../src/codeInput.ts";

function sourceLines(count: number, ending = "\n"): string {
  return Array.from({ length: count }, (_, index) => `const value${index} = ${index};`).join(ending);
}

test("counts pasted source at both accepted boundaries", () => {
  assert.equal(countCodeLines(sourceLines(100)), 100);
  assert.equal(countCodeLines(`${sourceLines(500, "\r\n")}\r\n`), 500);
});

test("checks uploaded source size and text content", () => {
  assert.equal(sourceFileError(MAX_FILE_BYTES, sourceLines(100)), null);
  assert.match(sourceFileError(MAX_FILE_BYTES + 1, sourceLines(100)) ?? "", /too large/i);
  assert.match(sourceFileError(20, `${sourceLines(100)}\u0000`) ?? "", /text source code/i);
});
