import { useState } from "react";
import type { AnalysisType } from "../domain";
import { createExportFile, type ExportFormat } from "../reportExport";

type ReportEditorProps = {
  analysisType: AnalysisType;
  value: string;
  onChange: (value: string) => void;
};

export function ReportEditor({ analysisType, value, onChange }: ReportEditorProps) {
  const [status, setStatus] = useState("");
  const exportDisabled = value.trim().length === 0;

  const download = (format: ExportFormat) => {
    const file = createExportFile(value, analysisType, format);
    const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(`${file.fileName} download started.`);
  };

  return (
    <section className="report-editor" aria-labelledby="report-editor-heading">
      <p className="step-label">3. Report</p>
      <h2 id="report-editor-heading">Edit report</h2>
      <p className="editor-note">Changes stay in this browser tab and are not saved.</p>

      <label className="report-field">
        <span>Report text</span>
        <textarea
          className="report-textarea"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setStatus("");
          }}
          maxLength={100_000}
          rows={20}
          spellCheck={false}
        />
      </label>

      <fieldset className="export-controls" disabled={exportDisabled}>
        <legend>Export edited report</legend>
        <div>
          <button type="button" className="secondary-button" onClick={() => download("txt")}>Plain text</button>
          <button type="button" className="secondary-button" onClick={() => download("md")}>Markdown</button>
          <button type="button" className="secondary-button" onClick={() => download("html")}>HTML</button>
        </div>
      </fieldset>
      <p className="export-status" role="status">{status}</p>
    </section>
  );
}
