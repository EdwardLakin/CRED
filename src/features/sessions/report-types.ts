import type { Json } from '@/lib/supabase/database.types'

export const DEFAULT_REPORT_TYPE = 'General Evidence Report'

export const REPORT_TYPES = [
  { value: 'General Evidence Report', label: 'General Evidence Report' },
  { value: 'Vehicle Inspection', label: 'Vehicle Inspection' },
  { value: 'Property Inspection', label: 'Property Inspection' },
  { value: 'Insurance Claim', label: 'Insurance Claim' },
  { value: 'Incident Report', label: 'Incident Report' },
  { value: 'Safety Inspection', label: 'Safety Inspection' },
  { value: 'Custom Report', label: 'Custom Report' },
] as const

export type ReportType = (typeof REPORT_TYPES)[number]['value']

export type SessionMetadata = {
  customer_client: string
  asset_equipment: string
  reference_number: string
  location: string
  subject_name: string
}

export const SESSION_METADATA_FIELDS: Array<{ name: keyof SessionMetadata; label: string; maxLength: number }> = [
  { name: 'customer_client', label: 'Customer / Client', maxLength: 180 },
  { name: 'asset_equipment', label: 'Asset / Equipment', maxLength: 180 },
  { name: 'reference_number', label: 'Reference Number', maxLength: 120 },
  { name: 'location', label: 'Location', maxLength: 240 },
  { name: 'subject_name', label: 'Subject Name', maxLength: 180 },
]

export const BASELINE_REPORT_TEMPLATE = {
  title: DEFAULT_REPORT_TYPE,
  sections: ['Report Summary', 'Findings', 'Evidence Captured', 'Recommendations', 'Final Summary / Report Notes'],
} as const

const LEGACY_REPORT_TYPE_MAP: Record<string, ReportType> = {
  '': DEFAULT_REPORT_TYPE,
  'General Documentation': DEFAULT_REPORT_TYPE,
  'Inspection Report': 'Property Inspection',
  'Service Report': 'Vehicle Inspection',
  field_service_report: 'Vehicle Inspection',
  diagnostic_procedure: DEFAULT_REPORT_TYPE,
}

function cleanString(value: unknown, maxLength = 240) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeReportType(value: unknown): ReportType {
  const reportType = cleanString(value, 120)
  const directMatch = REPORT_TYPES.find((type) => type.value === reportType)
  if (directMatch) return directMatch.value
  return LEGACY_REPORT_TYPE_MAP[reportType] ?? DEFAULT_REPORT_TYPE
}

export function getDefaultReportTitle(reportType: unknown = DEFAULT_REPORT_TYPE) {
  return normalizeReportType(reportType)
}

export function normalizeSessionMetadata(metadata: unknown, legacy: { customer_name?: string | null; asset_label?: string | null } = {}): SessionMetadata {
  const source = isRecord(metadata) ? metadata : {}
  const normalized = {} as SessionMetadata
  for (const field of SESSION_METADATA_FIELDS) {
    normalized[field.name] = cleanString(source[field.name], field.maxLength)
  }
  if (!normalized.location) normalized.location = cleanString(source.location_address, 240)
  if (!normalized.customer_client) normalized.customer_client = cleanString(legacy.customer_name, 180)
  if (!normalized.asset_equipment) normalized.asset_equipment = cleanString(legacy.asset_label, 180)
  return normalized
}

export function sessionMetadataToJson(metadata: SessionMetadata): Json {
  return Object.fromEntries(
    SESSION_METADATA_FIELDS.map((field) => [field.name, metadata[field.name]]).filter(([, value]) => value),
  ) as Json
}
