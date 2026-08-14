import assert from "node:assert/strict";
import test from "node:test";
import { detectLanguage, normalizeLanguageHint } from "./LanguageDetector.js";

test("uses a supported file extension when present", () => {
  assert.equal(detectLanguage("class Review {}", "Review.java"), "java");
  assert.equal(detectLanguage("const value = 1;", "review.tsx"), "typescript");
});
test("detects common languages from content", () => {
  assert.equal(detectLanguage("def review_code():\n    return True", "pasted-code"), "python");
  assert.equal(detectLanguage("package main\nfunc main() {}", "pasted-code"), "go");
  assert.equal(detectLanguage("<?php\n$value = 1;", "pasted-code"), "php");
  assert.equal(detectLanguage("SELECT id FROM reports;", "pasted-code"), "sql");
});

test("does not classify a JavaScript object as CSS", () => {
  const code = "const palette = {\n  color: \"red\"\n};\nconsole.log(palette);";
  assert.equal(detectLanguage(code, "pasted-code"), "javascript");
});

test("detects minimal Java and JavaScript without a file name", () => {
  assert.equal(detectLanguage("public class Review {}", "pasted-code"), "java");
  assert.equal(detectLanguage("const ready = true;", "pasted-code"), "javascript");
});

test("uses the file type for mixed HTML and JavaScript", () => {
  const code = "<html><body><script>const ready = true;</script></body></html>";
  assert.equal(detectLanguage(code, "review.html"), "html");
});

test("returns null for unknown content", () => {
  assert.equal(detectLanguage("plain words only", "pasted-code"), null);
});

test("normalizes supported aliases", () => {
  assert.equal(normalizeLanguageHint("C++"), "cpp");
  assert.equal(normalizeLanguageHint(" Type Script "), "typescript");
  assert.equal(normalizeLanguageHint("unknown"), null);
});
