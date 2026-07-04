"use client";

import { useEffect, useId, useMemo, useState } from "react";

type SaveState = "saved" | "saving" | "failed" | "unsaved";
type SummarySource = "original" | "manual" | "ai-generated" | "ai-improved";

const SAVE_LABELS: Record<SaveState, string> = {
  saved: "Saved",
  saving: "Saving…",
  failed: "Failed to save",
  unsaved: "Unsaved changes",
};

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

export function SummaryAssistantEditor({ initialSummary }: { initialSummary: string }) {
  const textareaId = useId();
  const descriptionId = useId();
  const [summary, setSummary] = useState(initialSummary);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [source, setSource] = useState<SummarySource>(initialSummary.trim() ? "original" : "manual");
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
  }

  function restoreOriginal() {
    if (!hasOriginal) return;
    if (saveState === "unsaved") {
      const confirmed = window.confirm(
        "Restore Original Executive Summary?\nThis will replace your unsaved edits with the summary that was loaded when you opened the editor.",
      );
      if (!confirmed) return;
    }
    setSummary(originalSummary);
    setSource("original");
    dispatchAutosave(originalSummary);
  }

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
            Uses the editable Executive Summary as the canonical report summary. Assistant changes appear here for review before autosave persists them.
          </p>
        </div>
        <div className="report-ai-writing-actions">
          <button
            type="button"
            className="button button-secondary touch-target"
            disabled
            title="AI writing refinement will be available after report regeneration support is connected."
          >
            Improve Writing
          </button>
          <button
            type="button"
            className="button button-secondary touch-target"
            disabled
            title="Regenerate Summary will be available after report generation support is connected."
          >
            Regenerate Summary
          </button>
          <button
            type="button"
            className="button button-secondary touch-target"
            disabled={!hasOriginal}
            onClick={restoreOriginal}
          >
            Restore Original
          </button>
        </div>
        <p className="muted compact-review-summary">
          Improve Writing and Regenerate Summary are disabled until the existing report generation support is connected. They will not invent findings, severity, recommendations, causes, or unsupported facts.
        </p>
      </section>
    </div>
  );
}
