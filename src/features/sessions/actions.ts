'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireActiveBillingAccess } from '@/features/billing'
import {
  FIELD_SERVICE_FIELD_LABELS,
  FIELD_SERVICE_FIELD_NAMES,
  getFieldServiceBoolean,
  isCheckboxField,
  isFieldServiceFieldName,
  isRecord as isFieldServiceRecord,
} from '@/features/field-service'
import type { Database, Json } from '@/lib/supabase/database.types'

import { requireSessionWorkspace } from './data'
import { SESSION_STATUSES, SESSION_TYPES, type SessionStatus } from './types'

function getTrimmedValue(formData: FormData, field: string) {
  const value = formData.get(field)
  return typeof value === 'string' ? value.trim() : ''
}

function getNullableValue(formData: FormData, field: string) {
  const value = getTrimmedValue(formData, field)
  return value.length > 0 ? value : null
}

function isAllowedStatus(status: string): status is SessionStatus {
  return SESSION_STATUSES.some((sessionStatus) => sessionStatus.value === status)
}

function isAllowedSessionType(sessionType: string) {
  return SESSION_TYPES.some((type) => type.value === sessionType)
}

function buildFieldServiceDetails(formData: FormData, existingDetails: Json | null | undefined): Json {
  const details: Record<string, Json> = isFieldServiceRecord(existingDetails) ? { ...(existingDetails as Record<string, Json>) } : {}

  for (const fieldName of FIELD_SERVICE_FIELD_NAMES) {
    if (isCheckboxField(fieldName)) {
      details[fieldName] = formData.get(fieldName) === 'on'
      continue
    }

    const value = getNullableValue(formData, fieldName)
    if (value === null) {
      delete details[fieldName]
    } else {
      details[fieldName] = value
    }
  }

  return details
}

export async function createDocumentationSession(formData: FormData) {
  const title = getTrimmedValue(formData, 'title')
  const sessionType = getTrimmedValue(formData, 'session_type')
  const workflowTemplateId = getNullableValue(formData, 'workflow_template_id')

  if (!title || !isAllowedSessionType(sessionType)) {
    redirect('/dashboard/sessions/new?error=Please%20enter%20a%20title%20and%20session%20type.')
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    redirect(`/dashboard?error=${encodeURIComponent(billingAccess.message)}`)
  }

  const { data: session, error } = await supabase
    .from('documentation_sessions')
    .insert({
      title,
      session_type: sessionType,
      status: 'draft',
      created_by: profile.id,
      organization_id: profile.organization_id,
      workflow_template_id: workflowTemplateId,
    })
    .select('id')
    .single()

  if (error || !session) {
    redirect(`/dashboard/sessions/new?error=${encodeURIComponent(error?.message ?? 'Unable to create session.')}`)
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/sessions')
  redirect(`/dashboard/sessions/${session.id}`)
}

export async function updateDocumentationSession(sessionId: string, formData: FormData) {
  const title = getTrimmedValue(formData, 'title')
  const status = getTrimmedValue(formData, 'status')

  if (!title || !isAllowedStatus(status)) {
    redirect(`/dashboard/sessions/${sessionId}?error=Please%20enter%20a%20title%20and%20valid%20status.`)
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent(billingAccess.message)}`)
  }

  const { data: existingSession, error: existingSessionError } = await supabase
    .from('documentation_sessions')
    .select('field_service_details')
    .eq('id', sessionId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (existingSessionError || !existingSession) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent('Documentation session not found.')}`)
  }

  const { error } = await supabase
    .from('documentation_sessions')
    .update({
      title,
      status,
      asset_label: getNullableValue(formData, 'asset_label'),
      vin: getNullableValue(formData, 'vin'),
      odometer: getNullableValue(formData, 'odometer'),
      unit_number: getNullableValue(formData, 'unit_number'),
      customer_name: getNullableValue(formData, 'customer_name'),
      field_service_details: buildFieldServiceDetails(formData, existingSession.field_service_details),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('organization_id', profile.organization_id)

  if (error) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/sessions')
  revalidatePath(`/dashboard/sessions/${sessionId}`)
  redirect(`/dashboard/sessions/${sessionId}?saved=1`)
}

export async function archiveDocumentationSession(sessionId: string) {
  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent(billingAccess.message)}`)
  }
  const { error } = await supabase
    .from('documentation_sessions')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('organization_id', profile.organization_id)

  if (error) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/sessions')
  revalidatePath(`/dashboard/sessions/${sessionId}`)
  redirect(`/dashboard/sessions/${sessionId}?saved=1`)
}

export async function restoreDocumentationSession(sessionId: string) {
  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent(billingAccess.message)}`)
  }
  const { error } = await supabase
    .from('documentation_sessions')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('organization_id', profile.organization_id)

  if (error) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/sessions')
  revalidatePath(`/dashboard/sessions/${sessionId}`)
  redirect(`/dashboard/sessions/${sessionId}?saved=1`)
}

const BASE_APPLY_SUGGESTION_FIELDS = ['asset_label', 'vin', 'odometer', 'unit_number', 'customer_name'] as const
const APPLY_SUGGESTION_FIELDS = [...BASE_APPLY_SUGGESTION_FIELDS, ...FIELD_SERVICE_FIELD_NAMES] as const

type BaseApplySuggestionField = (typeof BASE_APPLY_SUGGESTION_FIELDS)[number]
type ApplySuggestionField = (typeof APPLY_SUGGESTION_FIELDS)[number]
type DocumentationSessionUpdate = Database['public']['Tables']['documentation_sessions']['Update']

