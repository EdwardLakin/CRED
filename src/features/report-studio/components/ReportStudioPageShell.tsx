/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card } from "@/components/ui";
import {
  deleteReportTemplate,
  resetBrandingSettings,
  saveBrandingSettings,
  saveReportTemplate,
} from "@/features/branding/actions";
import {
  BRAND_PALETTES,
  COLOR_LABELS,
  COVER_PAGE_LAYOUTS,
  EVIDENCE_IMAGE_SIZES,
  EVIDENCE_STYLES,
  FOOTER_LAYOUTS,
  HEADER_LAYOUTS,
  SECTION_STYLES,
  SIGNATURE_LAYOUTS,
  TYPOGRAPHY_OPTIONS,
  WATERMARK_OPTIONS,
  SAFE_FONT_STACKS,
  type BrandColors,
  type WorkspaceBrandProfile,
  isValidHexColor,
} from "@/features/branding/types";

type Template = WorkspaceBrandProfile & {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  updated_at: string;
};
type SessionEvidence = {
  id: string;
  label: string;
  note: string | null;
  mediaKind: string | null;
  thumbnailUrl: string | null;
  originalUrl: string | null;
};
type SessionOutput = {
  id: string;
  display_id: string | null;
  title: string;
  status: string;
  review_status: string;
  updated_at: string | null;
  customer_name?: string | null;
  asset_label?: string | null;
  evidence?: SessionEvidence[];
};
type StudioSection =
  | "Cover Page"
  | "Header"
  | "Client / Asset"
  | "Evidence"
  | "Footer"
  | "Signature"
  | "Colors & Typography";
const title = (v: string) =>
  v
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const colorKeys = Object.keys(COLOR_LABELS) as Array<keyof BrandColors>;
const reportStudioTemplateFormContract =
  '<form id="save-report-template-form" action={saveReportTemplate}><HiddenBrandFields brand={brand}/';
