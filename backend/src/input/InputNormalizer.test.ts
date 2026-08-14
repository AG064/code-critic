import assert from "node:assert/strict";
import test from "node:test";
import { InputValidationError, MAX_CODE_CHARACTERS, normalizeAnalysisInput } from "./InputNormalizer.js";

function pythonLines(count: number, lineEnding = "\n"): string {
  return Array.from({ length: count }, (_, index) => index === 0 ? "def review_code():" : `    value_${index} = ${index}`).join(lineEnding);
}

function expectValidationError(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => error instanceof InputValidationError && error.code === code);
}

test("normalizes a quality request with stable defaults", () => {
  const result = normalizeAnalysisInput({
    analysis_type: "quality",
    code_input: pythonLines(100),
    file_name: "src/review.py"
  });

  assert.equal(result.analysis_type, "quality");
  assert.deepEqual(result.code, {
    content: pythonLines(100),
    language: "python",
    line_count: 100,
    file_name: "review.py",
    complexity: "standard"
  });
  assert.deepEqual(result.parameters, {
    strictness_level: "medium",
    naming_conventions: "language_default",
    code_organization: "modular"
  });
  assert.deepEqual(result.generation_params, {
    temperature: 0.3,
    max_tokens: 1500,
    top_p: 0.9
  });
});
test("normalizes CRLF line endings and ignores one terminal newline", () => {
  const result = normalizeAnalysisInput({
    analysis_type: "quality",
    code_input: `\uFEFF${pythonLines(100, "\r\n")}\r\n`,
    file_name: "review.py"
  });

  assert.equal(result.code.line_count, 100);
  assert.equal(result.code.content.startsWith("def review_code():"), true);
  assert.equal(result.code.content.includes("\r"), false);
  assert.equal(result.code.content.endsWith("\n"), true);
});

test("accepts the maximum line count", () => {
  const result = normalizeAnalysisInput({
    analysis_type: "quality",
    code_input: pythonLines(500),
    file_name: "review.py"
  });

  assert.equal(result.code.line_count, 500);
});

test("normalizes security parameters and removes duplicate focus areas", () => {
  const result = normalizeAnalysisInput({
    analysis_type: "security",
    code_input: pythonLines(100),
    file_name: "review.py",
    parameters: {
      security_framework: "owasp_top_10",
      severity_threshold: "high",
      vulnerability_categories: ["injection", "authentication", "injection"],
      threat_level: "high"
    }
  });

  assert.equal(result.analysis_type, "security");
  assert.deepEqual(result.parameters, {
    security_framework: "owasp_top_10",
    severity_threshold: "high",
    security_focus_areas: ["injection", "authentication"],
    threat_level: "high"
  });
  assert.deepEqual(result.generation_params, {
    temperature: 0.2,
    max_tokens: 1700,
    top_p: 0.85
  });
});

test("uses the control-flow boundary for a complex Quality profile", () => {
  const standardCode = Array.from({ length: 100 }, (_, index) => index < 19 ? `if value_${index}:` : `value_${index} = ${index}`).join("\n");
  const complexCode = Array.from({ length: 100 }, (_, index) => index < 20 ? `if value_${index}:` : `value_${index} = ${index}`).join("\n");
  const standard = normalizeAnalysisInput({
    analysis_type: "quality",
    code_input: standardCode,
    file_name: "review.py"
  });
  const complex = normalizeAnalysisInput({
    analysis_type: "quality",
    code_input: complexCode,
    file_name: "review.py"
  });

  assert.equal(standard.code.complexity, "standard");
  assert.equal(complex.code.complexity, "complex");
  assert.deepEqual(complex.generation_params, {
    temperature: 0.25,
    max_tokens: 1900,
    top_p: 0.9
  });
});

test("ignores control-flow words in comments and strings", () => {
  const code = Array.from({ length: 100 }, (_, index) => index < 20
    ? `const label_${index} = "if for while"; // if switch case`
    : `const value_${index} = ${index};`).join("\n");
  const result = normalizeAnalysisInput({
    analysis_type: "quality",
    code_input: code,
    file_name: "review.js"
  });

  assert.equal(result.code.complexity, "standard");
});

