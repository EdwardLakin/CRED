"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { improveReportSummaryAction, regenerateReportSummaryAction } from "@/features/reports/actions";

type SaveState = "saved" | "saving" | "failed" | "unsaved";
type SummarySource = "original" | "manual" | "ai-generated" | "ai-improved";
type SummaryStyle = "concise" | "professional" | "detailed";

const SAVE_LABELS: Record<SaveState, string> = {
  saved: "Saved",
  saving: "Saving…",
  failed: "Failed to save",
  unsaved: "Unsaved changes",
};

const SUMMARY_STYLE_OPTIONS: Array<{ value: SummaryStyle; label: string; description: string }> = [
  { value: "concise", label: "Concise", description: "One short paragraph, about 60–100 words." },
  { value: "professional", label: "Professional", description: "Default polished paragraph, about 100–160 words." },
  { value: "detailed", label: "Detailed", description: "Two short paragraphs, about 160–220 words." },
];

const SOURCE_LABELS: Record<SummarySource, string> = {
  original: "Original saved summary",
  manual: "Manually edited",
  "ai-generated": "AI generated",
  "ai-improved": "AI improved",
};

function statusClassName(state: SaveState) {
  if (state === "failed") return "status-pill attention compact";
  if (state === "saved") return "status-pill success compact";
  return "status-pill neutral compact";
}

export function SummaryAssistantEditor({ initialSummary, sessionId }: { initialSummary: string; sessionId: string }) {
  const textareaId = useId();
  const descriptionId = useId();
  const styleSelectId = useId();
  const [summary, setSummary] = useState(initialSummary);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [source, setSource] = useState<SummarySource>(initialSummary.trim() ? "original" : "manual");
  const [assistantMessage, setAssistantMessage] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantBusy, setAssistantBusy] = useState<"improving" | "generating" | null>(null);
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle>("professional");
  const originalSummary = useMemo(() => initialSummary, [initialSummary]);
  const hasOriginal = originalSummary.trim().length > 0;

  useEffect(() => {
    function handleAutosaveStatus(event: Event) {
      const detail = (event as CustomEvent<{ state?: SaveState }>).detail;
      if (detail?.state) setSaveState(detail.state);
    }

    document.addEventListener("report-autosave-status", handleAutosaveStatus);
    return () => document.removeEventListener("report-autosave-status", handleAutosaveStatus);
  }, []);

  function dispatchAutosave(value: string) {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement | null;
    if (!textarea) return;
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function handleManualChange(value: string) {
    setSummary(value);
    setSource(value === originalSummary ? "original" : "manual");
    setAssistantMessage(null);
    setAssistantError(null);
  }

  function restoreOriginal() {
    if (!hasOriginal) return;
    if (summary !== originalSummary) {
      const confirmed = window.confirm(
        "Restore Original Executive Summary?\nThis will replace your unsaved edits with the summary that was loaded when you opened the editor.",
      );
      if (!confirmed) return;
    }
    setSummary(originalSummary);
    setSource("original");
    setAssistantError(null);
    setAssistantMessage("Original summary restored. Review the editable summary field before saving completes.");
    dispatchAutosave(originalSummary);
  }

  async function runAssistant(kind: "improve" | "regenerate") {
    if (assistantBusy) return;
    if (kind === "regenerate") {
      const confirmed = window.confirm(
        "Regenerate Executive Summary?\nThis will replace the current editable summary with a new AI-generated summary from the documented observations already loaded for this report.",
      );
      if (!confirmed) return;
    }
    setAssistantBusy(kind === "improve" ? "improving" : "generating");
    setAssistantError(null);
    setAssistantMessage(null);
    const formData = new FormData();
    formData.set("session_id", sessionId);
    formData.set("report_summary", summary);
    if (kind === "regenerate") formData.set("summary_style", summaryStyle);
    const result = kind === "improve"
      ? await improveReportSummaryAction({ ok: false }, formData)
      : await regenerateReportSummaryAction({ ok: false }, formData);
    setAssistantBusy(null);
    if (!result.ok || !result.summary) {
      setAssistantError(result.error ?? "AI summary tool failed. Please try again.");
      return;
    }
    setSummary(result.summary);
    setSource(kind === "improve" ? "ai-improved" : "ai-generated");
    setAssistantMessage(kind === "improve" ? "Writing improved. Review the editable summary field before saving completes." : "Summary regenerated. Review the editable summary field before saving completes.");
    dispatchAutosave(result.summary);
  }

  const assistantDisabled = assistantBusy !== null;

  return (
    <div className="summary-editor-stack">
      <label className="field-stack" htmlFor={textareaId}>
        <span id="report-summary-editor" className="label">Executive Summary</span>
        <span id={descriptionId} className="muted">
          Customer-facing overview shown at the beginning of the report.
        </span>
        <textarea
          id={textareaId}
          className="input text-area"
          name="report_summary"
          rows={7}
          value={summary}
          aria-describedby={descriptionId}
          onChange={(event) => handleManualChange(event.target.value)}
        />
      </label>
      <div className="summary-editor-meta" aria-live="polite">
        <span className={statusClassName(saveState)}>{SAVE_LABELS[saveState]}</span>
        <span className="status-pill neutral compact">Source: {SOURCE_LABELS[source]}</span>
      </div>
      <section className="summary-assistant-panel" data-no-autosave aria-labelledby="summary-assistant-heading">
        <div>
          <h4 id="summary-assistant-heading">Summary Assistant</h4>
          <p className="muted">
            Use these tools to refine the Executive Summary. Suggestions appear in the editable summary field before saving.
          </p>
        </div>
        <div className="field-stack summary-style-selector">
          <label className="label" htmlFor={styleSelectId}>Summary Style</label>
          <select
            id={styleSelectId}
            className="input"
            value={summaryStyle}
            disabled={assistantDisabled}
            onChange={(event) => setSummaryStyle(event.target.value as SummaryStyle)}
          >
            {SUMMARY_STYLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <span className="muted compact-review-summary">
            {SUMMARY_STYLE_OPTIONS.find((option) => option.value === summaryStyle)?.description}
          </span>
        </div>
        <div className="report-ai-writing-actions">
          <button
            type="button"
            className="button button-secondary touch-target"
            disabled={assistantDisabled || !summary.trim()}
            onClick={() => runAssistant("improve")}
          >
            {assistantBusy === "improving" ? "Improving…" : "Improve Writing"}
          </button>
          <button
            type="button"
            className="button button-secondary touch-target"
            disabled={assistantDisabled}
            onClick={() => runAssistant("regenerate")}
          >
            {assistantBusy === "generating" ? "Generating…" : "Regenerate Summary"}
          </button>
          <button
            type="button"
            className="button button-secondary touch-target"
            disabled={!hasOriginal}
            aria-describedby={!hasOriginal ? "summary-restore-disabled-reason" : undefined}
            onClick={restoreOriginal}
          >
            Restore Original
          </button>
        </div>
        {!hasOriginal ? <p id="summary-restore-disabled-reason" className="muted compact-review-summary">Restore Original is disabled because this report did not load with an original summary.</p> : null}
        {assistantError ? <p className="rsv2-inline-error" role="alert">{assistantError}</p> : null}
        {assistantMessage ? <p className="rsv2-inline-success" role="status">{assistantMessage}</p> : null}
      </section>
    </div>
  );
}
