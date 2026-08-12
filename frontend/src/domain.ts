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

export type GenerationParameters = {
  temperature: number;
  max_tokens: number;
  top_p: number;
};

type RequestBase = {
  code_input: string;
  file_name?: string;
  generation_params: GenerationParameters;
};

export type AnalysisRequest =
  | RequestBase & {
      analysis_type: "quality";
      parameters: QualityParameters;
    }
  | RequestBase & {
      analysis_type: "security";
      parameters: SecurityParameters;
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
  generation_params: GenerationParameters;
};

export type QualityReport = {
  analysis_type: "quality";
  score: number;
  summary: string;
  findings: Array<{
    title: string;
    severity: "low" | "medium" | "high";
    line_start: number | null;
    line_end: number | null;
    description: string;
  }>;
  recommendations: Array<{
    title: string;
    description: string;
  }>;
};

export type SecurityReport = {
  analysis_type: "security";
  risk_assessment: {
    level: "low" | "medium" | "high" | "critical";
    summary: string;
  };
  vulnerabilities: Array<{
    title: string;
    severity: "low" | "medium" | "high" | "critical";
    category: string;
    line_start: number | null;
    line_end: number | null;
    description: string;
    mitigation: string;
  }>;
  mitigations: Array<{
    title: string;
    description: string;
  }>;
};
