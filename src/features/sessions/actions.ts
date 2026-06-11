'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import type { Json } from '@/lib/supabase/database.types'

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
  return SESSION_TYPES.includes(sessionType as (typeof SESSION_TYPES)[number])
}

export async function createDocumentationSession(formData: FormData) {
  const title = getTrimmedValue(formData, 'title')
  const sessionType = getTrimmedValue(formData, 'session_type')

  if (!title || !isAllowedSessionType(sessionType)) {
    redirect('/dashboard/sessions/new?error=Please%20enter%20a%20title%20and%20session%20type.')
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const { data: session, error } = await supabase
    .from('documentation_sessions')
    .insert({
      title,
      session_type: sessionType,
      status: 'draft',
      created_by: profile.id,
      organization_id: profile.organization_id,
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

const APPLY_SUGGESTION_FIELDS = ['asset_label', 'vin', 'odometer', 'unit_number', 'customer_name'] as const

type ApplySuggestionField = (typeof APPLY_SUGGESTION_FIELDS)[number]

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
  return field.replace(/_/g, ' ')
}

export async function applyExtractedEvidenceField(sessionId: string, formData: FormData) {
  const field = getSingleFormString(formData, 'field')
  const value = getSingleFormString(formData, 'value')
  const captureId = getSingleFormString(formData, 'capture_id')

  if (!isApplySuggestionField(field) || !value || !captureId) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent('Choose a supported extracted value to apply.')}`)
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id, organization_id, suggested_details')
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

  const updates: Partial<Record<ApplySuggestionField, string>> & { updated_at: string; suggested_details: Json } = {
    [field]: value,
    updated_at: new Date().toISOString(),
    suggested_details: suggestedDetails,
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
  const { data: session, error: sessionError } = await supabase
    .from('documentation_sessions')
    .select('id, organization_id, suggested_details')
    .eq('id', sessionId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (sessionError || !session) {
    redirect(`/dashboard/sessions/${sessionId}?error=${encodeURIComponent('Documentation session not found.')}`)
  }

  const suggestedDetails: Record<string, Json> = isRecord(session.suggested_details) ? { ...(session.suggested_details as Record<string, Json>) } : {}
  const updates: Partial<Record<ApplySuggestionField, string>> & { updated_at: string; suggested_details?: Json } = {
    updated_at: new Date().toISOString(),
  }

  for (const field of selectedFields) {
    const suggestion = isRecord(suggestedDetails[field]) ? (suggestedDetails[field] as SessionSuggestion) : null
    const value = typeof suggestion?.value === 'string' ? suggestion.value.trim() : ''

    if (!value) {
      continue
    }

    updates[field] = value
    suggestedDetails[field] = { ...suggestion, value, applied: true } as Json
  }

  const appliedCount = Object.keys(updates).filter((field) => field !== 'updated_at' && field !== 'suggested_details').length

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
