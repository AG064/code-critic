import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { analyzeQuality, analyzeSecurity, ApiError } from "./api";
import { AnalysisParameters } from "./components/AnalysisParameters";
import { ReportEditor } from "./components/ReportEditor";
import type { AnalysisType, NormalizedInput, QualityParameters, QualityReport, SecurityParameters, SecurityReport } from "./domain";
import { createEditableReport } from "./reportExport";

type ServiceState = "checking" | "ready" | "unavailable";

const MAX_FILE_BYTES = 200_000;

const defaultQuality: QualityParameters = {
  strictness_level: "medium",
  naming_conventions: "language_default",
  code_organization: "modular"
};

const defaultSecurity: SecurityParameters = {
  security_framework: "general",
  severity_threshold: "medium",
  security_focus_areas: ["authentication", "injection", "sensitive_data"],
  threat_level: "medium"
};

function countLines(code: string): number {
  if (code.length === 0) {
    return 0;
  }
  const normalized = code.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (normalized.endsWith("\n")) {
    lines.pop();
  }
  return lines.length;
}

function findingLocation(lineStart: number | null, lineEnd: number | null): string {
  if (lineStart === null || lineEnd === null) {
    return "Whole file";
  }
  return lineStart === lineEnd ? `Line ${lineStart}` : `Lines ${lineStart}-${lineEnd}`;
}

