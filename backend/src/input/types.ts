export const ANALYSIS_TYPES = ["quality", "security"] as const;

export type AnalysisType = (typeof ANALYSIS_TYPES)[number];

export const SUPPORTED_LANGUAGES = [
  "c",
  "cpp",
  "csharp",
  "css",
  "go",
  "html",
  "java",
  "javascript",
  "kotlin",
  "php",
  "python",
  "ruby",
  "rust",
  "shell",
  "sql",
  "swift",
  "typescript"
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export interface GenerationParameters {
  temperature: number;
  max_tokens: number;
  top_p: number;
}

export interface QualityParameters {
  strictness_level: "low" | "medium" | "high";
  naming_conventions: "any" | "language_default" | "camel_case" | "snake_case" | "pascal_case";
  code_organization: "any" | "functional" | "object_oriented" | "modular" | "layered";
}

export interface SecurityParameters {
  security_framework: "general" | "owasp_top_10" | "cwe_top_25";
  severity_threshold: "low" | "medium" | "high" | "critical";
  security_focus_areas: Array<
    "authentication" | "authorization" | "configuration" | "cryptography" | "dependencies" | "injection" | "sensitive_data"
  >;
  threat_level: "low" | "medium" | "high";
}

export interface NormalizedCode {
  content: string;
  language: SupportedLanguage;
  line_count: number;
  file_name: string;
}

export type NormalizedAnalysisInput =
  | {
      analysis_type: "quality";
      code: NormalizedCode;
      parameters: QualityParameters;
      generation_params: GenerationParameters;
    }
  | {
      analysis_type: "security";
      code: NormalizedCode;
      parameters: SecurityParameters;
      generation_params: GenerationParameters;
    };
