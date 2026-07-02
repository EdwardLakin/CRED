/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState } from "react";
import { saveBrandingAndExport, saveBrandingSettings, saveReportTemplate } from "@/features/branding/actions";
import { ReportStudioHiddenFields } from "./formFields";
import { ReportSessionSelector } from "./ReportSessionSelector";
import type { ReportStudioProps } from "./types";

export function ReportStudioToolbar({ props, state, handlers, onTemplates }: any) {
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const selected = state.selectedSessionId ? encodeURIComponent(state.selectedSessionId) : "";
  const exportHref = selected ? `/api/dashboard/sessions/${selected}/report-pdf?review_output=${selected}&selected_session_output_id=${selected}&template=workspace-default&studio_export=1` : "#";
  return <>
    <header className="rsv2-toolbar" data-report-studio-v2-action-map="back templates apply-system-template apply-saved-template save-template-modal save-template save-report-studio apply-export session-selector template-selector right-panel-controls"><div className="rsv2-brand"><strong>CRED</strong><nav>Settings › Report Studio</nav></div><a className="button button-secondary" href={state.selectedSessionId?`/dashboard/sessions/${encodeURIComponent(state.selectedSessionId)}/report`:"/dashboard/settings"}>Back to Review</a><ReportSessionSelector sessions={(props as ReportStudioProps).sessions} value={state.selectedSessionId} onChange={handlers.setSelectedSessionId}/><button className="button button-secondary" type="button" onClick={onTemplates}>Templates</button><button className="button button-secondary" type="button" onClick={()=>setSaveTemplateOpen(true)}>Save Template</button><form id="report-studio-save-form" action={saveBrandingSettings}><ReportStudioHiddenFields brand={state.draftBrandProfile} selectedSessionId={state.selectedSessionId}/><button className="button" type="submit">Save Report Studio</button></form><form id="report-studio-export-form" action={saveBrandingAndExport}><ReportStudioHiddenFields brand={state.draftBrandProfile} selectedSessionId={state.selectedSessionId}/><button className="button button-primary" type="submit" disabled={!state.selectedSessionId} formAction={saveBrandingAndExport}>Apply &amp; Export</button><a className="sr-only" href={exportHref}>Direct report export fallback</a></form><span className={state.isDirty?"rsv2-dirty is-dirty":"rsv2-dirty"}>{state.isDirty?"Unsaved":"Saved"}</span></header>
    {saveTemplateOpen&&<div className="rsv2-drawer-backdrop" role="dialog" aria-modal="true" aria-labelledby="report-studio-save-template-title"><form id="report-studio-save-template-form" action={saveReportTemplate} className="rsv2-save-template-modal"><ReportStudioHiddenFields brand={state.draftBrandProfile} selectedSessionId={state.selectedSessionId}/><input type="hidden" name="template_mode" value="create"/><h2 id="report-studio-save-template-title">Save Template</h2><label className="rsv2-field"><span>Template name</span><input className="input" name="template_name" type="text" required minLength={1} autoFocus /></label><div className="form-actions"><button className="button" type="submit">Save</button><button className="button button-secondary" type="button" onClick={()=>setSaveTemplateOpen(false)}>Cancel</button></div></form></div>}
  </>;
}
