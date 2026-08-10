import { detectLanguage, normalizeLanguageHint } from "./LanguageDetector.js";
import {
  ANALYSIS_TYPES,
  type AnalysisType,
  type GenerationParameters,
  type NormalizedAnalysisInput,
  type QualityParameters,
  type SecurityParameters
} from "./types.js";

export const MIN_CODE_LINES = 100;
export const MAX_CODE_LINES = 500;
export const MAX_CODE_CHARACTERS = 200_000;

export class InputValidationError extends Error {
  readonly status = 400;

  constructor(
    readonly code: string,
    readonly field: string,
    message: string
  ) {
    super(message);
    this.name = "InputValidationError";
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
  field: string
): T[number] {
  if (value === undefined || value === "") {
    return fallback;
  }

  if (typeof value !== "string" || !allowed.includes(value as T[number])) {
    throw new InputValidationError("invalid_parameter", field, `${field} has an unsupported value.`);
  }

  return value as T[number];
}

function readNumber(value: unknown, fallback: number, minimum: number, maximum: number, field: string, integer = false): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new InputValidationError("invalid_generation_parameter", field, `${field} must be between ${minimum} and ${maximum}.`);
  }

  return value;
}

function normalizeFileName(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "pasted-code";
  }

  if (typeof value !== "string") {
    throw new InputValidationError("invalid_file_name", "file_name", "File name must be text.");
  }

  const trimmed = value.trim();
  const fileName = trimmed.split(/[\\/]/).at(-1) ?? "";

  if (fileName.length === 0 || fileName.length > 160 || /[\u0000-\u001f]/.test(fileName)) {
    throw new InputValidationError("invalid_file_name", "file_name", "File name is not valid.");
  }

  return fileName;
}

function countCodeLines(code: string): number {
  const lines = code.split("\n");
  if (code.endsWith("\n")) {
    lines.pop();
  }
  return lines.length;
}

function normalizeCode(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InputValidationError("empty_code", "code_input", "Enter source code before starting an analysis.");
  }

  const code = value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  if (code.includes("\u0000")) {
    throw new InputValidationError("invalid_code", "code_input", "The uploaded file must contain text source code.");
  }

  if (code.length > MAX_CODE_CHARACTERS) {
    throw new InputValidationError("code_too_large", "code_input", `Code must not exceed ${MAX_CODE_CHARACTERS.toLocaleString("en-US")} characters.`);
  }

  return code;
}

function normalizeGenerationParameters(value: unknown): GenerationParameters {
  const source = value === undefined ? {} : value;
  if (!isRecord(source)) {
    throw new InputValidationError("invalid_generation_parameters", "generation_params", "Generation parameters must be an object.");
  }

  return {
    temperature: readNumber(source.temperature, 0.3, 0, 1, "temperature"),
    max_tokens: readNumber(source.max_tokens, 1500, 500, 3000, "max_tokens", true),
    top_p: readNumber(source.top_p, 0.9, 0.1, 1, "top_p")
  };
}

function normalizeQualityParameters(source: Record<string, unknown>): QualityParameters {
  return {
    strictness_level: readEnum(source.strictness_level, ["low", "medium", "high"] as const, "medium", "strictness_level"),
    naming_conventions: readEnum(
      source.naming_conventions,
      ["any", "language_default", "camel_case", "snake_case", "pascal_case"] as const,
      "language_default",
      "naming_conventions"
    ),
    code_organization: readEnum(
      source.code_organization,
      ["any", "functional", "object_oriented", "modular", "layered"] as const,
      "modular",
      "code_organization"
    )
  };
}

const securityFocusAreas = [
  "authentication",
  "authorization",
  "configuration",
  "cryptography",
  "dependencies",
  "injection",
  "sensitive_data"
] as const;

function normalizeSecurityFocusAreas(value: unknown): SecurityParameters["security_focus_areas"] {
  const rawValues = value === undefined
    ? ["authentication", "injection", "sensitive_data"]
    : typeof value === "string"
      ? value.split(",")
      : value;

  if (!Array.isArray(rawValues)) {
    throw new InputValidationError("invalid_parameter", "security_focus_areas", "Security focus areas must be a list.");
  }

  const normalized = [...new Set(rawValues.map((item) => typeof item === "string" ? item.trim().toLowerCase() : ""))];

  if (normalized.length === 0 || normalized.some((item) => !securityFocusAreas.includes(item as (typeof securityFocusAreas)[number]))) {
    throw new InputValidationError("invalid_parameter", "security_focus_areas", "Security focus areas contain an unsupported value.");
  }

  return normalized as SecurityParameters["security_focus_areas"];
}

function normalizeSecurityParameters(source: Record<string, unknown>): SecurityParameters {
  return {
    security_framework: readEnum(
      source.security_framework,
      ["general", "owasp_top_10", "cwe_top_25"] as const,
      "general",
      "security_framework"
    ),
    severity_threshold: readEnum(
      source.severity_threshold,
      ["low", "medium", "high", "critical"] as const,
      "medium",
      "severity_threshold"
    ),
    security_focus_areas: normalizeSecurityFocusAreas(source.security_focus_areas ?? source.vulnerability_categories),
    threat_level: readEnum(source.threat_level, ["low", "medium", "high"] as const, "medium", "threat_level")
  };
}

function normalizeAnalysisType(value: unknown): AnalysisType {
  if (typeof value !== "string" || !ANALYSIS_TYPES.includes(value as AnalysisType)) {
    throw new InputValidationError("unsupported_analysis_type", "analysis_type", "Analysis type must be quality or security.");
  }
  return value as AnalysisType;
}

export function normalizeAnalysisInput(value: unknown): NormalizedAnalysisInput {
  if (!isRecord(value)) {
    throw new InputValidationError("invalid_input", "request", "Request body must be an object.");
  }

  const analysisType = normalizeAnalysisType(value.analysis_type);
  const code = normalizeCode(value.code_input);
  const fileName = normalizeFileName(value.file_name);
  const lineCount = countCodeLines(code);

  if (lineCount < MIN_CODE_LINES || lineCount > MAX_CODE_LINES) {
    throw new InputValidationError(
      "invalid_line_count",
      "code_input",
      `Code must contain ${MIN_CODE_LINES} to ${MAX_CODE_LINES} lines. Received ${lineCount}.`
    );
  }

  if (value.language !== undefined && value.language !== "" && value.language !== "auto") {
    if (typeof value.language !== "string" || normalizeLanguageHint(value.language) === null) {
      throw new InputValidationError("unsupported_language", "language", "The supplied language is not supported.");
    }
  }

  const language = detectLanguage(code, fileName);
  if (!language) {
    throw new InputValidationError(
      "unsupported_language",
      "code_input",
      "The programming language could not be detected or is not supported. Use a source file name with a supported extension."
    );
  }

  const nestedParameters = value.parameters;
  if (nestedParameters !== undefined && !isRecord(nestedParameters)) {
    throw new InputValidationError("invalid_parameters", "parameters", "Analysis parameters must be an object.");
  }
  const parameterSource = { ...value, ...(nestedParameters ?? {}) };
  const generationParameters = normalizeGenerationParameters(value.generation_params);
  const normalizedCode = {
    content: code,
    language,
    line_count: lineCount,
    file_name: fileName
  };

  if (analysisType === "quality") {
    return {
      analysis_type: "quality",
      code: normalizedCode,
      parameters: normalizeQualityParameters(parameterSource),
      generation_params: generationParameters
    };
  }

  return {
    analysis_type: "security",
    code: normalizedCode,
    parameters: normalizeSecurityParameters(parameterSource),
    generation_params: generationParameters
  };
}
