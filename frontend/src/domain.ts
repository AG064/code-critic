export type AnalysisType = "quality" | "security";

export const supportedLanguages = [
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

export type SupportedLanguage = (typeof supportedLanguages)[number];

export type QualityParameters = {
  strictness_level: "low" | "medium" | "high";
  naming_conventions: "any" | "language_default" | "camel_case" | "snake_case" | "pascal_case";
  code_organization: "any" | "functional" | "object_oriented" | "modular" | "layered";
};
export type SecurityFocusArea =
  | "authentication"
  | "authorization"
  | "configuration"
  | "cryptography"
  | "dependencies"
  | "injection"
  | "sensitive_data";

export type SecurityParameters = {
  security_framework: "general" | "owasp_top_10" | "cwe_top_25";
  severity_threshold: "low" | "medium" | "high" | "critical";
  security_focus_areas: SecurityFocusArea[];
  threat_level: "low" | "medium" | "high";
};

export type AnalysisRequest = {
  analysis_type: AnalysisType;
  code_input: string;
  file_name?: string;
  parameters: QualityParameters | SecurityParameters;
  generation_params: {
    temperature: number;
    max_tokens: number;
    top_p: number;
  };
};

export type NormalizedInput = {
  analysis_type: AnalysisType;
  code: {
    content: string;
    language: SupportedLanguage;
    line_count: number;
    file_name: string;
  };
  parameters: QualityParameters | SecurityParameters;
  generation_params: {
    temperature: number;
    max_tokens: number;
    top_p: number;
  };
};
