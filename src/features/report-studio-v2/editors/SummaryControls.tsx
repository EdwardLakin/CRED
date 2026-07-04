"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { improveReportSummaryAction, regenerateReportSummaryAction, saveReportSummaryFromStudio } from "@/features/reports/actions";
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
  const [assistantMessage, setAssistantMessage] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantBusy, setAssistantBusy] = useState<"improving" | "generating" | null>(null);
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
    setAssistantMessage(null);
    setAssistantError(null);
    onSaved?.(value);
    scheduleAutosave(value);
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
    setError(null);
    setAssistantError(null);
    setAssistantMessage("Original summary restored. Review the editable summary field before saving completes.");
    onSaved?.(originalSummary);
    saveSummary(originalSummary);
  }

  async function runAssistant(kind: "improve" | "regenerate") {
    if (!hasSession || assistantBusy) return;
    if (kind === "regenerate") {
      const confirmed = window.confirm(
        "Regenerate Executive Summary?\nThis will replace the current editable summary with a new AI-generated summary from the documented observations already loaded for this report.",
      );
      if (!confirmed) return;
    }
    setAssistantBusy(kind === "improve" ? "improving" : "generating");
    setAssistantError(null);
    setAssistantMessage(null);
    const form = formRef.current;
    const formData = form ? new FormData(form) : new FormData();
    formData.set("session_id", session?.id ?? "");
    formData.set("report_summary", summary);
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
    onSaved?.(result.summary);
    saveSummary(result.summary);
  }

  const currentSaveState = isPending ? "saving" : saveState;
  const assistantDisabled = !hasSession || assistantBusy !== null;

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
        <p className="muted">Use these tools to refine the Executive Summary. Suggestions appear in the editable summary field before saving.</p>
      </div>
      <div className="report-ai-writing-actions">
        <button type="button" className="button button-secondary touch-target" disabled={assistantDisabled || !summary.trim()} onClick={() => runAssistant("improve")}>{assistantBusy === "improving" ? "Improving…" : "Improve Writing"}</button>
        <button type="button" className="button button-secondary touch-target" disabled={assistantDisabled} onClick={() => runAssistant("regenerate")}>{assistantBusy === "generating" ? "Generating…" : "Regenerate Summary"}</button>
        <button type="button" className="button button-secondary touch-target" disabled={!hasOriginal} aria-describedby={!hasOriginal ? "summary-restore-disabled-reason" : undefined} onClick={restoreOriginal}>Restore Original</button>
      </div>
      {!hasOriginal ? <p id="summary-restore-disabled-reason" className="muted compact-review-summary">Restore Original is disabled because this report did not load with an original summary.</p> : null}
      {assistantError ? <p className="rsv2-inline-error" role="alert">{assistantError}</p> : null}
      {assistantMessage ? <p className="rsv2-inline-success" role="status">{assistantMessage}</p> : null}
    </section>
  </section>;
}
