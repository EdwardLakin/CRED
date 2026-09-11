import {
  DEFAULT_BRAND_PROFILE,
  TYPOGRAPHY_OPTIONS,
  type TypographySettings,
  type WorkspaceBrandProfile,
} from "./types";

export const BUILT_IN_REPORT_PRESETS = [
  { id: "preset:professional", name: "Professional", description: "Clean business header, concise summary, paired item photos, and formal completion details." },
  { id: "preset:executive", name: "Executive", description: "Premium summary-forward presentation with larger imagery and a formal cover." },
  { id: "preset:inspection", name: "Inspection", description: "Dense finding-focused layout for reports with many documented items." },
  { id: "preset:photo-report", name: "Photo Report", description: "Evidence-forward presentation with larger supporting photographs." },
  { id: "preset:minimal", name: "Minimal", description: "Restrained typography and compact presentation with minimal decoration." },
] as const;

export type BuiltInReportPresetId = (typeof BUILT_IN_REPORT_PRESETS)[number]["id"];

export function isBuiltInReportPresetId(value: string | null | undefined): value is BuiltInReportPresetId {
  return BUILT_IN_REPORT_PRESETS.some((preset) => preset.id === value);
}

function copyProfile(profile: WorkspaceBrandProfile): WorkspaceBrandProfile {
  return {
    ...profile,
    colors: { ...profile.colors },
    typography: { ...profile.typography },
    report_style: {
      ...profile.report_style,
      watermark: { ...profile.report_style.watermark },
      headerOptions: { ...profile.report_style.headerOptions },
      signatureBlocks: profile.report_style.signatureBlocks.map((block) => ({ ...block })),
      customFields: profile.report_style.customFields.map((field) => ({ ...field })),
    },
  };
}

function typography(preset: keyof typeof TYPOGRAPHY_OPTIONS) {
  const option = TYPOGRAPHY_OPTIONS[preset];
  const areaStacks = {
    cover_page: option.headingStack,
    header: option.headingStack,
    section_headings: option.headingStack,
    body_text: option.bodyStack,
    evidence_titles: option.headingStack,
    evidence_notes: option.bodyStack,
    footer: option.bodyStack,
    signature: option.bodyStack,
  };
  return { ...option, areaStacks } as TypographySettings & { areaStacks: typeof areaStacks };
}

export function applyBuiltInReportPreset(
  source: WorkspaceBrandProfile | null | undefined,
  presetId: BuiltInReportPresetId,
): WorkspaceBrandProfile {
  const base = copyProfile(source ?? DEFAULT_BRAND_PROFILE);
  const reportStyle = {
    ...base.report_style,
    showCoverCompanyInfo: true,
    showCoverTitle: true,
    showCoverClient: true,
    showCoverAsset: true,
    showCoverDate: true,
    showCoverReportId: true,
    showSectionLabels: true,
    showSectionDividers: true,
    evidenceNumbering: true,
    approvalBlock: true,
  };
  const common = { ...base, show_signature_block: true, show_report_id: true };

  switch (presetId) {
    case "preset:executive":
      return {
        ...common,
        header_layout: "centered_logo",
        footer_layout: "split_footer",
        typography: typography("editorial_serif"),
        report_style: {
          ...reportStyle,
          coverPage: "professional_cover",
          sectionStyle: "executive",
          sectionSpacing: "spacious",
          evidenceImageSize: "large",
          evidenceStyle: "large_photo_cards",
          signatureLayout: "two_signatures",
        },
      };
    case "preset:inspection":
      return {
        ...common,
        header_layout: "compact_service",
        footer_layout: "report_id_footer",
        typography: typography("professional_sans"),
        report_style: {
          ...reportStyle,
          coverPage: "minimal_cover",
          sectionStyle: "inspection",
          sectionSpacing: "compact",
          evidenceImageSize: "standard",
          evidenceStyle: "photo_left_notes_right",
          signatureLayout: "single_signature",
        },
      };
    case "preset:photo-report":
      return {
        ...common,
        header_layout: "classic_letterhead",
        footer_layout: "minimal",
        typography: typography("professional_sans"),
        report_style: {
          ...reportStyle,
          coverPage: "minimal_cover",
          sectionStyle: "clean",
          sectionSpacing: "standard",
          evidenceImageSize: "large",
          evidenceStyle: "photo_grid",
          signatureLayout: "single_signature",
        },
      };
    case "preset:minimal":
      return {
        ...common,
        header_layout: "minimal",
        footer_layout: "minimal",
        typography: typography("system_sans"),
        report_style: {
          ...reportStyle,
          coverPage: "none",
          sectionStyle: "minimal",
          sectionSpacing: "compact",
          evidenceImageSize: "compact",
          evidenceStyle: "clean_list",
          signatureLayout: "single_signature",
        },
      };
    case "preset:professional":
    default:
      return {
        ...common,
        header_layout: "left_rail",
        footer_layout: "report_id_footer",
        typography: typography("professional_sans"),
        report_style: {
          ...reportStyle,
          coverPage: "none",
          sectionStyle: "clean_document",
          sectionSpacing: "standard",
          evidenceImageSize: "standard",
          evidenceStyle: "standard_cards",
          signatureLayout: "single_signature",
        },
      };
  }
}
