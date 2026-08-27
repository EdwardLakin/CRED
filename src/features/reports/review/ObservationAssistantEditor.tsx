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

export function ObservationAssistantEditor({
  sectionId,
  sessionId,
  textareaName,
  titleName,
  initialTitle,
  initialText,
  classification,
}: {
  sectionId: string;
  sessionId: string;
  textareaName: string;
  titleName: string;
  initialTitle: string;
  initialText: string;
  classification: string;
}) {
  const textareaId = useId();
  const originalText = useMemo(() => initialText, [initialText]);
  const [text, setText] = useState(initialText);
  const [history, setHistory] = useState<string[]>([]);
  const [busyAction, setBusyAction] = useState<ActionKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function dispatchAutosave(value: string) {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement | null;
    if (!textarea) return;
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function applyText(value: string, notice: string) {
    setHistory((items) => [text, ...items].slice(0, 12));
    setText(value);
    setMessage(notice);
    setError(null);
    dispatchAutosave(value);
  }

  async function runAction(action: ActionKey) {
    if (busyAction) return;
    setBusyAction(action);
    setMessage(null);
    setError(null);
    const formData = new FormData();
    formData.set("session_id", sessionId);
    formData.set("section_id", sectionId);
    formData.set("action", action);
    formData.set("current_text", text);
    formData.set("classification", classification);
    const titleInput = document.querySelector<HTMLInputElement>(`[name="${CSS.escape(titleName)}"]`);
    formData.set("observation_title", titleInput?.value || initialTitle);
    const result = await runObservationWritingAction({ ok: false }, formData);
    setBusyAction(null);
    if (!result.ok || !result.text) {
      setError(result.error ?? "AI writing assistant failed. Please try again.");
      return;
    }
    applyText(result.text, "AI draft applied to customer-facing text only. Technician notes were not changed.");
  }

  function undoLastAiRewrite() {
    const [previous, ...rest] = history;
    if (previous === undefined) return;
    setHistory(rest);
    setText(previous);
    setMessage("Last AI rewrite undone.");
    setError(null);
    dispatchAutosave(previous);
  }

  function restoreOriginal() {
    setHistory((items) => [text, ...items].slice(0, 12));
    setText(originalText);
    setMessage("Original customer-facing text restored.");
    setError(null);
    dispatchAutosave(originalText);
  }

  return (
    <div className="observation-ai-editor-stack">
      <label className="field-stack" htmlFor={textareaId}>
        <span className="label">Customer Facing Report Text</span>
        <textarea
          id={textareaId}
          className="input text-area"
          name={textareaName}
          rows={5}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setMessage(null);
            setError(null);
          }}
        />
      </label>
      <section className="report-ai-writing-actions observation-ai-writing-assistant" data-no-autosave aria-label="AI Writing Assistant">
        <div className="observation-ai-heading">
          <strong>AI Writing Assistant</strong>
          <span className="status-pill neutral compact">Current observation only</span>
        </div>
        <div className="observation-ai-action-grid">
          {ACTIONS.map((action) => (
            <button
              key={action.key}
              type="button"
              className="button button-secondary touch-target"
              disabled={busyAction !== null}
              onClick={() => void runAction(action.key)}
            >
              {busyAction === action.key ? "Writing…" : action.label}
            </button>
          ))}
          <button type="button" className="button button-secondary touch-target" disabled={!history.length || busyAction !== null} onClick={undoLastAiRewrite}>
            Undo Last AI Rewrite
          </button>
          <button type="button" className="button button-secondary touch-target" disabled={busyAction !== null} onClick={restoreOriginal}>
            Restore Original
          </button>
        </div>
        <p className="muted">Technician Notes are preserved separately. AI uses this observation, its supporting items, image descriptions, session context, and nearby observations.</p>
        {message ? <p className="success compact-success" aria-live="polite">{message}</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>
    </div>
  );
}
