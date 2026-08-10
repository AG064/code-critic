import {
  supportedLanguages,
  type AnalysisRequest,
  type NormalizedInput,
  type QualityParameters,
  type SecurityFocusArea,
  type SecurityParameters
} from "./domain";

type ErrorResponse = {
  error?: unknown;
  code?: unknown;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code = "request_failed"
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedValue<const T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && allowed.includes(value as T[number]);
}

function isQualityParameters(value: unknown): value is QualityParameters {
  if (!isRecord(value)) {
    return false;
  }

  return isAllowedValue(value.strictness_level, ["low", "medium", "high"] as const)
    && isAllowedValue(value.naming_conventions, ["any", "language_default", "camel_case", "snake_case", "pascal_case"] as const)
    && isAllowedValue(value.code_organization, ["any", "functional", "object_oriented", "modular", "layered"] as const);
}

const securityFocusAreas = [
  "authentication",
  "authorization",
  "configuration",
  "cryptography",
  "dependencies",
  "injection",
  "sensitive_data"
] as const satisfies readonly SecurityFocusArea[];

function isSecurityParameters(value: unknown): value is SecurityParameters {
  if (!isRecord(value) || !Array.isArray(value.security_focus_areas)) {
    return false;
  }

  return isAllowedValue(value.security_framework, ["general", "owasp_top_10", "cwe_top_25"] as const)
    && isAllowedValue(value.severity_threshold, ["low", "medium", "high", "critical"] as const)
    && value.security_focus_areas.length > 0
    && value.security_focus_areas.every((item) => isAllowedValue(item, securityFocusAreas))
    && isAllowedValue(value.threat_level, ["low", "medium", "high"] as const);
}

function isNormalizedInput(value: unknown): value is NormalizedInput {
  if (!isRecord(value) || !isRecord(value.code) || !isRecord(value.generation_params)) {
    return false;
  }

  const validParameters = value.analysis_type === "quality"
    ? isQualityParameters(value.parameters)
    : value.analysis_type === "security" && isSecurityParameters(value.parameters);

  return validParameters
    && typeof value.code.content === "string"
    && isAllowedValue(value.code.language, supportedLanguages)
    && typeof value.code.line_count === "number"
    && Number.isInteger(value.code.line_count)
    && value.code.line_count >= 100
    && value.code.line_count <= 500
    && typeof value.code.file_name === "string"
    && value.code.file_name.length > 0
    && typeof value.generation_params.temperature === "number"
    && Number.isFinite(value.generation_params.temperature)
    && value.generation_params.temperature >= 0
    && value.generation_params.temperature <= 1
    && typeof value.generation_params.max_tokens === "number"
    && Number.isInteger(value.generation_params.max_tokens)
    && value.generation_params.max_tokens >= 500
    && value.generation_params.max_tokens <= 3000
    && typeof value.generation_params.top_p === "number"
    && Number.isFinite(value.generation_params.top_p)
    && value.generation_params.top_p >= 0.1
    && value.generation_params.top_p <= 1;
}

async function readResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiError("The service returned an invalid response.", "invalid_response");
  }
}

export async function normalizeInput(payload: AnalysisRequest): Promise<NormalizedInput> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch("/api/normalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await readResponseBody(response);

    if (!response.ok) {
      const errorBody = body as ErrorResponse;
      const message = typeof errorBody.error === "string" ? errorBody.error : "The input could not be checked.";
      const code = typeof errorBody.code === "string" ? errorBody.code : "request_failed";
      throw new ApiError(message, code);
    }

    if (!isRecord(body) || !isNormalizedInput(body.normalized_input)) {
      throw new ApiError("The service returned an invalid response.", "invalid_response");
    }

    return body.normalized_input;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The input check timed out. Try again.", "timeout");
    }
    throw new ApiError("The service is unavailable. Try again shortly.", "unavailable");
  } finally {
    window.clearTimeout(timeout);
  }
}
