/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState } from "react";
import type { ReportStudioProps } from "./types";
import { ReportStudioToolbar } from "./ReportStudioToolbar";
import { ReportTemplateDrawer } from "./ReportTemplateDrawer";
import { ReportPreviewCanvas } from "./ReportPreviewCanvas";
import { ReportControlPanel } from "./ReportControlPanel";
export function ReportStudioDesktop(props: ReportStudioProps & { state: any; handlers: any }) { const [open,setOpen]=useState(false); return <main className="rsv2-shell" data-report-studio-v2="desktop"><ReportStudioToolbar props={props} state={props.state} handlers={props.handlers} onTemplates={()=>setOpen(true)}/><div className="rsv2-body"><ReportPreviewCanvas brand={props.state.draftBrandProfile} session={props.state.selectedSession} activeSection={props.state.activeSection} setActiveSection={props.handlers.setActiveSection} assets={props}/><ReportControlPanel brand={props.state.draftBrandProfile} patchBrand={props.handlers.patchBrand} activeSection={props.state.activeSection} setActiveSection={props.handlers.setActiveSection}/></div>{open&&<ReportTemplateDrawer templates={props.templates} onClose={()=>setOpen(false)} onApply={(t:any)=>{props.handlers.applyTemplate(t,t.id);setOpen(false)}}/>}</main>; }
