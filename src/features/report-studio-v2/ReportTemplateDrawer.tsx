/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState } from "react";
import { setDefaultReportTemplate } from "@/features/branding/actions";
import { BRAND_PALETTES, COLOR_LABELS } from "@/features/branding/types";
import { BUILT_IN_REPORT_PRESETS, applyBuiltInReportPreset } from "@/features/branding/report-presets";

type DrawerMode = "templates" | "palettes";
type TemplateTab = "system" | "saved";

export function ReportTemplateDrawer({ templates, baseBrand, onClose, onApply, onApplyPalette, defaultTemplateId, mode = "templates" }: any) {
  const drawerMode = mode as DrawerMode;
  const [tab, setTab] = useState<TemplateTab>("system");
  const saved = templates ?? [];
  const title = drawerMode === "palettes" ? "Color Palettes" : "Templates";
  return <div className="rsv2-drawer-backdrop"><aside className="rsv2-drawer" data-scrollable="ipad-safari">
    <div className="rsv2-drawer-head"><div><p className="eyebrow">Design library</p><h2>{title}</h2></div><button type="button" className="button button-secondary" onClick={onClose}>Close</button></div>
    {drawerMode === "templates" && <>
      <div className="rsv2-drawer-tabs" role="tablist" aria-label="Template drawer sections"><button type="button" role="tab" aria-selected={tab === "system"} onClick={() => setTab("system")}>Built-in Templates</button><button type="button" role="tab" aria-selected={tab === "saved"} onClick={() => setTab("saved")}>Saved Templates</button></div>
      {tab === "system" && <section><h3>Built-in Templates</h3><p className="muted">Choose a complete presentation in one click. Your company identity and current colors are preserved; customize any setting after applying it.</p>{BUILT_IN_REPORT_PRESETS.map((preset) => { const template = applyBuiltInReportPreset(baseBrand, preset.id); return <article key={preset.id} className="rsv2-template-row"><div><b>{preset.name}</b><span>{preset.description}</span></div><button type="button" className="button" onClick={() => onApply(template, preset.id)}>Apply template</button></article>; })}</section>}
      {tab === "saved" && <section><h3>Saved Templates</h3>{saved.length ? saved.map((t:any) => <article key={t.id} className={t.is_default || t.id === defaultTemplateId ? "rsv2-template-row is-default" : "rsv2-template-row"}><div><b>{t.name}</b>{(t.is_default || t.id === defaultTemplateId) && <span className="status-pill">Default</span>}<span>{t.description ?? "Custom saved template"}</span></div><div className="form-actions"><button type="button" className="button" onClick={() => onApply(t, t.id)}>Apply</button><form action={setDefaultReportTemplate.bind(null, t.id)}><button type="submit" className="button button-secondary">Set as default</button></form></div></article>) : <p>No saved custom templates yet. Save the current draft as a template to add one here.</p>}</section>}
    </>}
    {drawerMode === "palettes" && <section><h3>Palettes</h3><p className="muted">Palette changes affect colors only and keep the current report layout.</p><div className="palette-grid">{BRAND_PALETTES.map((p:any) => <button type="button" className="palette-card" key={p.name} onClick={() => onApplyPalette(p.name, p.colors)}><strong>{p.name}</strong><span>{p.description}</span><span className="swatches">{Object.keys(COLOR_LABELS).map((key) => <i key={key} style={{ background: p.colors[key as keyof typeof p.colors] }} />)}</span></button>)}</div></section>}
  </aside></div>;
}
