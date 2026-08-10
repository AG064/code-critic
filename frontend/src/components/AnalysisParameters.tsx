import type { AnalysisType, QualityParameters, SecurityFocusArea, SecurityParameters } from "../domain";

type Props = {
  analysisType: AnalysisType;
  quality: QualityParameters;
  security: SecurityParameters;
  onQualityChange: (value: QualityParameters) => void;
  onSecurityChange: (value: SecurityParameters) => void;
};

const focusAreaOptions: Array<{ value: SecurityFocusArea; label: string }> = [
  { value: "authentication", label: "Authentication" },
  { value: "authorization", label: "Authorization" },
  { value: "configuration", label: "Configuration" },
  { value: "cryptography", label: "Cryptography" },
  { value: "dependencies", label: "Dependencies" },
  { value: "injection", label: "Injection" },
  { value: "sensitive_data", label: "Sensitive data" }
];

export function AnalysisParameters({ analysisType, quality, security, onQualityChange, onSecurityChange }: Props) {
  if (analysisType === "quality") {
    return (
      <div className="field-grid" aria-label="Quality settings">
        <label>
          <span>Strictness</span>
          <select
            value={quality.strictness_level}
            onChange={(event) => onQualityChange({ ...quality, strictness_level: event.target.value as QualityParameters["strictness_level"] })}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>

        <label>
          <span>Naming convention</span>
          <select
            value={quality.naming_conventions}
            onChange={(event) => onQualityChange({ ...quality, naming_conventions: event.target.value as QualityParameters["naming_conventions"] })}
          >
            <option value="language_default">Language default</option>
            <option value="camel_case">camelCase</option>
            <option value="snake_case">snake_case</option>
            <option value="pascal_case">PascalCase</option>
            <option value="any">No preference</option>
          </select>
        </label>

        <label>
          <span>Code organization</span>
          <select
            value={quality.code_organization}
            onChange={(event) => onQualityChange({ ...quality, code_organization: event.target.value as QualityParameters["code_organization"] })}
          >
            <option value="modular">Modular</option>
            <option value="functional">Functional</option>
            <option value="object_oriented">Object-oriented</option>
            <option value="layered">Layered</option>
            <option value="any">No preference</option>
          </select>
        </label>
      </div>
    );
  }

  const toggleFocusArea = (focusArea: SecurityFocusArea) => {
    const selected = security.security_focus_areas.includes(focusArea);
    onSecurityChange({
      ...security,
      security_focus_areas: selected
        ? security.security_focus_areas.filter((item) => item !== focusArea)
        : [...security.security_focus_areas, focusArea]
    });
  };

  return (
    <div aria-label="Security settings">
      <div className="field-grid">
        <label>
          <span>Security framework</span>
          <select
            value={security.security_framework}
            onChange={(event) => onSecurityChange({ ...security, security_framework: event.target.value as SecurityParameters["security_framework"] })}
          >
            <option value="general">General</option>
            <option value="owasp_top_10">OWASP Top 10</option>
            <option value="cwe_top_25">CWE Top 25</option>
          </select>
        </label>

        <label>
          <span>Severity threshold</span>
          <select
            value={security.severity_threshold}
            onChange={(event) => onSecurityChange({ ...security, severity_threshold: event.target.value as SecurityParameters["severity_threshold"] })}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>

        <label>
          <span>Threat level</span>
          <select
            value={security.threat_level}
            onChange={(event) => onSecurityChange({ ...security, threat_level: event.target.value as SecurityParameters["threat_level"] })}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>

      <fieldset className="focus-areas">
        <legend>Security focus areas</legend>
        <div className="checkbox-grid">
          {focusAreaOptions.map((option) => (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={security.security_focus_areas.includes(option.value)}
                onChange={() => toggleFocusArea(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
