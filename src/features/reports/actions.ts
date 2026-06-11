'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireSessionWorkspace } from '@/features/sessions/data'
import type { Json } from '@/lib/supabase/database.types'

function getString(formData: FormData, field: string) {
  const value = formData.get(field)
  return typeof value === 'string' ? value.trim() : ''
}

function getRecipients(formData: FormData) {
  return getString(formData, 'recipients').split(/[;,\s]+/).map((item) => item.trim()).filter(Boolean)
}

async function requireOwnedSession(sessionId: string) {
  const workspace = await requireSessionWorkspace()
  const { data: session, error } = await workspace.supabase
    .from('documentation_sessions')
    .select('id, title, organization_id')
    .eq('id', sessionId)
    .eq('organization_id', workspace.profile.organization_id)
    .single()
  if (error || !session) redirect(`/dashboard/sessions/${sessionId}/report?error=${encodeURIComponent('Documentation session not found.')}`)
  return { ...workspace, session }
}

export async function emailReport(sessionId: string, formData: FormData) {
  const recipients = getRecipients(formData)
  if (recipients.length === 0) redirect(`/dashboard/sessions/${sessionId}/report?error=${encodeURIComponent('Enter at least one recipient email.')}`)
  const message = getString(formData, 'message')
  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  const metadata: Json = { recipients, message, subject: `Inspection Report - ${session.title}`, branding: profile.organization.name, attachment: 'printable_report_link' }
  const { error } = await supabase.from('exports').insert({
    documentation_session_id: session.id,
    organization_id: profile.organization_id,
    export_type: 'email',
    status: 'sent',
    created_by: profile.id,
    metadata,
  })
  if (error) redirect(`/dashboard/sessions/${session.id}/report?error=${encodeURIComponent(error.message)}`)
  revalidatePath(`/dashboard/sessions/${session.id}`)
  redirect(`/dashboard/sessions/${session.id}/report?emailed=1`)
}

export async function createReportShareLink(sessionId: string, formData: FormData) {
  const expiresAt = getString(formData, 'expires_at') || null
  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  const token = randomBytes(24).toString('hex')
  const { error } = await supabase.from('report_share_tokens').insert({
    documentation_session_id: session.id,
    organization_id: profile.organization_id,
    token,
    expires_at: expiresAt,
    created_by: profile.id,
  })
  if (error) redirect(`/dashboard/sessions/${session.id}/report?error=${encodeURIComponent(error.message)}`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  redirect(`/dashboard/sessions/${session.id}/report?shared=1`)
}

export async function disableReportShareLink(sessionId: string, tokenId: string) {
  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  const { error } = await supabase.from('report_share_tokens').update({ disabled_at: new Date().toISOString() }).eq('id', tokenId).eq('organization_id', profile.organization_id)
  if (error) redirect(`/dashboard/sessions/${session.id}/report?error=${encodeURIComponent(error.message)}`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  redirect(`/dashboard/sessions/${session.id}/report?disabled=1`)
}

export async function saveReport(sessionId: string) {
  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  const { error } = await supabase.from('exports').insert({
    documentation_session_id: session.id,
    organization_id: profile.organization_id,
    export_type: 'saved_report',
    status: 'saved',
    created_by: profile.id,
    metadata: { retention: 'indefinite_until_deleted' },
  })
  if (error) redirect(`/dashboard/sessions/${session.id}/report?error=${encodeURIComponent(error.message)}`)
  revalidatePath(`/dashboard/sessions/${session.id}`)
  redirect(`/dashboard/sessions/${session.id}/report?saved=1`)
}
