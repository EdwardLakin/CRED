"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { runObservationWritingAction } from "@/features/reports/actions";

// There is deliberately no "generate_recommendation" action — the inspector
// is the source of truth for recommendations. This assistant may rewrite
// text the inspector already wrote; it must never author a recommendation.
type ActionKey =
  | "improve_writing"
  | "rewrite_for_customer"
  | "make_more_technical"
  | "make_more_concise"
  | "expand_description"
  | "generate_observation"
  | "explain_clearly";

// The two actions a reviewer reaches for constantly stay on the surface; the
// rest live behind a disclosure. Eighteen items x nine always-visible buttons
// buried the text the reviewer actually came to read.
const PRIMARY_ACTIONS: Array<{ key: ActionKey; label: string }> = [
  { key: "improve_writing", label: "Improve writing" },
  { key: "rewrite_for_customer", label: "Rewrite for customer" },
];

const MORE_ACTIONS: Array<{ key: ActionKey; label: string }> = [
  { key: "make_more_technical", label: "More technical" },
  { key: "make_more_concise", label: "More concise" },
  { key: "expand_description", label: "Expand" },
  { key: "generate_observation", label: "Generate observation" },
  { key: "explain_clearly", label: "Explain clearly" },
];

export function EvidenceObservationAssistant({
  captureId,
  sessionId,
  textareaName,
  lastAiName,
  initialText,
  originalTechnicianNote,
  lastAiText,
  classification,
  observationTitle,
}: {
  captureId: string;
  sessionId: string;
  textareaName: string;
  lastAiName: string;
  initialText: string;
  originalTechnicianNote: string;
  lastAiText: string;
  classification: string;
  observationTitle: string;
}) {
  const textareaId = useId();
  const lastAiId = useId();
  const originalText = useMemo(() => originalTechnicianNote, [originalTechnicianNote]);
  const [text, setText] = useState(initialText);
  const [lastAi, setLastAi] = useState(lastAiText);
  const [history, setHistory] = useState<string[]>([]);
  const [busyAction, setBusyAction] = useState<ActionKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function dispatchAutosave(nextText: string, nextLastAi = lastAi) {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement | null;
    const hidden = document.getElementById(lastAiId) as HTMLInputElement | null;
    if (!textarea) return;
    textarea.value = nextText;
    if (hidden) hidden.value = nextLastAi;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function applyText(value: string, notice: string) {
    setHistory((items) => [text, ...items].slice(0, 12));
    setText(value);
    setLastAi(value);
    setMessage(notice);
    setError(null);
    dispatchAutosave(value, value);
  }

  async function runAction(action: ActionKey) {
    if (busyAction) return;
    setBusyAction(action);
    setMessage(null);
    setError(null);
    const formData = new FormData();
    formData.set("session_id", sessionId);
    formData.set("capture_id", captureId);
    formData.set("action", action);
    formData.set("current_text", text);
    formData.set("classification", classification);
    formData.set("observation_title", observationTitle);
    const result = await runObservationWritingAction({ ok: false }, formData);
    setBusyAction(null);
    if (!result.ok || !result.text) {
      setError(result.error ?? "AI observation assistant failed. Please try again.");
      return;
    }
    applyText(result.text, "AI draft applied to this capture only. Technician notes were not changed.");
  }

  function undoLastAiRewrite() {
    const [previous, ...rest] = history;
    if (previous === undefined) return;
    setHistory(rest);
    setText(previous);
    setMessage("Last AI rewrite undone for this capture.");
    setError(null);
    dispatchAutosave(previous);
  }

  function restoreOriginal() {
    setHistory((items) => [text, ...items].slice(0, 12));
    setText(originalText);
    setMessage("Original technician note restored into the customer-facing observation for this capture.");
    setError(null);
    dispatchAutosave(originalText);
  }

  // Grow to fit: this field was fixed at three rows, so customer-facing text was
  // routinely clipped mid-sentence in the one place it most needs proofreading.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, []);
  useEffect(() => {
    resize();
  }, [resize, text]);

  return (
    <div className="observation-ai-editor-stack evidence-card-ai-editor" data-capture-ai-editor={captureId}>
      <label className="field-stack" htmlFor={textareaId}>
        <span className="label">Customer-facing observation</span>
        <textarea
          id={textareaId}
          ref={textareaRef}
          className="input text-area"
          name={textareaName}
          rows={3}
          value={text}
          placeholder="What the customer will read about this item."
          onChange={(event) => {
            setText(event.target.value);
            setMessage(null);
            setError(null);
          }}
        />
      </label>
      <input id={lastAiId} type="hidden" name={lastAiName} value={lastAi} readOnly />
      <section className="report-ai-writing-actions observation-ai-writing-assistant compact-evidence-ai" data-no-autosave aria-label={`AI Observation Assistant for ${observationTitle}`}>
        <div className="observation-ai-heading">
          <strong>AI Observation Assistant</strong>
          <span className="status-pill neutral compact">This item only</span>
        </div>
        <div className="observation-ai-action-grid">
          {PRIMARY_ACTIONS.map((action) => (
            <button key={action.key} type="button" className="button button-secondary touch-target" disabled={busyAction !== null} onClick={() => void runAction(action.key)}>
              {busyAction === action.key ? "Writing…" : action.label}
            </button>
          ))}
          <details className="observation-ai-more">
            <summary className="button button-secondary touch-target">More…</summary>
            <div className="observation-ai-more-menu">
              {MORE_ACTIONS.map((action) => (
                <button key={action.key} type="button" className="button button-secondary touch-target" disabled={busyAction !== null} onClick={() => void runAction(action.key)}>
                  {busyAction === action.key ? "Writing…" : action.label}
                </button>
              ))}
              <button type="button" className="button button-secondary touch-target" disabled={!history.length || busyAction !== null} onClick={undoLastAiRewrite}>Undo last rewrite</button>
              <button type="button" className="button button-secondary touch-target" disabled={busyAction !== null} onClick={restoreOriginal}>Restore original</button>
              <p className="muted">
                These actions read this item&rsquo;s photo, notes, classification and
                surrounding report context. They never write a recommendation for you.
              </p>
            </div>
          </details>
        </div>
        {message ? <p className="success compact-success" aria-live="polite">{message}</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>
    </div>
  );
}
