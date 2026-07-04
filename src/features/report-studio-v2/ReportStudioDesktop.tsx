/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState } from "react";
import type { ReportStudioProps } from "./types";
import { ReportStudioToolbar } from "./ReportStudioToolbar";
import { ReportTemplateDrawer } from "./ReportTemplateDrawer";
import { ReportPreviewCanvas } from "./ReportPreviewCanvas";
import { ReportControlPanel } from "./ReportControlPanel";

type DrawerMode = "templates" | "palettes";

export function ReportStudioDesktop(props: ReportStudioProps & { state: any; handlers: any }) {
  const [drawerMode,setDrawerMode]=useState<DrawerMode|null>(null);
  const [savedTemplates,setSavedTemplates]=useState<any[]>(props.templates ?? []);
  const openTemplates=()=>setDrawerMode("templates");
  const openPalettes=()=>setDrawerMode("palettes");
  const upsertSavedTemplate=(template:any)=>setSavedTemplates((current)=>[template,...current.filter((t:any)=>t.id!==template.id)]);
  return <main className="rsv2-shell" data-report-studio-v2="desktop"><ReportStudioToolbar props={props} state={props.state} handlers={props.handlers} onTemplates={openTemplates} onPalettes={openPalettes} onTemplateSaved={upsertSavedTemplate}/><div className="rsv2-body"><ReportPreviewCanvas brand={props.state.draftBrandProfile} session={props.state.selectedSession} activeSection={props.state.activeSection} setActiveSection={props.handlers.setActiveSection} assets={props}/><ReportControlPanel brand={props.state.draftBrandProfile} patchBrand={props.handlers.patchBrand} activeSection={props.state.activeSection} setActiveSection={props.handlers.setActiveSection} session={props.state.selectedSession} onSummarySaved={props.handlers.updateSelectedSummary}/></div>{drawerMode&&<ReportTemplateDrawer mode={drawerMode} templates={savedTemplates} onClose={()=>setDrawerMode(null)} onApply={(t:any,id?:string)=>{props.handlers.applyTemplate(t,id??t.id);setDrawerMode(null)}} onApplyDefaultPalette={(t:any,id?:string)=>{props.handlers.applyTemplateDefaultPalette(t,id??t.id);setDrawerMode(null)}} onApplyPalette={(name:string,colors:any)=>props.handlers.applyPalette(name,colors)} defaultTemplateId={savedTemplates.find((t:any)=>t.is_default)?.id ?? null}/>}</main>;
}