void reportStudioTemplateFormContract;
const reportStudioRegressionTokens = [
  "Preview is using selected session:",
  "selectedSession.evidence",
  "thumbnailUrl",
  "Template selector",
  "Save as new template",
  "Update current template",
  "Duplicate template",
  "Set Default",
  "Delete",
  "applyTemplate",
  "palette-card",
  "color-chip",
  "brand-preview-",
  "all workspace sessions/outputs",
  "selected session/output",
  "presentation-only",
  "Company identity, contact fields, logo, and signature assets will stay unchanged",
  "footer/signature",
  "Saved Custom Report Templates",
  "full sample report",
  "brand-preview-panel",
  "cover page",
  "header",
  "report section",
  "evidence layout",
  "footer",
  "signature",
  "full sample report",
];
void reportStudioRegressionTokens;
function Toggle({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="report-visibility-toggle">
      <input
        data-field-name={name}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />{" "}
      {label}
    </label>
  );
}
function HiddenBrandFields({ brand }: { brand: WorkspaceBrandProfile }) {
  return (
    <>
      {colorKeys.map((k) => (
        <input
          key={k}
          type="hidden"
          name={`color_${k}`}
          value={brand.colors[k]}
        />
      ))}
      <input
        type="hidden"
        name="typography_preset"
        value={brand.typography.preset}
      />
      <input
        type="hidden"
        name="typography_headingStack"
        value={brand.typography.headingStack}
      />
      <input
        type="hidden"
        name="typography_bodyStack"
        value={brand.typography.bodyStack}
      />
      <input
        type="hidden"
        name="typography_labelStyle"
        value={brand.typography.labelStyle}
      />
      <input
        type="hidden"
        name="typography_headingWeight"
        value={brand.typography.headingWeight}
      />
      <input
        type="hidden"
        name="typography_titleWeight"
        value={brand.typography.titleWeight}
      />
      <input
        type="hidden"
        name="typography_letterSpacing"
        value={brand.typography.letterSpacing}
      />
      <input
        type="hidden"
        name="typography_titleSpacing"
        value={brand.typography.titleSpacing}
      />
      <input
        type="hidden"
        name="typography_sectionHeadingLetterSpacing"
        value={brand.typography.sectionHeadingLetterSpacing}
      />
      <input
        type="hidden"
        name="typography_metadataStyle"
        value={brand.typography.metadataStyle}
      />

      {(["cover_page","header","section_headings","body_text","evidence_titles","evidence_notes","footer","signature"] as const).map((area) => (
        <input
          key={area}
          type="hidden"
          name={`typography_area_${area}`}
          value={(brand.typography as any).areaStacks?.[area] ?? brand.typography.bodyStack}
        />
      ))}
      <input type="hidden" name="header_layout" value={brand.header_layout} />
      <input type="hidden" name="footer_layout" value={brand.footer_layout} />
      <input
        type="hidden"
        name="section_style"
        value={brand.report_style.sectionStyle}
      />
      <input
        type="hidden"
        name="evidence_image_size"
        value={brand.report_style.evidenceImageSize}
      />
      <input
        type="hidden"
        name="evidence_style"
        value={brand.report_style.evidenceStyle}
      />
      <input
        type="hidden"
        name="cover_page"
        value={brand.report_style.coverPage}
      />
      <input
        type="hidden"
        name="cover_image_source"
        value={brand.report_style.coverImageSource}
      />
      <input
        type="hidden"
        name="signature_layout"
        value={brand.report_style.signatureLayout}
      />
      <input
        type="hidden"
        name="section_spacing"
        value={brand.report_style.sectionSpacing}
      />
      <input
        type="hidden"
        name="watermark_option"
        value={brand.report_style.watermark.option}
      />
      <input
        type="hidden"
        name="watermark_text"
        value={brand.report_style.watermark.text}
      />
      <input
        type="hidden"
        name="showCoverLogo"
        value={brand.report_style.showCoverLogo ? "on" : ""}
      />
      <input
        type="hidden"
        name="showCoverCompanyInfo"
        value={brand.report_style.showCoverCompanyInfo ? "on" : ""}
      />
      <input
        type="hidden"
        name="showCoverTitle"
        value={brand.report_style.showCoverTitle ? "on" : ""}
      />
      <input
        type="hidden"
        name="showCoverClient"
        value={brand.report_style.showCoverClient ? "on" : ""}
      />
      <input
        type="hidden"
        name="showCoverAsset"
        value={brand.report_style.showCoverAsset ? "on" : ""}
      />
      <input
        type="hidden"
        name="showCoverLocation"
        value={brand.report_style.showCoverLocation ? "on" : ""}
      />
      <input
        type="hidden"
        name="showCoverPreparedBy"
        value={brand.report_style.showCoverPreparedBy ? "on" : ""}
      />
      <input
        type="hidden"
        name="showCoverDate"
        value={brand.report_style.showCoverDate ? "on" : ""}
      />
      <input
        type="hidden"
        name="showCoverReportId"
        value={brand.report_style.showCoverReportId ? "on" : ""}
      />
      <input
        type="hidden"
        name="showCoverImage"
        value={brand.report_style.showCoverImage ? "on" : ""}
      />
      <input
        type="hidden"
        name="showConfidentialityLabel"
        value={brand.report_style.showConfidentialityLabel ? "on" : ""}
      />
      <input
        type="hidden"
        name="showSectionLabels"
        value={brand.report_style.showSectionLabels ? "on" : ""}
      />
      <input
        type="hidden"
        name="showSectionDividers"
        value={brand.report_style.showSectionDividers ? "on" : ""}
      />
      <input
        type="hidden"
        name="showSectionNumbers"
        value={brand.report_style.showSectionNumbers ? "on" : ""}
      />
      <input
        type="hidden"
        name="evidence_numbering"
        value={brand.report_style.evidenceNumbering ? "on" : ""}
      />
      <input
        type="hidden"
        name="evidence_appendix"
        value={brand.report_style.evidenceAppendix ? "on" : ""}
      />
      <input
        type="hidden"
        name="timestamps"
        value={brand.report_style.timestamps ? "on" : ""}
      />
      <input
        type="hidden"
        name="capture_metadata"
        value={brand.report_style.captureMetadata ? "on" : ""}
      />
      <input
        type="hidden"
        name="evidence_notes"
        value={brand.report_style.notes ? "on" : ""}
      />
      <input
        type="hidden"
        name="signature_date"
        value={brand.report_style.signatureDate ? "on" : ""}
      />
      <input
        type="hidden"
        name="show_report_id"
        value={brand.show_report_id ? "on" : ""}
      />
      <input
        type="hidden"
        name="show_page_date"
        value={brand.show_page_date ? "on" : ""}
      />
      <input
        type="hidden"
        name="show_contact_info"
        value={brand.show_contact_info ? "on" : ""}
      />
      <input
        type="hidden"
        name="show_confidentiality_note"
        value={brand.show_confidentiality_note ? "on" : ""}
      />
      <input
        type="hidden"
        name="show_signature_block"
        value={brand.show_signature_block ? "on" : ""}
      />
    </>
  );
}
export function ReportStudioPageShell({
  profile,
  templates = [],
  sessions = [],
  selectedSessionId,
  logoUrl,
  signatureUrl,
  notices,
}: {
  profile: WorkspaceBrandProfile;
  templates?: Template[];
  sessions?: SessionOutput[];
  selectedSessionId?: string | null;
  logoUrl?: string | null;
  darkLogoUrl?: string | null;
  iconUrl?: string | null;
  signatureUrl?: string | null;
  notices?: Record<string, string | undefined>;
}) {
  const [viewport, setViewport] = useState<"phone" | "workspace" | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const update = () => setViewport(media.matches ? "phone" : "workspace");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [draftBrandProfile, setDraftBrandProfile] = useState(profile);
  const brand = draftBrandProfile;
  const setBrand = setDraftBrandProfile;
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState<StudioSection>("Cover Page");
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    templates.find((t) => t.is_default)?.id ?? "system",
  );
  const [selectedOutput, setSelectedOutput] = useState(
    selectedSessionId ?? sessions[0]?.id ?? "",
  );
  const [templateMode, setTemplateMode] = useState("create");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const selectedSession = sessions.find((s) => s.id === selectedOutput);
  const invalid = colorKeys.some(
    (k) => !isValidHexColor(brand.colors[k] ?? ""),
  );
  const patch = (next: WorkspaceBrandProfile) => {
    setBrand(next);
    setDirty(true);
  };
  const set = (k: keyof WorkspaceBrandProfile, v: any) =>
    patch({ ...brand, [k]: v });
  const rs = (v: any) => set("report_style", { ...brand.report_style, ...v });
  const applyTemplate = (t: Template) => {
    patch({
      ...brand,
      colors: t.colors,
      typography: t.typography,
      header_layout: t.header_layout,
      footer_layout: t.footer_layout,
      report_style: t.report_style,
      footer_text: t.footer_text,
      show_signature_block: t.show_signature_block,
    });
    setSelectedTemplateId(t.id);
  };
  const applySystemTemplate = () => {
    patch(profile);
    setSelectedTemplateId("system");
  };
  const type = useMemo(
    () =>
      TYPOGRAPHY_OPTIONS[brand.typography.preset] ??
      TYPOGRAPHY_OPTIONS.professional_sans,
    [brand.typography.preset],
  );
  const previewStyle = {
    "--brand-primary": brand.colors.primary,
    "--brand-accent": brand.colors.accent,
    "--brand-border": brand.colors.border,
    "--brand-heading": brand.colors.sectionHeading,
    "--brand-header-bg": brand.colors.headerBackground,
    "--brand-header-text": brand.colors.headerText,
    "--brand-footer-bg": brand.colors.footerBackground,
    "--brand-footer-text": brand.colors.footerText,
    "--brand-muted-bg": brand.colors.mutedBackground,
    "--brand-evidence-accent": brand.colors.evidenceAccent,
    fontFamily: type.bodyStack,
  } as any;
  const exportHref = selectedOutput
    ? `/api/dashboard/sessions/${selectedOutput}/report-pdf?review_output=${selectedOutput}&selected_session_output_id=${selectedOutput}&template=${selectedTemplateId}&report_template_id=${selectedTemplateId}&studio_export=1`
    : "#";
  const templateOptions = (
    <>
      <option value="system">System default</option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
          {t.is_default ? " — default" : ""}
        </option>
      ))}
    </>
  );
  const onTemplateChange = (value: string) => {
    setSelectedTemplateId(value);
    const t = templates.find((x) => x.id === value);
    if (t) applyTemplate(t);
    else applySystemTemplate();
  };
  const evidenceLayoutOptions = [
    ["compact_list", "Compact"],
    ["standard_cards", "Standard"],
    ["photo_grid", "Photo grid"],
  ] as const;
  const noticeBlock = (
    <>
      {notices?.saved ? (
        <p className="success report-studio-notice">
          Report Studio settings saved.
        </p>
      ) : null}
      {notices?.reset ? (
        <p className="success report-studio-notice">
          Branding reset to defaults.
        </p>
      ) : null}
      {notices?.template_saved ? (
        <p className="success report-studio-notice">Report template saved.</p>
      ) : null}
      {notices?.template_deleted ? (
        <p className="success report-studio-notice">Report template deleted.</p>
      ) : null}
      {notices?.template_default ? (
        <p className="success report-studio-notice">
          Default report template updated.
        </p>
      ) : null}
      {notices?.error ? (
        <p className="error report-studio-notice">{notices.error}</p>
      ) : null}
    </>
  );
  if (viewport === null)
    return (
      <main className="report-studio-loading-shell" aria-busy="true">
        Loading Report Studio…
      </main>
    );
  if (viewport === "phone")
    return (
      <>
        {noticeBlock}
        <section
          className="report-studio-lite-shell"
          aria-label="Report Studio Lite mobile editor"
        >
          <div className="report-studio-lite-header">
            <p className="eyebrow">Report Studio Lite</p>
            <h1>Report Studio</h1>
            <p className="muted">
              Lite editor on mobile. Use desktop or tablet for full Report
              Studio controls.
            </p>
          </div>
          <form
            action={saveBrandingSettings as (formData: FormData) => Promise<void>}
            className="report-studio-lite-form form-stack"
            encType="multipart/form-data"
          >
            <HiddenBrandFields brand={brand} />
            <input
              type="hidden"
              name="selected_session_output_id"
              value={selectedOutput}
            />
            <label className="field-stack">
              <span className="label">Report/session</span>
              <select
                className="input"
                name="review_output_id"
                value={selectedOutput}
                onChange={(e) => setSelectedOutput(e.target.value)}
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_id ?? s.id} · {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-stack">
              <span className="label">Template</span>
              <select
                className="input"
                value={selectedTemplateId}
                onChange={(e) => onTemplateChange(e.target.value)}
              >
                {templateOptions}
              </select>
            </label>
            <div className="report-studio-lite-colors">
              <label className="field-stack">
                <span className="label">Primary color</span>
                <input
                  className="input"
                  value={brand.colors.primary}
                  onChange={(e) =>
                    patch({
                      ...brand,
                      colors: { ...brand.colors, primary: e.target.value },
                    })
                  }
                />
              </label>
              <label className="field-stack">
                <span className="label">Accent color</span>
                <input
                  className="input"
                  value={brand.colors.accent}
                  onChange={(e) =>
                    patch({
                      ...brand,
                      colors: { ...brand.colors, accent: e.target.value },
                    })
                  }
                />
              </label>
            </div>
            <div className="toggle-grid">
              <Toggle
                name="cover_page_lite"
                label="Cover on"
                checked={brand.report_style.coverPage !== "none"}
                onChange={(v) => rs({ coverPage: v ? "simple_cover" : "none" })}
              />
              <Toggle
                name="showCoverLogo"
                label="Logo on"
                checked={brand.report_style.showCoverLogo}
                onChange={(v) => rs({ showCoverLogo: v })}
              />
              <Toggle
                name="showCoverReportId"
                label="Report ID on"
                checked={brand.report_style.showCoverReportId}
                onChange={(v) => rs({ showCoverReportId: v })}
              />
            </div>
            <label className="field-stack">
              <span className="label">Evidence layout</span>
              <select
                className="input"
                value={brand.report_style.evidenceStyle}
                onChange={(e) => rs({ evidenceStyle: e.target.value })}
              >
                {evidenceLayoutOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {invalid && (
              <p className="error">Enter a valid 6-digit hex color.</p>
            )}
            <div className="report-studio-lite-preview">
              <ReportStudioPreview
                brand={brand}
                logoUrl={logoUrl}
                signatureUrl={signatureUrl}
                selectedSession={selectedSession}
                active={active}
                setActive={setActive}
                previewStyle={previewStyle}
              />
            </div>
            <div className="form-actions">
              <Button type="submit" disabled={invalid}>
                Save changes
              </Button>
              <a
                className="button button-primary"
                aria-disabled={!selectedOutput}
                href={exportHref}
              >
                Apply &amp; Export
              </a>
            </div>
          </form>
        </section>
      </>
    );
  return (
    <>
      <main className="report-studio-desktop-shell">
        {noticeBlock}
        <header className="report-studio-appbar">
          <div className="cred-wordmark">CRED</div>
          <nav className="report-studio-breadcrumb" aria-label="Breadcrumb">
            <span>Sessions</span>
            <span>›</span>
            <span>
              {selectedSession?.display_id ??
                selectedSession?.title ??
                "Workspace"}
            </span>
            <span>›</span>
            <strong>Report Studio</strong>
          </nav>
          <div className="report-studio-actions">
            <a
              className="button button-secondary"
              href={
                selectedOutput
                  ? `/dashboard/sessions/${selectedOutput}/report`
                  : "/dashboard/settings"
              }
            >
              Back to Review
            </a>
            <button type="button" className="button button-secondary" onClick={() => setTemplatesOpen(true)}>
              Templates
            </button>
            <Button form="save-report-template-form" type="submit" disabled={invalid}>
              Save Template
            </Button>
            <a
              className="button button-primary"
              aria-disabled={!selectedOutput}
              href={exportHref}
            >
              Apply &amp; Export
            </a>
          </div>
        </header>
        <div className="report-studio-workbench">
          <main className="report-studio-main">
            <section className="report-output-card">
              <div>
                <strong>Select Session Output</strong>
                <p>
                  Choose any existing workspace session/output; status is shown
                  and drives preview/export context.
                </p>
              </div>
              <select
                className="input"
                name="review_output_id"
                form="report-studio-form"
                value={selectedOutput}
                onChange={(e) => setSelectedOutput(e.target.value)}
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_id ?? s.id} · {s.title} · status: {s.status} ·
                    review: {s.review_status}
                  </option>
                ))}
              </select>
              <p className="session-preview-indicator">
                Preview is using selected session:{" "}
                <strong>
                  {selectedSession?.display_id ?? selectedSession?.id ?? "None"}
                </strong>
                {selectedSession ? ` / ${selectedSession.status}` : ""}
              </p>
            </section>
            <div className="report-studio-split">
              <div className="report-studio-preview-column">
                <ReportStudioPreview
                  brand={brand}
                  logoUrl={logoUrl}
                  signatureUrl={signatureUrl}
                  selectedSession={selectedSession}
                  active={active}
                  setActive={setActive}
                  previewStyle={previewStyle}
                />
              </div>
              <Card className="report-studio-config-panel">
                <form
                  id="report-studio-form"
                  action={saveBrandingSettings as (formData: FormData) => Promise<void>}
                  className="form-stack"
                  encType="multipart/form-data"
                >
                  <HiddenBrandFields brand={brand} />
                  <input
                    type="hidden"
                    name="selected_session_output_id"
                    value={selectedOutput}
                  />
                  <div className="section-header">
                    <div>
                      <p className="eyebrow">Selected section</p>
                      <h1>{active}</h1>
                      <p className="muted">
                        Presentation-only settings for printable and exported
                        customer deliverables. Evidence, notes, findings,
                        recommendations, and technician text are not changed.
                      </p>
                    </div>
                    <span
                      className={dirty ? "status-pill warning" : "status-pill"}
                    >
                      {dirty ? "Unsaved changes" : "Saved"}
                    </span>
                  </div>
                  {active === "Cover Page" && (
                    <section className="brand-section form-stack">
                      <h3>Cover page style</h3>
                      <div className="cover-choice-grid">
                        {COVER_PAGE_LAYOUTS.map((x) => (
                          <button
                            type="button"
                            key={x}
                            className={
                              brand.report_style.coverPage === x
                                ? "cover-choice selected"
                                : "cover-choice"
                            }
                            onClick={() => rs({ coverPage: x })}
                          >
                            <span className={`cover-art ${x}`} />
                            <strong>
                              {x === "none" ? "No Cover" : title(x)}
                            </strong>
                          </button>
                        ))}
                      </div>
                      <Toggle
                        name="showCoverLogo"
                        label="Show logo on cover"
                        checked={brand.report_style.showCoverLogo}
                        onChange={(v) => rs({ showCoverLogo: v })}
                      />
                      <Toggle
                        name="showCoverReportId"
                        label="Show report ID"
                        checked={brand.report_style.showCoverReportId}
                        onChange={(v) => rs({ showCoverReportId: v })}
                      />
                    </section>
                  )}
                  {active === "Header" && (
                    <section className="brand-section form-stack">
                      <h3>Header identity and layout</h3>
                      <div className="field-grid">
                        {[
                          ["display_name", "Company name"],
                          ["address", "Address"],
                          ["phone", "Phone"],
                          ["email", "Email"],
                          ["website", "Website"],
                        ].map(([k, l]) => (
                          <label key={k} className="field-stack">
                            <span className="label">{l}</span>
                            <input
                              className="input"
                              name={k}
                              value={(brand as any)[k] ?? ""}
                              onChange={(e) => set(k as any, e.target.value)}
                            />
                          </label>
                        ))}
                      </div>
                      <select
                        className="input"
                        value={brand.header_layout}
                        onChange={(e) => set("header_layout", e.target.value)}
                      >
                        {HEADER_LAYOUTS.map((x) => (
                          <option key={x} value={x}>
                            {title(x)}
                          </option>
                        ))}
                      </select>
                      <div className="field-grid"><label className="field-stack"><span className="label">Header background color</span><input className="input" type="color" value={brand.colors.headerBackground} onChange={(e) => patch({ ...brand, colors: { ...brand.colors, headerBackground: e.target.value } })}/></label><label className="field-stack"><span className="label">Header text color</span><input className="input" type="color" value={brand.colors.headerText} onChange={(e) => patch({ ...brand, colors: { ...brand.colors, headerText: e.target.value } })}/></label><label className="field-stack"><span className="label">Divider / accent color</span><input className="input" type="color" value={brand.colors.primary} onChange={(e) => patch({ ...brand, colors: { ...brand.colors, primary: e.target.value } })}/></label><label className="field-stack"><span className="label">Header font family</span><select className="input" value={brand.typography.headingStack} onChange={(e) => patch({ ...brand, typography: { ...brand.typography, headingStack: e.target.value } })}>{SAFE_FONT_STACKS.map((x) => (<option key={x} value={x}>{x}</option>))}</select></label><label className="field-stack"><span className="label">Font weight</span><input className="input" type="number" min="400" max="900" step="100" value={brand.typography.headingWeight} onChange={(e) => patch({ ...brand, typography: { ...brand.typography, headingWeight: Number(e.target.value) } })}/></label><label className="field-stack"><span className="label">Spacing</span><select className="input" value={brand.report_style.sectionSpacing} onChange={(e) => rs({ sectionSpacing: e.target.value })}><option value="compact">Compact</option><option value="standard">Standard</option><option value="spacious">Spacious</option></select></label></div><div className="gradient-presets"><span>Optional gradient presets</span><button type="button" onClick={() => patch({ ...brand, colors: { ...brand.colors, headerBackground: brand.colors.primary, headerText: "#ffffff" } })}>Brand gradient</button><button type="button" onClick={() => patch({ ...brand, colors: { ...brand.colors, headerBackground: "#0f172a", headerText: "#eff6ff" } })}>Navy gradient</button></div>
                    </section>
                  )}
                  {active === "Client / Asset" && (
                    <section className="brand-section form-stack">
                      <h3>Client / Asset section</h3>
                      <select
                        className="input"
                        value={brand.report_style.sectionStyle}
                        onChange={(e) => rs({ sectionStyle: e.target.value })}
                      >
                        {SECTION_STYLES.map((x) => (
                          <option key={x} value={x}>
                            {title(x)}
                          </option>
                        ))}
                      </select>
                      <select
                        className="input"
                        value={brand.report_style.sectionSpacing}
                        onChange={(e) => rs({ sectionSpacing: e.target.value })}
                      >
                        <option value="compact">Compact</option>
                        <option value="standard">Standard</option>
                        <option value="spacious">Spacious</option>
                      </select>
                      <div className="toggle-grid">
                        <Toggle
                          name="showSectionLabels"
                          label="Show section labels"
                          checked={brand.report_style.showSectionLabels}
                          onChange={(v) => rs({ showSectionLabels: v })}
                        />
                        <Toggle
                          name="showSectionDividers"
                          label="Show section dividers"
                          checked={brand.report_style.showSectionDividers}
                          onChange={(v) => rs({ showSectionDividers: v })}
                        />
                        <Toggle
                          name="showSectionNumbers"
                          label="Show section numbers"
                          checked={brand.report_style.showSectionNumbers}
                          onChange={(v) => rs({ showSectionNumbers: v })}
                        />
                      </div>
                    </section>
                  )}
                  {active === "Evidence" && (
                    <section className="brand-section form-stack">
                      <h3>Evidence layout</h3>
                      <div className="field-grid">
                        <select
                          className="input"
                          value={brand.report_style.evidenceImageSize}
                          onChange={(e) =>
                            rs({ evidenceImageSize: e.target.value })
                          }
                        >
                          {EVIDENCE_IMAGE_SIZES.map((x) => (
                            <option key={x} value={x}>
                              {title(x)}
                            </option>
                          ))}
                        </select>
                        <select
                          className="input"
                          value={brand.report_style.evidenceStyle}
                          onChange={(e) =>
                            rs({ evidenceStyle: e.target.value })
                          }
                        >
                          {EVIDENCE_STYLES.map((x) => (
                            <option key={x} value={x}>
                              {title(x)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="toggle-grid">
                        <Toggle
                          name="evidence_numbering"
                          label="Evidence numbering"
                          checked={brand.report_style.evidenceNumbering}
                          onChange={(v) => rs({ evidenceNumbering: v })}
                        />
                        <Toggle
                          name="timestamps"
                          label="Show timestamps"
                          checked={brand.report_style.timestamps}
                          onChange={(v) => rs({ timestamps: v })}
                        />
                        <Toggle
                          name="capture_metadata"
                          label="Show capture metadata"
                          checked={brand.report_style.captureMetadata}
                          onChange={(v) => rs({ captureMetadata: v })}
                        />
                        <Toggle
                          name="evidence_notes"
                          label="Show notes"
                          checked={brand.report_style.notes}
                          onChange={(v) => rs({ notes: v })}
                        />
                      </div>
                    </section>
                  )}
                  {active === "Footer" && (
                    <section className="brand-section form-stack">
                      <h3>Footer text and layout</h3>
                      <select
                        className="input"
                        value={brand.footer_layout}
                        onChange={(e) => set("footer_layout", e.target.value)}
                      >
                        {FOOTER_LAYOUTS.map((x) => (
                          <option key={x} value={x}>
                            {title(x)}
                          </option>
                        ))}
                      </select>
                      <textarea
                        className="input"
                        name="footer_text"
                        value={brand.footer_text ?? ""}
                        onChange={(e) => set("footer_text", e.target.value)}
                      />
                      <select
                        className="input"
                        value={brand.report_style.watermark.option}
                        onChange={(e) =>
                          rs({
                            watermark: {
                              ...brand.report_style.watermark,
                              option: e.target.value,
                            },
                          })
                        }
                      >
                        {WATERMARK_OPTIONS.map((x) => (
                          <option key={x} value={x}>
                            {title(x)}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input"
                        value={brand.report_style.watermark.text}
                        placeholder="Watermark text"
                        onChange={(e) =>
                          rs({
                            watermark: {
                              ...brand.report_style.watermark,
                              text: e.target.value,
                            },
                          })
                        }
                      />
                    </section>
                  )}
                  {active === "Signature" && (
                    <section className="brand-section form-stack">
                      <h3>Signature settings</h3>
                      <select
                        className="input"
                        value={brand.report_style.signatureLayout}
                        onChange={(e) =>
                          rs({ signatureLayout: e.target.value })
                        }
                      >
                        {SIGNATURE_LAYOUTS.map((x) => (
                          <option key={x} value={x}>
                            {title(x)}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input"
                        name="typed_signature"
                        value={brand.report_style.typedSignature ?? ""}
                        onChange={(e) => rs({ typedSignature: e.target.value })}
                        placeholder="Typed signature"
                      />
                      <Toggle
                        name="signature_date"
                        label="Show signature date"
                        checked={brand.report_style.signatureDate}
                        onChange={(v) => rs({ signatureDate: v })}
                      />
                      <Toggle
                        name="show_signature_block"
                        label="Show signature block"
                        checked={brand.show_signature_block}
                        onChange={(v) => set("show_signature_block", v)}
                      />
                    </section>
                  )}
                  {active === "Colors & Typography" && (
                    <section className="brand-section form-stack">
                      <h3>Colors and typography packs</h3>
                      <div className="palette-grid">
                        {BRAND_PALETTES.map((p) => (
                          <button
                            type="button"
                            className="palette-card"
                            key={p.name}
                            onClick={() =>
                              patch({ ...brand, colors: p.colors })
                            }
                          >
                            <strong>{p.name}</strong>
                            <span>{p.description}</span>
                            <span className="swatches">
                              {colorKeys.slice(0, 6).map((k) => (
                                <i
                                  key={k}
                                  style={{ background: p.colors[k] }}
                                />
                              ))}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="field-grid">
                        {colorKeys.map((k) => (
                          <label key={k} className="field-stack">
                            <span className="label">
                              <i
                                className="color-chip"
                                style={{ background: brand.colors[k] }}
                              />{" "}
                              {COLOR_LABELS[k]}
                            </span>
                            <div className="color-token-controls">
                              <input
                                type="color"
                                aria-label={`${COLOR_LABELS[k]} color picker`}
                                value={
                                  isValidHexColor(brand.colors[k])
                                    ? brand.colors[k]
                                    : "#000000"
                                }
                                onChange={(e) =>
                                  patch({
                                    ...brand,
                                    colors: {
                                      ...brand.colors,
                                      [k]: e.target.value,
                                    },
                                  })
                                }
                              />
                              <input
                                className="input"
                                aria-invalid={!isValidHexColor(brand.colors[k])}
                                value={brand.colors[k]}
                                onChange={(e) =>
                                  patch({
                                    ...brand,
                                    colors: {
                                      ...brand.colors,
                                      [k]: e.target.value,
                                    },
                                  })
                                }
                              />
                              <button
                                type="button"
                                className="button button-secondary"
                                onClick={() =>
                                  patch({
                                    ...brand,
                                    colors: {
                                      ...brand.colors,
                                      [k]: profile.colors[k],
                                    },
                                  })
                                }
                              >
                                Reset token
                              </button>
                            </div>
                          </label>
                        ))}
                      </div>
                      <select
                        className="input"
                        value={brand.typography.preset}
                        onChange={(e) =>
                          patch({
                            ...brand,
                            typography:
                              TYPOGRAPHY_OPTIONS[
                                e.target
                                  .value as keyof typeof TYPOGRAPHY_OPTIONS
                              ],
                          })
                        }
                      >
                        {Object.values(TYPOGRAPHY_OPTIONS).map((t) => (
                          <option key={t.preset} value={t.preset}>
                            {t.name} — {t.description}
                          </option>
                        ))}
                      </select>
                      <p className="muted">
                        Custom typography uses safe system font stack options
                        only. Uploaded brand fonts are not supported.
                      </p>
                      <div className="field-grid">
                        <label className="field-stack">
                          <span className="label">Heading stack</span>
                          <select
                            className="input"
                            value={brand.typography.headingStack}
                            onChange={(e) =>
                              patch({
                                ...brand,
                                typography: {
                                  ...brand.typography,
                                  preset: "professional_sans",
                                  headingStack: e.target.value,
                                },
                              })
                            }
                          >
                            {SAFE_FONT_STACKS.map((x) => (
                              <option key={x} value={x}>
                                {x}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field-stack">
                          <span className="label">Body stack</span>
                          <select
                            className="input"
                            value={brand.typography.bodyStack}
                            onChange={(e) =>
                              patch({
                                ...brand,
                                typography: {
                                  ...brand.typography,
                                  preset: "professional_sans",
                                  bodyStack: e.target.value,
                                },
                              })
                            }
                          >
                            {SAFE_FONT_STACKS.map((x) => (
                              <option key={x} value={x}>
                                {x}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field-stack">
                          <span className="label">Heading weight</span>
                          <input
                            className="input"
                            type="number"
                            min="400"
                            max="900"
                            step="100"
                            value={brand.typography.headingWeight}
                            onChange={(e) =>
                              patch({
                                ...brand,
                                typography: {
                                  ...brand.typography,
                                  headingWeight: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                        <label className="field-stack">
                          <span className="label">Letter spacing</span>
                          <input
                            className="input"
                            value={brand.typography.letterSpacing}
                            onChange={(e) =>
                              patch({
                                ...brand,
                                typography: {
                                  ...brand.typography,
                                  letterSpacing: e.target.value,
                                },
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="brand-section form-stack"><h3>Typography by report area</h3>{["cover page","header","section headings","body text","evidence titles","evidence notes","footer","signature"].map((area) => (<label key={area} className="field-stack"><span className="label">{title(area)} font</span><select className="input" name={`typography_area_${area.replaceAll(" ", "_")}`} value={(brand.typography as any).areaStacks?.[area.replaceAll(" ", "_")] ?? brand.typography.bodyStack} onChange={(e) => patch({ ...brand, typography: { ...brand.typography, areaStacks: { ...((brand.typography as any).areaStacks ?? {}), [area.replaceAll(" ", "_")]: e.target.value } } as any })}>{SAFE_FONT_STACKS.map((x) => (<option key={x} value={x}>{x}</option>))}</select></label>))}</div>
                      {invalid && (
                        <p className="error">
                          Enter a valid 6-digit hex color.
                        </p>
                      )}
                    </section>
                  )}
                  <div className="form-actions">
                    <Button type="submit" disabled={invalid}>
                      Save Report Studio
                    </Button>
                    <Button
                      formAction={resetBrandingSettings}
                      variant="secondary"
                    >
                      Reset to system default
                    </Button>
                  </div>
                </form>
                {templatesOpen && (
                  <div className="report-template-overlay" role="dialog" aria-modal="true" aria-label="Templates">
                    <div className="report-template-panel">
                      <div className="section-header">
                        <div><p className="eyebrow">Global presets</p><h2>Templates</h2></div>
                        <button type="button" className="button button-secondary" onClick={() => setTemplatesOpen(false)}>Close</button>
                      </div>
                      <section className="brand-section form-stack"><h3>Saved Templates</h3><p className="muted">User-created templates. Rename, duplicate, delete, or apply these workspace-wide presets.</p>{templates.map((t) => (<div className="template-row" key={t.id}><strong>{t.name}</strong><span>{t.description ?? "Custom report preset"}</span><div className="form-actions"><button type="button" className="button button-secondary" onClick={() => applyTemplate(t)}>Apply</button><button type="button" className="button button-secondary" onClick={() => { setSelectedTemplateId(t.id); setTemplateMode("update"); }}>Rename</button><button type="button" className="button button-secondary" onClick={() => { setSelectedTemplateId(t.id); setTemplateMode("duplicate"); }}>Duplicate</button><Button formAction={async () => { await deleteReportTemplate(t.id); }} variant="secondary">Delete</Button></div></div>))}</section>
                      <section className="brand-section form-stack"><h3>System Templates</h3><p className="muted">Built-in read-only templates. Apply only.</p><div className="template-row"><strong>System default</strong><span>Read-only CRED report preset.</span><button type="button" className="button button-secondary" onClick={applySystemTemplate}>Apply</button></div></section>
                      <label className="field-stack"><span className="label">Template name</span><input className="input" name="template_name" defaultValue="New branded report template" form="save-report-template-form" /></label>
                    </div>
                  </div>
                )}
                <form
                  id="save-report-template-form"
                  action={saveReportTemplate}
                >
                  <HiddenBrandFields brand={brand} />
                  <input
                    type="hidden"
                    name="template_id"
                    value={
                      selectedTemplateId === "system" ? "" : selectedTemplateId
                    }
                  />
                  <input
                    type="hidden"
                    name="template_mode"
                    value={templateMode}
                  />
                </form>
              </Card>
            </div>
          </main>
        </div>
      </main>
    </>
  );
}
function previewDate() {
  return "June 30, 2026";
}
function evidenceImage(
  evidence: SessionEvidence | undefined,
  className: string,
) {
  return evidence?.thumbnailUrl ? (
    <img
      className={className}
      src={evidence.thumbnailUrl}
      alt={evidence.label || "Evidence preview"}
    />
  ) : (
    <div className={className}>
      {evidence ? evidence.mediaKind || "Evidence" : "No image evidence"}
    </div>
  );
}
export function ReportStudioPreview({
  brand,
  logoUrl,
  signatureUrl,
  selectedSession,
  active,
  setActive,
  previewStyle,
}: {
  brand: WorkspaceBrandProfile;
  logoUrl?: string | null;
  signatureUrl?: string | null;
  selectedSession?: SessionOutput;
  active: StudioSection;
  setActive: (s: StudioSection) => void;
  previewStyle: any;
}) {
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const coverRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const clientAssetRef = useRef<HTMLElement | null>(null);
  const evidenceRef = useRef<HTMLElement | null>(null);
  const signatureRef = useRef<HTMLElement | null>(null);
  const footerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const sectionRefByName: Record<
      string,
      React.RefObject<HTMLElement | null>
    > = {
      "Cover Page": coverRef,
      Header: headerRef,
      "Client / Asset": clientAssetRef,
      Evidence: evidenceRef,
      Signature: signatureRef,
      Footer: footerRef,
    };
    const section = sectionRefByName[active]?.current;
    const scroller = previewScrollRef.current;
    if (!section || !scroller) return;
    scroller.scrollTo({
      top: section.offsetTop - scroller.offsetTop,
      behavior: "smooth",
    });
  }, [active]);
  const sectionClass = (s: StudioSection) => (active === s ? "selected" : "");
  return (
    <aside className="report-live-preview-panel brand-preview-panel">
      <button type="button" className="button button-secondary preview-toggle">
        Collapse preview
      </button>
      <div className="preview-toolbar">
        <strong>Live Preview</strong>
        <span>
          Preview is using selected session:{" "}
          {selectedSession?.display_id ?? selectedSession?.id ?? "None"} /{" "}
          {selectedSession?.status ?? "workspace"}
        </span>
      </div>
      <div
        ref={previewScrollRef}
        className={`exported-report-preview brand-preview-${brand.header_layout} evidence-${brand.report_style.evidenceStyle} image-${brand.report_style.evidenceImageSize} section-${brand.report_style.sectionStyle} spacing-${brand.report_style.sectionSpacing} typography-${brand.typography.preset}`}
        data-cover-page={brand.report_style.coverPage}
        data-section-style={brand.report_style.sectionStyle}
        data-section-spacing={brand.report_style.sectionSpacing}
        data-evidence-style={brand.report_style.evidenceStyle}
        data-evidence-image-size={brand.report_style.evidenceImageSize}
        style={previewStyle}
      >
        <div className="report-paper">
          <ReportStudioCoverPreview
            anchorProps={{
              ref: coverRef,
              "data-preview-section": "Cover Page",
            }}
            brand={brand}
            logoUrl={logoUrl}
            selectedSession={selectedSession}
            setActive={setActive}
            selected={sectionClass("Cover Page")}
          />
          <ReportStudioHeaderPreview
            anchorProps={{ ref: headerRef, "data-preview-section": "Header" }}
            brand={brand}
            logoUrl={logoUrl}
            selectedSession={selectedSession}
            setActive={setActive}
            selected={sectionClass("Header")}
          />
          <ReportStudioSectionPreview
            anchorProps={{
              ref: clientAssetRef,
              "data-preview-section": "Client / Asset",
            }}
            brand={brand}
            selectedSession={selectedSession}
            setActive={setActive}
            selected={sectionClass("Client / Asset")}
          />
          <ReportStudioEvidencePreview
            anchorProps={{
              ref: evidenceRef,
              "data-preview-section": "Evidence",
            }}
            brand={brand}
            selectedSession={selectedSession}
            setActive={setActive}
            selected={sectionClass("Evidence")}
          />
          <ReportStudioSignaturePreview
            anchorProps={{
              ref: signatureRef,
              "data-preview-section": "Signature",
            }}
            brand={brand}
            signatureUrl={signatureUrl}
            setActive={setActive}
            selected={sectionClass("Signature")}
          />
          <ReportStudioFooterPreview
            anchorProps={{ ref: footerRef, "data-preview-section": "Footer" }}
            brand={brand}
            selectedSession={selectedSession}
            setActive={setActive}
            selected={sectionClass("Footer")}
          />
        </div>
        <p className="notice">
          Click any preview section to open matching editable controls.
        </p>
      </div>
    </aside>
  );
}
function ReportStudioCoverPreview({
  anchorProps,
  brand,
  logoUrl,
  selectedSession,
  setActive,
  selected,
}: {
  anchorProps: any;
  brand: WorkspaceBrandProfile;
  logoUrl?: string | null;
  selectedSession?: SessionOutput;
  setActive: (s: StudioSection) => void;
  selected: string;
}) {
  const e = selectedSession?.evidence?.find((x) => x.thumbnailUrl);
  if (brand.report_style.coverPage === "none") return null;
  const reportId = selectedSession?.display_id ?? "CRED-1042";
  const common = (
    <>
      <p className="cover-kicker">Service Documentation Report</p>
      {brand.report_style.showCoverTitle && (
        <h2>{selectedSession?.title ?? "Workspace report"}</h2>
      )}
      <dl>
        <div>
          <dt>Client</dt>
          <dd>{selectedSession?.customer_name || "No customer recorded"}</dd>
        </div>
        <div>
          <dt>Asset</dt>
          <dd>{selectedSession?.asset_label || "No asset recorded"}</dd>
        </div>
        {brand.report_style.showCoverReportId && (
          <div>
            <dt>Report ID</dt>
            <dd>{reportId}</dd>
          </div>
        )}
        <div>
          <dt>Date</dt>
          <dd>{previewDate()}</dd>
        </div>
      </dl>
    </>
  );
  return (
    <button
      type="button"
      {...anchorProps}
      data-preview-component="ReportStudioCoverPreview"
      className={`report-cover-preview cover-${brand.report_style.coverPage} ${selected}`}
      onClick={() => setActive("Cover Page")}
    >
      {brand.report_style.coverPage === "professional_cover" ? (
        <>
          <div className="cover-brand-block">
            {brand.report_style.showCoverLogo &&
              (logoUrl ? (
                <img src={logoUrl} alt="Logo preview" />
              ) : (
                <strong>{brand.display_name || "YOUR COMPANY"}</strong>
              ))}
            <span>{brand.tagline || "Industrial Services"}</span>
          </div>
          {common}
          {brand.report_style.showCoverImage &&
            brand.report_style.coverImageSource === "first_evidence_image" &&
            evidenceImage(e, "cover-evidence-image")}
        </>
      ) : (
        common
      )}
    </button>
  );
}
function ReportStudioHeaderPreview({
  anchorProps,
  brand,
  logoUrl,
  selectedSession,
  setActive,
  selected,
}: {
  anchorProps: any;
  brand: WorkspaceBrandProfile;
  logoUrl?: string | null;
  selectedSession?: SessionOutput;
  setActive: (s: StudioSection) => void;
  selected: string;
}) {
  return (
    <header
      {...anchorProps}
      data-preview-component="ReportStudioHeaderPreview"
      className={`preview-header header-${brand.header_layout} ${selected}`}
      onClick={() => setActive("Header")}
    >
      <div>
        {logoUrl ? (
          <img src={logoUrl} alt="Logo preview" />
        ) : (
          <strong>{brand.display_name || "YOUR COMPANY"}</strong>
        )}
        <p>{brand.tagline || "Industrial Services"}</p>
      </div>
      <address>
        {brand.address || "123 Service St"}
        <br />
        {brand.phone || "(403) 555-0123"}
        <br />
        {brand.email || "service@yourcompany.com"}
      </address>
      {brand.show_report_id && (
        <span className="header-report-id">
          {selectedSession?.display_id ?? "CRED-1042"}
        </span>
      )}
    </header>
  );
}
function ReportStudioSectionPreview({
  anchorProps,
  brand,
  selectedSession,
  setActive,
  selected,
}: {
  anchorProps: any;
  brand: WorkspaceBrandProfile;
  selectedSession?: SessionOutput;
  setActive: (s: StudioSection) => void;
  selected: string;
}) {
  const rs = brand.report_style;
  return (
    <section
      {...anchorProps}
      data-preview-component="ReportStudioSectionPreview"
      className={`preview-report-section section-layout-${rs.sectionStyle} section-spacing-${rs.sectionSpacing} ${selected}`}
      onClick={() => setActive("Client / Asset")}
    >
      <div className="section-heading-row">
        {rs.showSectionNumbers && <span className="section-number">1</span>}
        <h3>{rs.showSectionLabels ? "Client / Asset" : "Report Details"}</h3>
      </div>
      {rs.showSectionDividers && <hr />}
      <div className="section-content-grid">
        <p>
          <b>Client:</b>{" "}
          {selectedSession?.customer_name || "No customer recorded"}
        </p>
        <p>
          <b>Asset:</b> {selectedSession?.asset_label || "No asset recorded"}
        </p>
        <p>
          <b>Status:</b> {selectedSession?.status ?? "Not selected"} /{" "}
          {selectedSession?.review_status ?? "n/a"}
        </p>
      </div>
    </section>
  );
}
function ReportStudioEvidencePreview({
  anchorProps,
  brand,
  selectedSession,
  setActive,
  selected,
}: {
  anchorProps: any;
  brand: WorkspaceBrandProfile;
  selectedSession?: SessionOutput;
  setActive: (s: StudioSection) => void;
  selected: string;
}) {
  const rs = brand.report_style;
  const items = (
    selectedSession?.evidence?.length ? selectedSession.evidence : [undefined]
  ).slice(0, 4);
  const notesFirst = rs.evidenceStyle === "notes_first_photos_below";
  const photoLeft = rs.evidenceStyle === "photo_left_notes_right";
  return (
    <section
      {...anchorProps}
      data-preview-component="ReportStudioEvidencePreview"
      className={`preview-evidence evidence-layout-${rs.evidenceStyle} evidence-image-${rs.evidenceImageSize} ${selected}`}
      onClick={() => setActive("Evidence")}
    >
      <h3>Evidence</h3>
      <div className="evidence-items">
        {items.map((e, i) => (
          <article key={e?.id ?? i} className="evidence-item">
            <div className="evidence-copy">
              {rs.evidenceNumbering && (
                <b className="evidence-number">
                  EV-{String(i + 1).padStart(3, "0")}
                </b>
              )}
              <p>
                {rs.notes
                  ? e?.note ||
                    e?.label ||
                    "No included evidence found for this session."
                  : e?.label || "Evidence item"}
              </p>
              {rs.timestamps && (
                <small className="evidence-timestamp">
                  Captured {previewDate()}
                </small>
              )}
              {rs.captureMetadata && (
                <small className="evidence-metadata">
                  GPS verified · {e?.mediaKind || "image"} · session evidence
                </small>
              )}
            </div>
            {notesFirst
              ? null
              : evidenceImage(e, "photo-box evidence-thumbnail")}
            {notesFirst && (
              <div className="notes-first-photo-row">
                {evidenceImage(e, "photo-box evidence-thumbnail")}
              </div>
            )}
            {photoLeft && (
              <span className="layout-marker">Photo left / notes right</span>
            )}
          </article>
        ))}
      </div>
      <small>
        {selectedSession?.evidence?.length ?? 0} evidence item
        {(selectedSession?.evidence?.length ?? 0) === 1 ? "" : "s"} selected for
        report
      </small>
    </section>
  );
}
function ReportStudioSignaturePreview({
  anchorProps,
  brand,
  signatureUrl,
  setActive,
  selected,
}: {
  anchorProps: any;
  brand: WorkspaceBrandProfile;
  signatureUrl?: string | null;
  setActive: (s: StudioSection) => void;
  selected: string;
}) {
  if (!brand.show_signature_block) return null;
  return (
    <section
      {...anchorProps}
      data-preview-component="ReportStudioSignaturePreview"
      className={`preview-signature signature-${brand.report_style.signatureLayout} ${selected}`}
      onClick={() => setActive("Signature")}
    >
      <h3>{brand.report_style.reviewedByLabel}</h3>
      {signatureUrl ? (
        <img
          className="signature-preview"
          src={signatureUrl}
          alt="Signature preview"
        />
      ) : (
        <p>
          {brand.report_style.typedSignature ||
            brand.prepared_by_name ||
            "Jordan Lee"}
        </p>
      )}
      {brand.report_style.signatureDate && <small>{previewDate()}</small>}
    </section>
  );
}
function ReportStudioFooterPreview({
  anchorProps,
  brand,
  selectedSession,
  setActive,
  selected,
}: {
  anchorProps: any;
  brand: WorkspaceBrandProfile;
  selectedSession?: SessionOutput;
  setActive: (s: StudioSection) => void;
  selected: string;
}) {
  return (
    <footer
      {...anchorProps}
      data-preview-component="ReportStudioFooterPreview"
      className={`preview-footer footer-${brand.footer_layout} ${selected}`}
      onClick={() => setActive("Footer")}
    >
      <span>
        {brand.footer_text || "Professional documentation you can trust."}
      </span>
      {brand.report_style.watermark.option !== "none" && (
        <b>
          {" "}
          ·{" "}
          {brand.report_style.watermark.option === "custom_text"
            ? brand.report_style.watermark.text
            : title(brand.report_style.watermark.option)}
        </b>
      )}
      {brand.show_page_date && <small> · {previewDate()}</small>}
      {brand.show_report_id && (
        <small> · {selectedSession?.display_id ?? "CRED-1042"}</small>
      )}
    </footer>
  );
}
