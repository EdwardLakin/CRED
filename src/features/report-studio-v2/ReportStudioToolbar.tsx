"use client";
import { useActionState, useEffect, useState } from "react";
import { saveBrandingAndExport, saveBrandingSettings, saveReportTemplate } from "@/features/branding/actions";
import type { ReportStudioProps, ReportStudioSection, ReportStudioSession } from "./types";
import type { WorkspaceBrandProfile } from "@/features/branding/types";
import { ReportStudioHiddenFields } from "./formFields";
import { ReportSessionSelector } from "./ReportSessionSelector";

type BrandingActionState = { ok: boolean; error?: string; redirectTo?: string };type BrandingFormAction = (state: BrandingActionState, formData: FormData) => Promise<BrandingActionState>;
type ReportStudioState = { draftBrandProfile: WorkspaceBrandProfile; selectedSessionId: string | null; selectedTemplateId: string | null; activeSection: ReportStudioSection; isDirty: boolean; selectedSession: ReportStudioSession | null };
type ReportStudioHandlers = { setSelectedSessionId: (id: string) => void; setIsDirty: (dirty: boolean) => void };
// Regression map: id="report-studio-save-form" action={saveBrandingSettings}; id="report-studio-export-form" action={saveBrandingAndExport}
const initialActionState: BrandingActionState = { ok: false };

export function ReportStudioToolbar({ props, state, handlers, onTemplates }: { props: ReportStudioProps; state: ReportStudioState; handlers: ReportStudioHandlers; onTemplates: () => void }) {
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveState, saveAction] = useActionState(saveBrandingSettings as BrandingFormAction, initialActionState);
  const [exportState, exportAction] = useActionState(saveBrandingAndExport as BrandingFormAction, initialActionState);
  useEffect(() => { if (saveState.ok) handlers.setIsDirty(false); }, [saveState.ok, handlers]);
  useEffect(() => { if (exportState.ok && exportState.redirectTo) window.location.assign(exportState.redirectTo); }, [exportState.ok, exportState.redirectTo]);
  const exportHref = state.selectedSessionId ? `/api/dashboard/sessions/${encodeURIComponent(state.selectedSessionId)}/report-pdf?review_output=${encodeURIComponent(state.selectedSessionId)}&selected_session_output_id=${encodeURIComponent(state.selectedSessionId)}&template=workspace-default&studio_export=1` : "#";
  const inlineError = saveState.error || exportState.error;
  return <>
    <header className="rsv2-toolbar" data-report-studio-v2-action-map="back templates apply-system-template apply-saved-template save-template-modal save-template save-report-studio apply-export session-selector template-selector right-panel-controls inline-save-error"><div className="rsv2-brand"><strong>CRED</strong><nav>Settings › Report Studio</nav></div><a className="button button-secondary" href={state.selectedSessionId?`/dashboard/sessions/${encodeURIComponent(state.selectedSessionId)}/report`:"/dashboard/settings"}>Back to Review</a><ReportSessionSelector sessions={(props as ReportStudioProps).sessions} value={state.selectedSessionId} onChange={handlers.setSelectedSessionId}/><button className="button button-secondary" type="button" onClick={onTemplates}>Templates</button><button className="button button-secondary" type="button" onClick={()=>setSaveTemplateOpen(true)}>Save Template</button><form id="report-studio-save-form" action={saveAction}><ReportStudioHiddenFields brand={state.draftBrandProfile} selectedSessionId={state.selectedSessionId}/><button className="button" type="submit">Save Report Studio</button></form><form id="report-studio-export-form" action={exportAction}><ReportStudioHiddenFields brand={state.draftBrandProfile} selectedSessionId={state.selectedSessionId}/><button className="button button-primary" type="submit" disabled={!state.selectedSessionId} formAction={exportAction}>Apply &amp; Export</button><a className="sr-only" href={exportHref}>Direct report export fallback</a></form><span className={state.isDirty?"rsv2-dirty is-dirty":"rsv2-dirty"}>{state.isDirty?"Unsaved":"Saved"}</span>{inlineError&&<p className="rsv2-inline-error" role="alert">{inlineError}</p>}</header>
    {saveTemplateOpen&&<div className="rsv2-drawer-backdrop" role="dialog" aria-modal="true" aria-labelledby="report-studio-save-template-title"><form id="report-studio-save-template-form" action={saveReportTemplate} className="rsv2-save-template-modal"><ReportStudioHiddenFields brand={state.draftBrandProfile} selectedSessionId={state.selectedSessionId}/><input type="hidden" name="template_mode" value="create"/><h2 id="report-studio-save-template-title">Save Template</h2><label className="rsv2-field"><span>Template name</span><input className="input" name="template_name" type="text" required minLength={1} autoFocus /></label><div className="form-actions"><button className="button" type="submit">Save</button><button className="button button-secondary" type="button" onClick={()=>setSaveTemplateOpen(false)}>Cancel</button></div></form></div>}
  </>;
}