test("matches control-flow signals without case sensitivity", () => {
  const code = Array.from({ length: 100 }, (_, index) => index < 20 ? `IF ready_${index} THEN` : `SELECT ${index};`).join("\n");
  const result = normalizeAnalysisInput({
    analysis_type: "quality",
    code_input: code,
    file_name: "review.sql"
  });

  assert.equal(result.code.complexity, "complex");
});

test("uses the line boundary and Security complex profile", () => {
  const standard = normalizeAnalysisInput({
    analysis_type: "security",
    code_input: pythonLines(300),
    file_name: "review.py"
  });
  const complex = normalizeAnalysisInput({
    analysis_type: "security",
    code_input: pythonLines(301),
    file_name: "review.py"
  });

  assert.equal(standard.code.complexity, "standard");
  assert.equal(complex.code.complexity, "complex");
  assert.deepEqual(complex.generation_params, {
    temperature: 0.15,
    max_tokens: 2200,
    top_p: 0.85
  });
});

test("detects pasted JavaScript without a file name", () => {
  const code = Array.from({ length: 100 }, (_, index) => `const value${index} = () => console.log(${index});`).join("\n");
  const result = normalizeAnalysisInput({ analysis_type: "quality", code_input: code });
  assert.equal(result.code.language, "javascript");
  assert.equal(result.code.file_name, "pasted-code");
});

test("rejects unsupported analysis types", () => {
  expectValidationError(
    () => normalizeAnalysisInput({ analysis_type: "performance", code_input: pythonLines(100), file_name: "review.py" }),
    "unsupported_analysis_type"
  );
});

test("rejects empty code", () => {
  expectValidationError(() => normalizeAnalysisInput({ analysis_type: "quality", code_input: "  " }), "empty_code");
});

test("rejects code below the line limit", () => {
  expectValidationError(
    () => normalizeAnalysisInput({ analysis_type: "quality", code_input: pythonLines(99), file_name: "review.py" }),
    "invalid_line_count"
  );
});

test("rejects code above the line limit", () => {
  expectValidationError(
    () => normalizeAnalysisInput({ analysis_type: "quality", code_input: pythonLines(501), file_name: "review.py" }),
    "invalid_line_count"
  );
});

test("rejects an unsupported language hint", () => {
  expectValidationError(
    () => normalizeAnalysisInput({ analysis_type: "quality", code_input: pythonLines(100), file_name: "review.py", language: "brainfuck" }),
    "unsupported_language"
  );
});

test("rejects code whose language cannot be detected", () => {
  const code = Array.from({ length: 100 }, (_, index) => `plain line ${index}`).join("\n");
  expectValidationError(() => normalizeAnalysisInput({ analysis_type: "quality", code_input: code }), "unsupported_language");
});

test("rejects invalid generation parameters", () => {
  expectValidationError(
    () => normalizeAnalysisInput({
      analysis_type: "quality",
      code_input: pythonLines(100),
      file_name: "review.py",
      generation_params: { temperature: 2 }
    }),
    "invalid_generation_parameter"
  );
});

test("rejects binary content", () => {
  expectValidationError(
    () => normalizeAnalysisInput({ analysis_type: "quality", code_input: `${pythonLines(100)}\u0000`, file_name: "review.py" }),
    "invalid_code"
  );
});

test("rejects code above the character limit", () => {
  expectValidationError(
    () => normalizeAnalysisInput({
      analysis_type: "quality",
      code_input: `def review_code():\n${"x".repeat(MAX_CODE_CHARACTERS)}`,
      file_name: "review.py"
    }),
    "code_too_large"
  );
});

test("rejects an empty security focus list", () => {
  expectValidationError(
    () => normalizeAnalysisInput({
      analysis_type: "security",
      code_input: pythonLines(100),
      file_name: "review.py",
      parameters: { security_focus_areas: [] }
    }),
    "invalid_parameter"
  );
});

test("rejects a non-object parameter value", () => {
  expectValidationError(
    () => normalizeAnalysisInput({
      analysis_type: "quality",
      code_input: pythonLines(100),
      file_name: "review.py",
      parameters: "medium"
    }),
    "invalid_parameters"
  );
});
