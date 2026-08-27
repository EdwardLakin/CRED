"use client";

import { useId, useMemo, useState } from "react";

import { runObservationWritingAction } from "@/features/reports/actions";

type ActionKey =
  | "improve_writing"
  | "rewrite_for_customer"
  | "make_more_technical"
  | "make_more_concise"
  | "expand_description"
  | "generate_observation"
  | "generate_recommendation"
  | "explain_clearly";

const ACTIONS: Array<{ key: ActionKey; label: string }> = [
  { key: "improve_writing", label: "Improve Writing" },
  { key: "rewrite_for_customer", label: "Rewrite for Customer" },
  { key: "make_more_technical", label: "Make More Technical" },
  { key: "make_more_concise", label: "Make More Concise" },
  { key: "expand_description", label: "Expand Description" },
  { key: "generate_observation", label: "Generate Observation" },
  { key: "generate_recommendation", label: "Generate Recommendation" },
  { key: "explain_clearly", label: "Explain Clearly" },
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

  return (
    <div className="observation-ai-editor-stack evidence-card-ai-editor" data-capture-ai-editor={captureId}>
      <label className="field-stack" htmlFor={textareaId}>
        <span className="label">Customer Facing Observation</span>
        <textarea
          id={textareaId}
          className="input text-area"
          name={textareaName}
          rows={3}
          value={text}
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
          {ACTIONS.map((action) => (
            <button key={action.key} type="button" className="button button-secondary touch-target" disabled={busyAction !== null} onClick={() => void runAction(action.key)}>
              {busyAction === action.key ? "Writing…" : action.label}
            </button>
          ))}
          <button type="button" className="button button-secondary touch-target" disabled={!history.length || busyAction !== null} onClick={undoLastAiRewrite}>Undo Last AI Rewrite</button>
          <button type="button" className="button button-secondary touch-target" disabled={busyAction !== null} onClick={restoreOriginal}>Restore Original</button>
        </div>
        <p className="muted">One-click actions use this capture image, vision details, notes, classification, supports relationship, nearby observations, report context, and extracted metadata.</p>
        {message ? <p className="success compact-success" aria-live="polite">{message}</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>
    </div>
  );
}
