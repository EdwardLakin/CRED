import {
  DEFAULT_BRAND_PROFILE,
  type WorkspaceBrandProfile,
} from "./types";

export const BUILT_IN_REPORT_PRESETS = [
  {
    id: "preset:professional",
    name: "Professional",
    description:
      "Clean business header, concise summary, paired item photos, and formal completion details.",
  },
  {
    id: "preset:executive",
    name: "Executive",
    description:
      "Premium summary-forward presentation with larger imagery and a formal cover.",
  },
  {
    id: "preset:inspection",
    name: "Inspection",
    description:
      "Dense finding-focused layout for reports with many documented items.",
  },
  {
    id: "preset:photo-report",
    name: "Photo Report",
    description:
      "Evidence-forward presentation with larger supporting photographs.",
  },
  {
    id: "preset:minimal",
    name: "Minimal",
    description:
      "Restrained typography and compact presentation with minimal decoration.",
  },
] as const;

export type BuiltInReportPresetId =
  (typeof BUILT_IN_REPORT_PRESETS)[number]["id"];

export function isBuiltInReportPresetId(
  value: string | null | undefined,
): value is BuiltInReportPresetId {
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
        header_layout: "split_identity",
        footer_layout: "split_footer",
        typography: {
          ...base.typography,
          preset: "executive_letter",
          headingStack: "Georgia, Times New Roman, serif",
          bodyStack: "Arial, Helvetica, sans-serif",
        },
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
        typography: {
          ...base.typography,
          preset: "inspection_notes",
          headingStack: "Verdana, Geneva, sans-serif",
          bodyStack: "Verdana, Geneva, sans-serif",
        },
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
        typography: {
          ...base.typography,
          preset: "system_sans",
          headingStack: "system-ui, -apple-system, Segoe UI, sans-serif",
          bodyStack: "system-ui, -apple-system, Segoe UI, sans-serif",
        },
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
        typography: {
          ...base.typography,
          preset: "professional_sans",
          headingStack: "Inter, Arial, Helvetica, sans-serif",
          bodyStack: "Inter, Arial, Helvetica, sans-serif",
        },
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
