import type { Json } from '@/lib/supabase/database.types'

export const DEFAULT_REPORT_TYPE = 'General Evidence Report'

export const REPORT_TYPES = [
  DEFAULT_REPORT_TYPE,
  'Vehicle Inspection',
  'Property Inspection',
  'Insurance Claim',
  'Incident Report',
  'Safety Inspection',
  'Custom Report',
] as const

export type ReportType = (typeof REPORT_TYPES)[number]

export type SessionMetadata = {
  customer_client: string | null
  asset_equipment: string | null
  reference_number: string | null
  location: string | null
  subject_name: string | null
}

export const SESSION_METADATA_FIELDS: Array<{ name: keyof SessionMetadata; label: string; legacySessionField?: 'customer_name' | 'asset_label' }> = [
  { name: 'customer_client', label: 'Customer / Client', legacySessionField: 'customer_name' },
  { name: 'asset_equipment', label: 'Asset / Equipment', legacySessionField: 'asset_label' },
  { name: 'reference_number', label: 'Reference Number' },
  { name: 'location', label: 'Location' },
  { name: 'subject_name', label: 'Subject Name' },
]

export const BASELINE_REPORT_TEMPLATE = {
  key: 'general_evidence_report',
  sectionOrder: [
    'Cover',
    'Report Overview',
    'Report Information',
    'Final Summary / Notes',
    'Captured Evidence',
    'Evidence Appendix',
    'Inspector Details',
    'Signature',
  ],
} as const

export function normalizeReportType(value: string | null | undefined): ReportType {
  return REPORT_TYPES.includes(value as ReportType) ? (value as ReportType) : DEFAULT_REPORT_TYPE
}

export function getDefaultReportTitle(reportType: string | null | undefined) {
  return normalizeReportType(reportType)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function normalizeSessionMetadata(value: Json | null | undefined, legacy?: { customer_name?: string | null; asset_label?: string | null }): SessionMetadata {
  const record = isRecord(value) ? value : {}
  return {
    customer_client: clean(record.customer_client) ?? clean(legacy?.customer_name),
    asset_equipment: clean(record.asset_equipment) ?? clean(legacy?.asset_label),
    reference_number: clean(record.reference_number),
    location: clean(record.location),
    subject_name: clean(record.subject_name),
  }
}

export function sessionMetadataToJson(metadata: SessionMetadata): Json {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== null)) as Json
}
