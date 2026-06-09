'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

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
