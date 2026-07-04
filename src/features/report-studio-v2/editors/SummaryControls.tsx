"use client";
import { useActionState, useEffect } from "react";
import { saveReportSummaryFromStudio, type SaveReportSummaryState } from "@/features/reports/actions";
import type { ReportStudioSession } from "../types";

const initialState: SaveReportSummaryState = { ok: false };

export function SummaryControls({ session, onSaved }: { session: ReportStudioSession | null; onSaved?: (summary: string) => void }) {
  const [state, action] = useActionState(saveReportSummaryFromStudio, initialState);

  useEffect(() => { if (state.ok) onSaved?.(state.summary ?? ""); }, [state, onSaved]);

  return <section className="form-stack" data-report-summary-source="ai_report_drafts.summary">
    <p className="muted">This edits the canonical customer-facing Executive Summary used by Review, Report Studio preview, and PDF export. Empty summaries remain editable; export falls back only when no saved summary exists.</p>
    <form action={action} className="form-stack">
      <input type="hidden" name="session_id" value={session?.id ?? ""} />
      <label className="rsv2-field"><span>Executive Summary</span><textarea key={session?.id ?? "no-session"} className="input" name="report_summary" rows={10} defaultValue={session?.report_summary ?? ""} placeholder="Enter the customer-facing executive summary." /></label>
      <button className="button button-primary" type="submit" disabled={!session?.id}>Save Summary</button>
    </form>
    {state.ok&&<p className="rsv2-inline-success" role="status">Executive summary saved.</p>}
    {state.error&&<p className="rsv2-inline-error" role="alert">{state.error}</p>}
  </section>;
}
