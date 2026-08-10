import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { ApiError, normalizeInput } from "./api";
import { AnalysisParameters } from "./components/AnalysisParameters";
import type { AnalysisRequest, AnalysisType, NormalizedInput, QualityParameters, SecurityParameters } from "./domain";

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

export function App() {
  const [serviceState, setServiceState] = useState<ServiceState>("checking");
  const [analysisType, setAnalysisType] = useState<AnalysisType>("quality");
  const [code, setCode] = useState("");
  const [fileName, setFileName] = useState("");
  const [quality, setQuality] = useState<QualityParameters>(defaultQuality);
  const [security, setSecurity] = useState<SecurityParameters>(defaultSecurity);
  const [normalizedInput, setNormalizedInput] = useState<NormalizedInput | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checkingInput, setCheckingInput] = useState(false);

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
    setNormalizedInput(null);
    setMessage(null);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";

    if (!file) {
      return;
    }

    setNormalizedInput(null);
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
    setCheckingInput(true);
    setMessage(null);
    setNormalizedInput(null);

    const payload: AnalysisRequest = {
      analysis_type: analysisType,
      code_input: code,
      ...(fileName ? { file_name: fileName } : {}),
      parameters: analysisType === "quality" ? quality : security,
      generation_params: {
        temperature: 0.3,
        max_tokens: 1500,
        top_p: 0.9
      }
    };

    try {
      const result = await normalizeInput(payload);
      setNormalizedInput(result);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "The input could not be checked.");
    } finally {
      setCheckingInput(false);
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
                setNormalizedInput(null);
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
              setNormalizedInput(null);
              setMessage(null);
            }}
            onSecurityChange={(value) => {
              setSecurity(value);
              setNormalizedInput(null);
              setMessage(null);
            }}
          />
        </section>

        {message && <p className="message error" role="alert">{message}</p>}

        <div className="action-row">
          <p>Code stays in this request and is not saved.</p>
          <button type="submit" disabled={checkingInput}>
            {checkingInput ? "Checking" : "Check input"}
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
    </main>
  );
}
