/* eslint-disable @typescript-eslint/no-explicit-any */
import { normalizeBrandProfile, type WorkspaceBrandProfile } from './types'

export type WorkspaceReportTemplate = WorkspaceBrandProfile & {
  id: string
  organization_id: string
  name: string
  description: string | null
  is_default: boolean
  brand_profile_id: string | null
  created_at: string
  updated_at: string
}

export const SYSTEM_TEMPLATE_VALUE = 'system'
export const WORKSPACE_DEFAULT_TEMPLATE_VALUE = 'workspace-default'

export function normalizeReportTemplate(row: any): WorkspaceReportTemplate {
  const templateRow = row
  const profile = normalizeBrandProfile({
    ...templateRow?.identity,
    organization_id: templateRow?.organization_id,
    display_name: templateRow?.identity?.display_name ?? null,
    logo_storage_path: templateRow?.logo_storage_path ?? templateRow?.identity?.logo_storage_path ?? null,
    dark_logo_storage_path: templateRow?.dark_logo_asset_id ?? templateRow?.identity?.dark_logo_storage_path ?? null,
    signature_storage_path: templateRow?.signature_asset_id ?? templateRow?.identity?.signature_storage_path ?? null,
    colors: templateRow?.colors ?? {},
    typography: templateRow?.typography ?? {},
    header_layout: templateRow?.header_layout,
    footer_layout: templateRow?.footer_layout ?? 'standard',
    report_style: templateRow?.report_style ?? {},
    footer_text: templateRow?.footer_text ?? null,
    show_signature_block: templateRow?.signature_settings?.show_signature_block ?? templateRow?.identity?.show_signature_block ?? true,
  })
  return {
    ...profile,
    id: templateRow.id,
    organization_id: templateRow.organization_id,
    name: templateRow.name,
    description: templateRow.description ?? null,
    is_default: Boolean(templateRow.is_default),
    brand_profile_id: templateRow.brand_profile_id ?? null,
    created_at: templateRow.created_at,
    updated_at: templateRow.updated_at,
  }
}

export function templatePayloadFromBrand(brand: WorkspaceBrandProfile, organizationId: string, userId: string, name: string, description: string | null, isDefault = false) {
  return {
    organization_id: organizationId,
    name,
    description,
    is_default: isDefault,
    identity: {
      display_name: brand.display_name,
      tagline: brand.tagline,
      phone: brand.phone,
      email: brand.email,
      website: brand.website,
      address: brand.address,
      prepared_by_name: brand.prepared_by_name,
      prepared_by_title: brand.prepared_by_title,
      show_report_id: brand.show_report_id,
      show_page_date: brand.show_page_date,
      show_contact_info: brand.show_contact_info,
      show_confidentiality_note: brand.show_confidentiality_note,
      show_signature_block: brand.show_signature_block,
    },
    logo_storage_path: brand.logo_storage_path,
    dark_logo_asset_id: brand.dark_logo_storage_path,
    signature_asset_id: brand.signature_storage_path,
    colors: brand.colors,
    typography: brand.typography,
    header_layout: brand.header_layout,
    footer_layout: brand.footer_layout,
    report_style: brand.report_style,
    footer_text: brand.footer_text,
    signature_settings: { show_signature_block: brand.show_signature_block },
    created_by: userId,
    updated_by: userId,
  }
}
