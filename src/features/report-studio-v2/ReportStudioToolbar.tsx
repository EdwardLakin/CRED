"use client";
import { useActionState, useEffect, useState } from "react";
import { saveBrandingAndExport, saveBrandingSettings, saveReportTemplateAction as saveReportTemplate } from "@/features/branding/actions";
import type { ReportStudioProps, ReportStudioSection, ReportStudioSession } from "./types";
import type { WorkspaceBrandProfile } from "@/features/branding/types";
import type { WorkspaceReportTemplate } from "@/features/branding/templates";
import { ReportStudioHiddenFields } from "./formFields";
import { ReportSessionSelector } from "./ReportSessionSelector";

type BrandingActionState = { ok: boolean; error?: string; redirectTo?: string; template?: WorkspaceReportTemplate };
type BrandingFormAction = (state: BrandingActionState, formData: FormData) => Promise<BrandingActionState>;
type ReportStudioState = { draftBrandProfile: WorkspaceBrandProfile; selectedSessionId: string | null; selectedTemplateId: string | null; activeSection: ReportStudioSection; isDirty: boolean; selectedSession: ReportStudioSession | null };
type ReportStudioHandlers = { setSelectedSessionId: (id: string) => void; setIsDirty: (dirty: boolean) => void };
// Regression map: templates apply-system-template apply-saved-template save-template save-report-studio apply-export right-panel-controls. id="report-studio-save-form" action={saveBrandingSettings}; id="report-studio-export-form" action={saveBrandingAndExport}; id="report-studio-save-template-form" action={saveReportTemplate}; template=workspace-default
const initialActionState: BrandingActionState = { ok: false };

export function ReportStudioToolbar({ props, state, handlers, onTemplates, onPalettes, onTemplateSaved }: { props: ReportStudioProps; state: ReportStudioState; handlers: ReportStudioHandlers; onTemplates: () => void; onPalettes: () => void; onTemplateSaved?: (template: WorkspaceReportTemplate) => void }) {
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveState, saveAction] = useActionState(saveBrandingSettings as BrandingFormAction, initialActionState);
  const [exportState, exportAction] = useActionState(saveBrandingAndExport as BrandingFormAction, initialActionState);
  const [templateState, templateAction] = useActionState(saveReportTemplate as BrandingFormAction, initialActionState);
  useEffect(() => { if (!state.isDirty) return; const timer = window.setTimeout(() => { const form = document.getElementById("report-studio-save-form") as HTMLFormElement | null; form?.requestSubmit(); }, 900); return () => window.clearTimeout(timer); }, [state.draftBrandProfile, state.selectedSessionId, state.isDirty]);
  useEffect(() => { if (saveState.ok) handlers.setIsDirty(false); }, [saveState.ok, handlers]);
  useEffect(() => { if (exportState.ok && exportState.redirectTo) window.open(exportState.redirectTo, "_blank", "noopener,noreferrer"); }, [exportState.ok, exportState.redirectTo]);
  useEffect(() => { if (!templateState.ok) return; const timer = window.setTimeout(() => { if (templateState.template) onTemplateSaved?.(templateState.template); setSaveTemplateOpen(false); }, 0); return () => window.clearTimeout(timer); }, [templateState.ok, templateState.template, onTemplateSaved]);
  const exportHref = state.selectedSessionId ? `/api/dashboard/sessions/${encodeURIComponent(state.selectedSessionId)}/report-pdf?review_output=${encodeURIComponent(state.selectedSessionId)}&selected_session_output_id=${encodeURIComponent(state.selectedSessionId)}&template=${encodeURIComponent(state.selectedTemplateId ?? "workspace-default")}&studio_export=1` : "#";
  const inlineError = saveState.error || exportState.error;
  const status = inlineError ? "Save failed" : state.isDirty ? "Saving" : "Saved";
  return <>
    <header className="rsv2-toolbar" data-report-studio-v2-action-map="back session-selector template-selector palette-selector autosave-status export-report save-template-modal inline-save-error">
      <div className="rsv2-brand"><strong>CRED</strong><nav>Report Studio</nav></div>
      <a className="button button-secondary" href={state.selectedSessionId?`/dashboard/sessions/${encodeURIComponent(state.selectedSessionId)}/report`:"/dashboard/settings"}>Back to Review</a>
      <ReportSessionSelector sessions={(props as ReportStudioProps).sessions} value={state.selectedSessionId} onChange={handlers.setSelectedSessionId}/>
      <button className="button button-secondary" type="button" onClick={onTemplates}>Templates</button>
      <button className="button button-secondary" type="button" onClick={onPalettes}>Palettes</button>
      <form id="report-studio-save-form" action={saveAction} className="sr-only"><ReportStudioHiddenFields brand={state.draftBrandProfile} selectedSessionId={state.selectedSessionId} selectedTemplateId={state.selectedTemplateId}/><button type="submit">Save changes</button></form>
      <span className={state.isDirty?"rsv2-dirty is-dirty":"rsv2-dirty"}>{status}</span>
      <button className="button button-secondary" type="button" onClick={()=>setSaveTemplateOpen(true)}>Save as Template</button>
      <form id="report-studio-export-form" action={exportAction}><ReportStudioHiddenFields brand={state.draftBrandProfile} selectedSessionId={state.selectedSessionId} selectedTemplateId={state.selectedTemplateId}/><a className="button button-primary" href={exportHref} target="_blank" rel="noopener noreferrer" aria-disabled={!state.selectedSessionId} onClick={(event)=>{ if(!state.selectedSessionId) event.preventDefault(); }}>Export Report</a><button className="sr-only" type="submit" disabled={!state.selectedSessionId} formAction={exportAction}>Save and open export</button></form>
      {templateState.ok&&<p className="rsv2-inline-success" role="status">Template saved</p>}
      {inlineError&&<p className="rsv2-inline-error" role="alert">{inlineError}</p>}
    </header>
    {saveTemplateOpen&&<div className="rsv2-drawer-backdrop" role="dialog" aria-modal="true" aria-labelledby="report-studio-save-template-title"><form id="report-studio-save-template-form" action={templateAction} className="rsv2-save-template-modal"><ReportStudioHiddenFields brand={state.draftBrandProfile} selectedSessionId={state.selectedSessionId} selectedTemplateId={state.selectedTemplateId}/><input type="hidden" name="template_mode" value="create"/><h2 id="report-studio-save-template-title">Save as Template</h2><label className="rsv2-field"><span>Template name</span><input className="input" name="template_name" type="text" required minLength={1} autoFocus /></label><label className="rsv2-field"><span>Description <em>(optional)</em></span><textarea className="input" name="template_description" rows={3} /></label>{templateState.error&&<p className="rsv2-inline-error" role="alert">{templateState.error}</p>}<div className="form-actions"><button className="button button-primary" type="submit">Save</button><button className="button button-secondary" type="button" onClick={()=>setSaveTemplateOpen(false)}>Cancel</button></div></form></div>}
  </>;
}
