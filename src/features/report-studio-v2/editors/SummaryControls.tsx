"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { saveReportSummaryFromStudio } from "@/features/reports/actions";
import type { ReportStudioSession } from "../types";

const initialState = { ok: false };

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

export function SummaryControls({ session, onSaved }: { session: ReportStudioSession | null; onSaved?: (summary: string) => void }) {
  return <SummaryControlsInner key={session?.id ?? "no-session"} session={session} onSaved={onSaved} />;
}

function SummaryControlsInner({ session, onSaved }: { session: ReportStudioSession | null; onSaved?: (summary: string) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();
  const originalSummary = session?.report_summary ?? "";
  const [summary, setSummary] = useState(originalSummary);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [source, setSource] = useState<SummarySource>(originalSummary.trim() ? "original" : "manual");
  const [error, setError] = useState<string | null>(null);
  const [showSavedMessage, setShowSavedMessage] = useState(false);
  const hasSession = Boolean(session?.id);
  const hasOriginal = originalSummary.trim().length > 0;

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function saveSummary(value: string) {
    const form = formRef.current;
    if (!form || !hasSession) return;
    const formData = new FormData(form);
    formData.set("report_summary", value);
    setSaveState("saving");
    setShowSavedMessage(false);
    startTransition(async () => {
      const result = await saveReportSummaryFromStudio(initialState, formData);
      if (result.ok) {
        setSaveState("saved");
        setError(null);
        setShowSavedMessage(true);
        onSaved?.(result.summary ?? value);
      } else {
        setSaveState("failed");
        setError(result.error ?? "Failed to save summary.");
      }
    });
  }

  function handleSaveNow(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (timerRef.current) clearTimeout(timerRef.current);
    saveSummary(summary);
  }

  function scheduleAutosave(value: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!hasSession) return;
    setSaveState("unsaved");
    timerRef.current = setTimeout(() => saveSummary(value), 1200);
  }

  function handleSummaryChange(value: string) {
    setSummary(value);
    setSource(value === originalSummary ? "original" : "manual");
    setError(null);
    onSaved?.(value);
    scheduleAutosave(value);
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
    setError(null);
    onSaved?.(originalSummary);
    saveSummary(originalSummary);
  }

  const currentSaveState = isPending ? "saving" : saveState;

  return <section className="form-stack summary-editor-stack" data-report-summary-source="ai_report_drafts.summary">
    <form ref={formRef} className="form-stack" onSubmit={handleSaveNow}>
      <input type="hidden" name="session_id" value={session?.id ?? ""} />
      <label className="rsv2-field" htmlFor="report-studio-summary-editor">
        <span>Executive Summary</span>
        <span className="muted">Customer-facing overview shown at the beginning of the report.</span>
        <textarea
          id="report-studio-summary-editor"
          key={session?.id ?? "no-session"}
          className="input text-area"
          name="report_summary"
          rows={10}
          value={summary}
          onChange={(event) => handleSummaryChange(event.target.value)}
          placeholder="Enter the customer-facing executive summary."
        />
      </label>
      <div className="summary-editor-meta" aria-live="polite">
        <span className="status-pill neutral compact">Source: {SOURCE_LABELS[source]}</span>
        <span className={statusClassName(currentSaveState)}>{SAVE_LABELS[currentSaveState]}</span>
      </div>
      <button className="button button-secondary touch-target" type="submit" disabled={!hasSession || currentSaveState === "saving"}>Save now</button>
    </form>
    {error ? <p className="rsv2-inline-error" role="alert">{error}</p> : null}
    {showSavedMessage && currentSaveState === "saved" ? <p className="rsv2-inline-success" role="status">Executive summary saved.</p> : null}
    <section className="summary-assistant-panel" aria-labelledby="summary-assistant-heading">
      <div>
        <h4 id="summary-assistant-heading">Summary Assistant</h4>
        <p className="muted">Uses the editable Executive Summary as the canonical report summary for preview, Review, and PDF export.</p>
      </div>
      <div className="report-ai-writing-actions">
        <button type="button" className="button button-secondary touch-target" disabled>Improve Writing</button>
        <button type="button" className="button button-secondary touch-target" disabled>Regenerate Summary</button>
        <button type="button" className="button button-secondary touch-target" disabled={!hasOriginal} onClick={restoreOriginal}>Restore Original</button>
      </div>
      <p className="muted compact-review-summary">Improve Writing and Regenerate Summary are disabled until AI actions are connected. Restore Original is available when the loaded report has an original saved summary.</p>
    </section>
  </section>;
}
