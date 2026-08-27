 
"use client";
import { useEffect, useMemo, useState } from "react";
import { normalizeBrandProfile, type WorkspaceBrandProfile } from "@/features/branding/types";
import type { ReportStudioProps, ReportStudioSection } from "./types";
import { ReportStudioDesktop } from "./ReportStudioDesktop";
import { ReportStudioMobileLite } from "./ReportStudioMobileLite";

export function ReportStudioRoute(props: ReportStudioProps) {
  const [draftBrandProfile, setDraftBrandProfile] = useState<WorkspaceBrandProfile>(() => normalizeBrandProfile(props.profile));
  const [selectedSessionId, setSelectedSessionId] = useState(props.selectedSessionId ?? props.sessions[0]?.id ?? null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(props.templates.find((t) => t.is_default)?.id ?? null);
  const [selectedPaletteName, setSelectedPaletteName] = useState<string | null>(null);
  const [sessionSummaries, setSessionSummaries] = useState<Record<string, string | null>>(() => Object.fromEntries(props.sessions.map((session) => [session.id, session.report_summary ?? null])));
  const [activeSection, setActiveSection] = useState<ReportStudioSection>("header");
  const [isDirty, setIsDirty] = useState(false);
  const [isPhone, setIsPhone] = useState<boolean | null>(null);
  useEffect(() => { const mq = window.matchMedia("(max-width: 720px)"); const sync=()=>setIsPhone(mq.matches); sync(); mq.addEventListener("change", sync); return()=>mq.removeEventListener("change", sync); }, []);
  const selectedSession = useMemo(() => { const session = props.sessions.find((s) => s.id === selectedSessionId) ?? props.sessions[0] ?? null; if (!session) return null; const reportSummary = sessionSummaries[session.id] ?? session.report_summary ?? null; return { ...session, report_summary: reportSummary, snapshot: { ...session.snapshot, summary: reportSummary || session.snapshot.summary } }; }, [props.sessions, selectedSessionId, sessionSummaries]);
  const patchBrand = (next: WorkspaceBrandProfile) => { setDraftBrandProfile(normalizeBrandProfile(next)); setIsDirty(true); };
  const applyTemplate = (template: WorkspaceBrandProfile, id: string) => { const currentColors = draftBrandProfile.colors; const next = normalizeBrandProfile(template); const isSystemTemplate = id.startsWith("system:"); patchBrand(isSystemTemplate ? { ...next, colors: currentColors } : next); setSelectedTemplateId(id); if (!isSystemTemplate) setSelectedPaletteName(null); };
  const applyTemplateDefaultPalette = (template: WorkspaceBrandProfile, id: string) => { patchBrand(normalizeBrandProfile(template)); setSelectedTemplateId(id); setSelectedPaletteName(null); };
  const applyPalette = (name: string, colors: WorkspaceBrandProfile["colors"]) => { patchBrand({ ...draftBrandProfile, colors }); setSelectedPaletteName(name); };
  const state = { draftBrandProfile, selectedSessionId, selectedTemplateId, selectedPaletteName, activeSection, isDirty, selectedSession };
  const selectSession = (id: string) => { setSelectedSessionId(id); setIsDirty(true); };
  const updateSelectedSummary = (summary: string) => { if (!selectedSessionId) return; setSessionSummaries((current) => ({ ...current, [selectedSessionId]: summary || null })); };
  const handlers = { patchBrand, setSelectedSessionId: selectSession, setSelectedTemplateId, setActiveSection, setIsDirty, applyTemplate, applyTemplateDefaultPalette, applyPalette, updateSelectedSummary };
  if (isPhone === null) return null;
  if (isPhone) return <ReportStudioMobileLite {...props} state={state} handlers={handlers} />;
  return <ReportStudioDesktop {...props} state={state} handlers={handlers} />;
}