type SessionSuggestion = {
  value?: Json
  source_capture_id?: Json
  confidence?: Json
  reason?: Json
  source_type?: Json
  priority?: Json
  applied?: Json
}

function isApplySuggestionField(value: string): value is ApplySuggestionField {
  return APPLY_SUGGESTION_FIELDS.includes(value as ApplySuggestionField)
}

function isBaseApplySuggestionField(value: string): value is BaseApplySuggestionField {
  return BASE_APPLY_SUGGESTION_FIELDS.includes(value as BaseApplySuggestionField)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getSelectedSuggestionFields(formData: FormData) {
  return formData
    .getAll('selected_fields')
    .filter((value): value is string => typeof value === 'string')
    .filter(isApplySuggestionField)
}

function getSingleFormString(formData: FormData, field: string) {
  const value = formData.get(field)
  return typeof value === 'string' ? value.trim() : ''
}

function getApplyFieldLabel(field: ApplySuggestionField) {
  return FIELD_SERVICE_FIELD_LABELS[field] ?? field.replace(/_/g, ' ')
}

export async function applyExtractedEvidenceField(sessionId: string, formData: FormData) {
  const field = getSingleFormString(formData, 'field')
  const value = getSingleFormString(formData, 'value')
  const captureId = getSingleFormString(formData, 'capture_id')

  if (!isApplySuggestionField(field) || !value || !captureId) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent('Choose a supported extracted value to apply.')}`)
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent(billingAccess.message)}`)
  }

  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id, organization_id, suggested_details, field_service_details')
    .eq('id', sessionId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent('Documentation session not found.')}`)
  }

  const { data: capture, error: captureError } = await supabase
    .from('capture_items')
    .select('id')
    .eq('id', captureId)
    .eq('documentation_session_id', session.id)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .single()

  if (captureError || !capture) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent('Evidence capture not found.')}`)
  }

  const suggestedDetails: Record<string, Json> = isRecord(session.suggested_details) ? { ...(session.suggested_details as Record<string, Json>) } : {}
  const existingSuggestion = isRecord(suggestedDetails[field]) ? (suggestedDetails[field] as SessionSuggestion) : {}
  suggestedDetails[field] = {
    ...existingSuggestion,
    value,
    source_capture_id: capture.id,
    source_type: 'extracted_evidence',
    applied: true,
  } as Json

  const fieldServiceDetails: Record<string, Json> = isFieldServiceFieldName(field) && isFieldServiceRecord(session.field_service_details)
    ? { ...(session.field_service_details as Record<string, Json>) }
    : {}
  const updates: DocumentationSessionUpdate = {
    updated_at: new Date().toISOString(),
    suggested_details: suggestedDetails,
  }

  if (isBaseApplySuggestionField(field)) {
    updates[field] = value
  }

  if (isFieldServiceFieldName(field)) {
    fieldServiceDetails[field] = isCheckboxField(field) ? getFieldServiceBoolean({ [field]: value }, field) : value
    updates.field_service_details = fieldServiceDetails
  }

  const { error } = await supabase
    .from('documentation_sessions')
    .update(updates)
    .eq('id', session.id)
    .eq('organization_id', profile.organization_id)

  if (error) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/sessions')
  revalidatePath(`/dashboard/sessions/${sessionId}`)
  redirect(`/dashboard/sessions/${sessionId}?saved=1&appliedField=${encodeURIComponent(getApplyFieldLabel(field))}#extracted-evidence`)
}

export async function applySessionSuggestions(sessionId: string, formData: FormData) {
  const selectedFields = Array.from(new Set(getSelectedSuggestionFields(formData)))

  if (selectedFields.length === 0) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent('Choose at least one supported suggestion to apply.')}`)
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent(billingAccess.message)}`)
  }

  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id, organization_id, suggested_details, field_service_details')
    .eq('id', sessionId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent('Documentation session not found.')}`)
  }

  const suggestedDetails: Record<string, Json> = isRecord(session.suggested_details) ? { ...(session.suggested_details as Record<string, Json>) } : {}
  const fieldServiceDetails: Record<string, Json> = isFieldServiceRecord(session.field_service_details) ? { ...(session.field_service_details as Record<string, Json>) } : {}
  const updates: DocumentationSessionUpdate = {
    updated_at: new Date().toISOString(),
  }

  let appliedCount = 0

  for (const field of selectedFields) {
    const suggestion = isRecord(suggestedDetails[field]) ? (suggestedDetails[field] as SessionSuggestion) : null
    const value = typeof suggestion?.value === 'string' ? suggestion.value.trim() : ''

    if (!value) {
      continue
    }

    if (isBaseApplySuggestionField(field)) {
      updates[field] = value
    }

    if (isFieldServiceFieldName(field)) {
      fieldServiceDetails[field] = isCheckboxField(field) ? getFieldServiceBoolean({ [field]: value }, field) : value
      updates.field_service_details = fieldServiceDetails
    }
    suggestedDetails[field] = { ...suggestion, value, applied: true } as Json
    appliedCount += 1
  }

  if (appliedCount === 0) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent('Selected suggestions no longer have values to apply.')}`)
  }

  updates.suggested_details = suggestedDetails

  const { error } = await supabase
    .from('documentation_sessions')
    .update(updates)
    .eq('id', session.id)
    .eq('organization_id', profile.organization_id)

  if (error) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/sessions')
  revalidatePath(`/dashboard/sessions/${sessionId}`)
  redirect(`/dashboard/sessions/${sessionId}?saved=1&suggestionsApplied=${appliedCount}`)
}
