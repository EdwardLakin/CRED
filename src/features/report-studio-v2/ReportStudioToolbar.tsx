/* eslint-disable @typescript-eslint/no-explicit-any */
import { saveBrandingSettings, saveReportTemplate } from "@/features/branding/actions";
import { ReportStudioHiddenFields } from "./formFields";
import { ReportSessionSelector } from "./ReportSessionSelector";
import type { ReportStudioProps } from "./types";
export function ReportStudioToolbar({ props, state, handlers, onTemplates }: any) {
  const exportHref = state.selectedSessionId ? `/api/dashboard/sessions/${encodeURIComponent(state.selectedSessionId)}/report-pdf` : "#";
  return <header className="rsv2-toolbar"><div className="rsv2-brand"><strong>CRED</strong><nav>Settings › Report Studio</nav></div><ReportSessionSelector sessions={(props as ReportStudioProps).sessions} value={state.selectedSessionId} onChange={handlers.setSelectedSessionId}/><button className="button button-secondary" type="button" onClick={onTemplates}>Templates</button><form action={saveReportTemplate}><ReportStudioHiddenFields brand={state.draftBrandProfile} selectedSessionId={state.selectedSessionId}/><input type="hidden" name="template_name" value="Custom Report Studio Template"/><button className="button button-secondary" type="submit">Save Template</button></form><form action={saveBrandingSettings}><ReportStudioHiddenFields brand={state.draftBrandProfile} selectedSessionId={state.selectedSessionId}/><button className="button" type="submit">Save Report Studio</button></form><a className="button button-primary" href={exportHref} aria-disabled={!state.selectedSessionId}>Apply &amp; Export</a><span className={state.isDirty?"rsv2-dirty is-dirty":"rsv2-dirty"}>{state.isDirty?"Unsaved":"Saved"}</span></header>;
}
