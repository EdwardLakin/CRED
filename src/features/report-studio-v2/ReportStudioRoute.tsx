 
"use client";
import { useEffect, useMemo, useState } from "react";
import { normalizeBrandProfile, type WorkspaceBrandProfile } from "@/features/branding/types";
import type { ReportStudioProps, ReportStudioSection } from "./types";
import { ReportStudioDesktop } from "./ReportStudioDesktop";
import { ReportStudioMobileLite } from "./ReportStudioMobileLite";

export function ReportStudioRoute(props: ReportStudioProps) {
  const [draftBrandProfile, setDraftBrandProfile] = useState<WorkspaceBrandProfile>(() => normalizeBrandProfile(props.profile));
  const [selectedSessionId, setSelectedSessionId] = useState(props.selectedSessionId ?? props.sessions[0]?.id ?? null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ReportStudioSection>("header");
  const [isDirty, setIsDirty] = useState(false);
  const [isPhone, setIsPhone] = useState<boolean | null>(null);
  useEffect(() => { const mq = window.matchMedia("(max-width: 720px)"); const sync=()=>setIsPhone(mq.matches); sync(); mq.addEventListener("change", sync); return()=>mq.removeEventListener("change", sync); }, []);
  const selectedSession = useMemo(() => props.sessions.find((s) => s.id === selectedSessionId) ?? props.sessions[0] ?? null, [props.sessions, selectedSessionId]);
  const patchBrand = (next: WorkspaceBrandProfile) => { setDraftBrandProfile(normalizeBrandProfile(next)); setIsDirty(true); };
  const applyTemplate = (template: WorkspaceBrandProfile, id: string) => { patchBrand(normalizeBrandProfile(template)); setSelectedTemplateId(id); };
  const state = { draftBrandProfile, selectedSessionId, selectedTemplateId, activeSection, isDirty, selectedSession };
  const handlers = { patchBrand, setSelectedSessionId, setSelectedTemplateId, setActiveSection, setIsDirty, applyTemplate };
  if (isPhone === null) return null;
  if (isPhone) return <ReportStudioMobileLite {...props} state={state} handlers={handlers} />;
  return <ReportStudioDesktop {...props} state={state} handlers={handlers} />;
}