export function App() {
  const [serviceState, setServiceState] = useState<ServiceState>("checking");
  const [analysisType, setAnalysisType] = useState<AnalysisType>("quality");
  const [code, setCode] = useState("");
  const [fileName, setFileName] = useState("");
  const [quality, setQuality] = useState<QualityParameters>(defaultQuality);
  const [security, setSecurity] = useState<SecurityParameters>(defaultSecurity);
  const [normalizedInput, setNormalizedInput] = useState<NormalizedInput | null>(null);
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [securityReport, setSecurityReport] = useState<SecurityReport | null>(null);
  const [editableReport, setEditableReport] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const resultVersion = useRef(0);

  const clearResult = () => {
    resultVersion.current += 1;
    setNormalizedInput(null);
    setQualityReport(null);
    setSecurityReport(null);
    setEditableReport("");
    return resultVersion.current;
  };

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Health request failed");
        }
        setServiceState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setServiceState("unavailable");
      });

    return () => controller.abort();
  }, []);

  const statusText = {
    checking: "Checking",
    ready: "Ready",
    unavailable: "Unavailable"
  }[serviceState];

  const lineCount = useMemo(() => countLines(code), [code]);
  const lineCountState = lineCount >= 100 && lineCount <= 500 ? "valid" : "invalid";

  const handleCodeChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setCode(event.target.value);
    setFileName("");
    clearResult();
    setMessage(null);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";

    if (!file) {
      return;
    }

    clearResult();
    if (file.size > MAX_FILE_BYTES) {
      setMessage("The file is too large. Choose a source file under 200 KB.");
      return;
    }

    try {
      const content = await file.text();
      if (content.includes("\u0000")) {
        setMessage("The uploaded file must contain text source code.");
        return;
      }
      setCode(content);
      setFileName(file.name);
      setMessage(null);
    } catch {
      setMessage("The file could not be read.");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const requestVersion = clearResult();

    const generation_params = {
      temperature: 0.3,
      max_tokens: 1500,
      top_p: 0.9
    };

    try {
      if (analysisType === "quality") {
        const result = await analyzeQuality({
          analysis_type: "quality",
          code_input: code,
          ...(fileName ? { file_name: fileName } : {}),
          parameters: quality,
          generation_params
        });
        if (resultVersion.current !== requestVersion) {
          return;
        }
        setNormalizedInput(result.normalizedInput);
        setQualityReport(result.report);
        setEditableReport(createEditableReport(result.normalizedInput, result.report));
      } else {
        const result = await analyzeSecurity({
          analysis_type: "security",
          code_input: code,
          ...(fileName ? { file_name: fileName } : {}),
          parameters: security,
          generation_params
        });
        if (resultVersion.current !== requestVersion) {
          return;
        }
        setNormalizedInput(result.normalizedInput);
        setSecurityReport(result.report);
        setEditableReport(createEditableReport(result.normalizedInput, result.report));
      }
    } catch (error) {
      if (resultVersion.current === requestVersion) {
        setMessage(error instanceof ApiError ? error.message : "The request could not be completed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="shell">
      <header>
        <div>
          <h1>Code Critic</h1>
          <p className="intro">Review 100 to 500 lines of source code.</p>
        </div>
        <div className="service-status">
          <span>Service</span>
          <output data-state={serviceState}>{statusText}</output>
        </div>
      </header>

      <form className="workspace" onSubmit={handleSubmit}>
        <section className="form-section" aria-labelledby="code-heading">
          <div className="section-heading">
            <div>
              <p className="step-label">1. Source</p>
              <h2 id="code-heading">Add code</h2>
            </div>
            <label className="file-control">
              <span>Choose file</span>
              <input
                type="file"
                accept=".c,.cc,.cpp,.cs,.css,.go,.h,.hpp,.html,.htm,.java,.js,.jsx,.kt,.kts,.mjs,.cjs,.php,.py,.rb,.rs,.sh,.bash,.sql,.swift,.ts,.tsx,text/plain"
                onChange={handleFile}
              />
            </label>
          </div>

          {fileName && <p className="file-name">File: {fileName}</p>}
          <label className="code-field">
            <span className="visually-hidden">Source code</span>
            <textarea
              value={code}
              onChange={handleCodeChange}
              maxLength={MAX_FILE_BYTES}
              rows={18}
              spellCheck={false}
              placeholder="Paste source code here"
            />
          </label>
          <div className="code-meta">
            <span data-state={lineCountState}>{lineCount} lines</span>
            <span>100 to 500 required</span>
          </div>
        </section>

        <section className="form-section" aria-labelledby="analysis-heading">
          <p className="step-label">2. Review</p>
          <h2 id="analysis-heading">Choose analysis</h2>

          <label className="analysis-type-field">
            <span>Analysis type</span>
            <select
              value={analysisType}
              onChange={(event) => {
                setAnalysisType(event.target.value as AnalysisType);
                clearResult();
                setMessage(null);
              }}
            >
              <option value="quality">Quality</option>
              <option value="security">Security</option>
            </select>
          </label>

          <AnalysisParameters
            analysisType={analysisType}
            quality={quality}
            security={security}
            onQualityChange={(value) => {
              setQuality(value);
              clearResult();
              setMessage(null);
            }}
            onSecurityChange={(value) => {
              setSecurity(value);
              clearResult();
              setMessage(null);
            }}
          />
        </section>

        {message && <p className="message error" role="alert">{message}</p>}

        <div className="action-row">
          <p>Code stays in this request and is not saved.</p>
          <button type="submit" disabled={submitting}>
            {submitting ? "Working" : analysisType === "quality" ? "Analyze quality" : "Analyze security"}
          </button>
        </div>
      </form>

      {normalizedInput && (
        <section className="input-result" aria-live="polite">
          <p className="step-label">Input ready</p>
          <h2>{normalizedInput.code.language}</h2>
          <dl>
            <div>
              <dt>Lines</dt>
              <dd>{normalizedInput.code.line_count}</dd>
            </div>
            <div>
              <dt>File</dt>
              <dd>{normalizedInput.code.file_name}</dd>
            </div>
            <div>
              <dt>Analysis</dt>
              <dd>{normalizedInput.analysis_type}</dd>
            </div>
          </dl>
        </section>
      )}

      {qualityReport && (
        <section className="report" aria-live="polite">
          <div className="report-heading">
            <div>
              <p className="step-label">Quality report</p>
              <h2>{qualityReport.score}/100</h2>
            </div>
            <p>{qualityReport.summary}</p>
          </div>

          <h3>Findings</h3>
          {qualityReport.findings.length === 0 ? (
            <p>No findings.</p>
          ) : (
            <ol className="report-list">
              {qualityReport.findings.map((finding, index) => (
                <li key={`${finding.title}-${index}`}>
                  <div className="finding-meta">
                    <strong>{finding.title}</strong>
                    <span>{finding.severity} | {findingLocation(finding.line_start, finding.line_end)}</span>
                  </div>
                  <p>{finding.description}</p>
                </li>
              ))}
            </ol>
          )}

          <h3>Recommendations</h3>
          {qualityReport.recommendations.length === 0 ? (
            <p>No recommendations.</p>
          ) : (
            <ol className="report-list">
              {qualityReport.recommendations.map((recommendation, index) => (
                <li key={`${recommendation.title}-${index}`}>
                  <strong>{recommendation.title}</strong>
                  <p>{recommendation.description}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {securityReport && (
        <section className="report" aria-live="polite">
          <div className="report-heading">
            <div>
              <p className="step-label">Security report</p>
              <h2>{securityReport.risk_assessment.level} risk</h2>
            </div>
            <p>{securityReport.risk_assessment.summary}</p>
          </div>

          <h3>Vulnerabilities</h3>
          {securityReport.vulnerabilities.length === 0 ? (
            <p>No vulnerabilities found.</p>
          ) : (
            <ol className="report-list">
              {securityReport.vulnerabilities.map((vulnerability, index) => (
                <li key={`${vulnerability.title}-${index}`}>
                  <div className="finding-meta">
                    <strong>{vulnerability.title}</strong>
                    <span>{vulnerability.severity} | {findingLocation(vulnerability.line_start, vulnerability.line_end)}</span>
                  </div>
                  <p>{vulnerability.category}</p>
                  <p>{vulnerability.description}</p>
                  <p><strong>Mitigation:</strong> {vulnerability.mitigation}</p>
                </li>
              ))}
            </ol>
          )}

          <h3>Mitigations</h3>
          {securityReport.mitigations.length === 0 ? (
            <p>No additional mitigations.</p>
          ) : (
            <ol className="report-list">
              {securityReport.mitigations.map((mitigation, index) => (
                <li key={`${mitigation.title}-${index}`}>
                  <strong>{mitigation.title}</strong>
                  <p>{mitigation.description}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {normalizedInput && (qualityReport || securityReport) && (
        <ReportEditor
          analysisType={normalizedInput.analysis_type}
          value={editableReport}
          onChange={setEditableReport}
        />
      )}
    </main>
  );
}
