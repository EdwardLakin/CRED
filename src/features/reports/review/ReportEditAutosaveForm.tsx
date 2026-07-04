"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { PendingActionButton } from "@/features/reports/review/PendingActionButton";

type ServerAction = (formData: FormData) => void | Promise<void>;
type SaveState = "saved" | "saving" | "failed" | "unsaved";

export function ReportEditAutosaveForm({
  action,
  children,
}: {
  action: ServerAction;
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<SaveState>("saved");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    document.dispatchEvent(new CustomEvent("report-autosave-status", { detail: { state } }));
  }, [state]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function scheduleAutosave(event: React.FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLElement;
    if (
      target.closest("[data-no-autosave]") ||
      target instanceof HTMLButtonElement
    ) {
      return;
    }
    setState("unsaved");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      const formData = new FormData(form);
      formData.set("autosave", "1");
      setState("saving");
      startTransition(async () => {
        try {
          await action(formData);
          setState("saved");
        } catch (error) {
          console.error("Report autosave failed", error);
          setState("failed");
        }
      });
    }, 1200);
  }

  const label = isPending || state === "saving"
    ? "Saving…"
    : state === "failed"
      ? "Failed to save"
      : state === "unsaved"
        ? "Unsaved changes"
        : "Saved";
  const className = state === "failed"
    ? "status-pill attention compact"
    : state === "saved"
      ? "status-pill success compact"
      : "status-pill neutral compact";

  return (
    <form
      ref={formRef}
      action={action}
      className="form-stack report-edit-form"
      onInput={scheduleAutosave}
      onChange={scheduleAutosave}
    >
      <div className="report-autosave-bar" aria-live="polite">
        <span className={className}>{label}</span>
        <span className="muted">Autosaves text, the executive summary, and section settings. Use explicit controls for approval, export, signatures, and deletes.</span>
      </div>
      {children}
      <div id="report-export-actions" className="form-actions report-inline-actions report-primary-flow report-manual-save-fallback">
        <PendingActionButton className="button button-secondary touch-target" pendingLabel="Saving edits…">
          Save now
        </PendingActionButton>
        <span className="muted">Manual fallback if autosave cannot complete.</span>
      </div>
    </form>
  );
}
