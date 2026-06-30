import { DEFAULT_BRAND_PROFILE, TYPOGRAPHY_OPTIONS } from "@/features/branding/types";
import type { ExportBranding } from "./types";

export function buildBrandCss(branding?: ExportBranding | null) {
  const brand = branding ?? DEFAULT_BRAND_PROFILE;
  const colors = brand.colors;
  const type = TYPOGRAPHY_OPTIONS[brand.typography.preset] ?? TYPOGRAPHY_OPTIONS.professional_sans;
  return `
    body{font-family:${type.bodyStack};color:${colors.accent}}
    .report{--brand-primary:${colors.primary};--brand-accent:${colors.accent};--brand-header-bg:${colors.headerBackground};--brand-header-text:${colors.headerText};--brand-footer-bg:${colors.footerBackground};--brand-footer-text:${colors.footerText};--brand-section-heading:${colors.sectionHeading};--brand-border:${colors.border};--brand-muted-bg:${colors.mutedBackground};--brand-evidence-accent:${colors.evidenceAccent}}
    .report h1,.report h2,.report h3{font-family:${type.headingStack};font-weight:${type.headingWeight}}
    .cover-copy h1{font-weight:${type.titleWeight};letter-spacing:${type.titleSpacing}}
    .eyebrow,dt,.observation-kind,.observation-number{letter-spacing:${type.sectionHeadingLetterSpacing || ".08em"}}
  `;
}
