import { normalizeReportType, normalizeSessionMetadata } from '@/features/sessions/report-types'

import { stripConfidenceText } from './report-structure'

type ReportTitleSession = {
  title?: string | null
  asset_label?: string | null
  customer_name?: string | null
  unit_number?: string | null
  vin?: string | null
  suggested_details?: unknown
  session_metadata?: unknown
  session_type?: string | null
}

type ReportTitleDraft = {
  title?: string | null
  header_fields?: unknown
} | null | undefined

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isPlaceholderReportTitle(value: string | null | undefined) {
  const title = stripConfidenceText(value ?? '').trim()
  return (
    !title ||
    /^(new session|session|untitled session)\b/i.test(title) ||
    /\d{4}-\d{2}-\d{2}t\d{2}:\d{2}|\butc\b/i.test(title) ||
    /^new session\b.*\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.*\b\d{1,2}:\d{2}\b/i.test(title)
  )
}

export function buildSubjectReportTitle(subject: string) {
  const cleanSubject = stripConfidenceText(subject).replace(/\s+/g, ' ').trim()
  if (!cleanSubject) return null
  if (/\b(evidence report|inspection documentation|property documentation|documentation)\b/i.test(cleanSubject)) return cleanSubject
  if (/\b(property|site|facility|building|home|house|condo|address)\b/i.test(cleanSubject)) return `${cleanSubject} Documentation`
  if (/\b(inspection|inspect)\b/i.test(cleanSubject)) return `${cleanSubject} Documentation`
  return `${cleanSubject} Evidence Report`
}

export function getReportInfoValue(draft: ReportTitleDraft, session: Pick<ReportTitleSession, 'suggested_details' | 'session_metadata' | 'customer_name' | 'asset_label'>, key: string) {
  const normalizedKey = key === 'location_address' ? 'location' : key
  const metadata = normalizeSessionMetadata(session.session_metadata, session)
  if (normalizedKey in metadata && metadata[normalizedKey as keyof typeof metadata]) return metadata[normalizedKey as keyof typeof metadata]
  if (isRecord(draft?.header_fields) && typeof draft.header_fields[key] === 'string') return draft.header_fields[key] as string
  if (isRecord(session.suggested_details) && isRecord(session.suggested_details.report_information) && typeof session.suggested_details.report_information[key] === 'string') return session.suggested_details.report_information[key] as string
  return ''
}

export function getDisplayReportTitle(draft: ReportTitleDraft, session: ReportTitleSession, options: { genericFallback?: boolean } = {}) {
  void options
  const selectedReportType = normalizeReportType(session.session_type)
  if (selectedReportType) return selectedReportType

  const subject = getReportInfoValue(draft, session, 'subject_name')
    || getReportInfoValue(draft, session, 'customer_client')
    || session.customer_name
    || getReportInfoValue(draft, session, 'asset_equipment')
    || session.asset_label
    || getReportInfoValue(draft, session, 'reference_number')
    || session.unit_number
    || session.vin
    || ''
  const subjectTitle = buildSubjectReportTitle(subject)
  if (subjectTitle) return subjectTitle

  const draftTitle = stripConfidenceText(draft?.title ?? '').trim()
  if (draftTitle && !isPlaceholderReportTitle(draftTitle)) return draftTitle

  const sessionTitle = stripConfidenceText(session.title ?? '').trim()
  if (sessionTitle && !isPlaceholderReportTitle(sessionTitle)) return sessionTitle

  return 'General Evidence Report'
}

export function buildSafeReportTitle(args: {
  draftTitle: string | null | undefined
  sessionTitle: string | null | undefined
  structureSource: string | null | undefined
  sourceDocumentName: string | null | undefined
  customerName: string | null | undefined
  assetLabel: string | null | undefined
  unitNumber: string | null | undefined
  vin: string | null | undefined
}) {
  const cleanedDraftTitle = stripConfidenceText(args.draftTitle ?? '').trim()
  if (cleanedDraftTitle && !isPlaceholderReportTitle(cleanedDraftTitle) && !/automotive|vehicle inspection/i.test(cleanedDraftTitle)) return cleanedDraftTitle
  if (args.structureSource && args.structureSource !== 'generic_fallback' && args.sourceDocumentName) return stripConfidenceText(args.sourceDocumentName).trim()
  const identity = [args.customerName, args.assetLabel, args.unitNumber, args.vin].map((value) => stripConfidenceText(value ?? '').trim()).filter(Boolean).slice(0, 2).join(' — ')
  if (identity) return buildSubjectReportTitle(identity) ?? 'General Evidence Report'
  const sessionTitle = stripConfidenceText(args.sessionTitle ?? '').trim()
  if (sessionTitle && !isPlaceholderReportTitle(sessionTitle)) return sessionTitle
  return 'General Evidence Report'
}
