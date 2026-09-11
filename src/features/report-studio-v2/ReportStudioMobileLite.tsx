"use client";
import { useActionState, useEffect, useState } from 'react';
import { saveBrandingSettings } from '@/features/branding/actions';
import { saveReportStudioDraftAndExport } from './exportAction';
import type { WorkspaceBrandProfile } from '@/features/branding/types';
import type { ReportStudioProps, ReportStudioSection, ReportStudioSession } from './types';
import { ReportStudioHiddenFields } from './formFields';
import { ReportSessionSelector } from './ReportSessionSelector';
import { ReportTemplateDrawer } from './ReportTemplateDrawer';
import { ReportPreviewCanvas } from './ReportPreviewCanvas';
type BrandingActionState = { ok: boolean; error?: string; redirectTo?: string };
type BrandingFormAction = (state: BrandingActionState, formData: FormData) => Promise<BrandingActionState>;
type ReportStudioState = { draftBrandProfile: WorkspaceBrandProfile; selectedSessionId: string | null; selectedTemplateId: string | null; activeSection: ReportStudioSection; isDirty: boolean; selectedSession: ReportStudioSession | null };
type ReportStudioHandlers = { patchBrand: (brand: WorkspaceBrandProfile) => void; setSelectedSessionId: (id: string) => void; setActiveSection: (section: ReportStudioSection) => void; setIsDirty: (dirty: boolean) => void; applyTemplate: (template: WorkspaceBrandProfile, id: string) => void };
type MobileLiteProps = ReportStudioProps & { state: ReportStudioState; handlers: ReportStudioHandlers };
const initialActionState: BrandingActionState = { ok: false };
export function ReportStudioMobileLite(props:MobileLiteProps){
  const [drawer,setDrawer]=useState(false);
  const [saveState,saveAction]=useActionState(saveBrandingSettings as BrandingFormAction,initialActionState);
  const [exportState,exportAction]=useActionState(saveReportStudioDraftAndExport as BrandingFormAction,initialActionState);
  useEffect(()=>{if(saveState.ok)props.handlers.setIsDirty(false)},[saveState.ok,props.handlers]);
  useEffect(()=>{if(exportState.ok&&exportState.redirectTo)window.location.assign(exportState.redirectTo)},[exportState.ok,exportState.redirectTo]);
  const b=props.state.draftBrandProfile,rs=b.report_style,p=props.handlers.patchBrand;
  const inlineError=saveState.error||exportState.error;
  return <main className="rsv2-mobile" data-report-studio-v2="mobile-lite"><h1>Report Studio Lite</h1><p>Lite editor on mobile. Use desktop or tablet for full Report Studio controls.</p>{inlineError&&<p className="rsv2-inline-error" role="alert">{inlineError}</p>}<a className="button button-secondary" href={props.state.selectedSessionId?`/dashboard/sessions/${encodeURIComponent(props.state.selectedSessionId)}/report`:"/dashboard/settings"}>Back to Review</a><ReportSessionSelector sessions={props.sessions} value={props.state.selectedSessionId} onChange={props.handlers.setSelectedSessionId}/><button type="button" className="button button-secondary" onClick={()=>setDrawer(true)}>Template selector</button><label className="rsv2-field"><span>Primary color</span><input type="color" value={b.colors.primary} onChange={(e)=>p({...b,colors:{...b.colors,primary:e.target.value}})}/></label><label className="rsv2-field"><span>Accent color</span><input type="color" value={b.colors.accent} onChange={(e)=>p({...b,colors:{...b.colors,accent:e.target.value}})}/></label><label className="rsv2-check"><input type="checkbox" checked={rs.coverPage!=='none'} onChange={(e)=>p({...b,report_style:{...rs,coverPage:e.target.checked?'simple_cover':'none'}})}/><span>Cover on/off</span></label><label className="rsv2-field"><span>Item layout</span><select value={rs.evidenceStyle} onChange={(e)=>p({...b,report_style:{...rs,evidenceStyle:e.target.value as typeof rs.evidenceStyle}})}><option value="standard_cards">Standard</option><option value="full_width_photos">Full width</option><option value="carded">Carded</option></select></label><form id="report-studio-mobile-save-form" action={saveAction}><ReportStudioHiddenFields brand={b} selectedSessionId={props.state.selectedSessionId} selectedTemplateId={props.state.selectedTemplateId}/><button className="button" type="submit">Save Report Studio</button></form><form id="report-studio-mobile-export-form" action={exportAction}><ReportStudioHiddenFields brand={b} selectedSessionId={props.state.selectedSessionId} selectedTemplateId={props.state.selectedTemplateId}/><input type="hidden" name="session_id" value={props.state.selectedSessionId ?? ""}/><input type="hidden" name="report_summary" value={props.state.selectedSession?.report_summary ?? ""}/><button className="button button-primary" type="submit" disabled={!props.state.selectedSessionId}>Apply &amp; Export</button></form><ReportPreviewCanvas brand={b} session={props.state.selectedSession} activeSection={props.state.activeSection} setActiveSection={props.handlers.setActiveSection} assets={props}/>{drawer&&<ReportTemplateDrawer baseBrand={b} templates={props.templates} onClose={()=>setDrawer(false)} onApply={(template:WorkspaceBrandProfile,presetId?:string)=>{const id=presetId ?? template.id;if(id)props.handlers.applyTemplate(template,id);setDrawer(false)}} onApplyPalette={()=>{}}/>}</main>;
}
