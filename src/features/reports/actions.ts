'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getBillingAccessErrorMessage, getOrganizationBillingAccess } from '@/features/billing'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { ReportEmailError, sendReportEmail, validateReportEmailRecipients } from '@/lib/email/reports'
import type { Json } from '@/lib/supabase/database.types'

const REPORT_SHARE_EXPIRATION_DAYS = 30

function getString(formData: FormData, field: string) {
  const value = formData.get(field)
  return typeof value === 'string' ? value.trim() : ''
}

function getRecipients(formData: FormData) {
  return getString(formData, 'recipients')
}

function getReportRedirectPath(sessionId: string, params: Record<string, string | number> = {}) {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => searchParams.set(key, String(value)))
  const query = searchParams.toString()

  return `/dashboard/sessions/${sessionId}/report${query ? `?${query}` : ''}`
}

function getPublicAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()

  if (!appUrl) {
    console.error('Report email delivery requires NEXT_PUBLIC_APP_URL to generate public share links.')
    throw new ReportEmailError('Email delivery is not configured.')
  }

  try {
    return new URL(appUrl).origin
  } catch {
    console.error('Report email delivery has an invalid NEXT_PUBLIC_APP_URL value.')
    throw new ReportEmailError('Email delivery is not configured.')
  }
}

async function requireOwnedSession(sessionId: string) {
  const workspace = await requireSessionWorkspace()
  const { data: session, error } = await workspace.supabase
    .from('documentation_sessions')
    .select('id, title, organization_id')
    .eq('id', sessionId)
    .eq('organization_id', workspace.profile.organization_id)
    .single()
  if (error || !session) redirect(getReportRedirectPath(sessionId, { error: 'Documentation session not found.' }))
  return { ...workspace, session }
}

async function getOrCreateActiveShareToken({
  createdBy,
  organizationId,
  sessionId,
  supabase,
}: {
  createdBy: string
  organizationId: string
  sessionId: string
  supabase: Awaited<ReturnType<typeof requireSessionWorkspace>>['supabase']
}) {
  const now = new Date()
  const { data: existingTokens, error: existingTokenError } = await supabase
    .from('report_share_tokens')
    .select('id, token, expires_at')
    .eq('documentation_session_id', sessionId)
    .eq('organization_id', organizationId)
    .is('disabled_at', null)
    .order('created_at', { ascending: false })

  if (existingTokenError) {
    throw new ReportEmailError(existingTokenError.message)
  }

  const activeToken = existingTokens?.find((shareToken) => !shareToken.expires_at || new Date(shareToken.expires_at) > now)
  if (activeToken) {
    return activeToken.token
  }

  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + REPORT_SHARE_EXPIRATION_DAYS)

  const { data: createdToken, error: createTokenError } = await supabase
    .from('report_share_tokens')
    .insert({
      documentation_session_id: sessionId,
      organization_id: organizationId,
      token: randomBytes(24).toString('hex'),
      expires_at: expiresAt.toISOString(),
      created_by: createdBy,
    })
    .select('token')
    .single()

  if (createTokenError || !createdToken) {
    throw new ReportEmailError(createTokenError?.message ?? 'Could not create secure report link.')
  }

  return createdToken.token
}

export async function emailReport(sessionId: string, formData: FormData) {
  const message = getString(formData, 'message')
  let recipients: string[]

  try {
    recipients = validateReportEmailRecipients(getRecipients(formData))
  } catch (error) {
    const message = error instanceof ReportEmailError ? error.message : 'Check the recipient email addresses.'
    redirect(getReportRedirectPath(sessionId, { error: message }))
  }

  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  const billingAccess = getOrganizationBillingAccess(profile.organization)
  if (!billingAccess.hasAccess) {
    redirect(getReportRedirectPath(session.id, { error: getBillingAccessErrorMessage(billingAccess) }))
  }

  const subject = `Inspection Report - ${session.title}`
  let providerMessageId: string

  try {
    const token = await getOrCreateActiveShareToken({
      createdBy: profile.id,
      organizationId: profile.organization_id,
      sessionId: session.id,
      supabase,
    })
    const reportUrl = `${getPublicAppUrl()}/reports/share/${token}`
    const result = await sendReportEmail({
      to: recipients,
      subject,
      message,
      reportUrl,
      organizationName: profile.organization.name,
      sessionTitle: session.title,
    })
    providerMessageId = result.id
    recipients = result.recipients
  } catch (error) {
    const message = error instanceof ReportEmailError ? error.message : 'Email could not be sent. Please try again.'
    redirect(getReportRedirectPath(session.id, { error: message }))
  }

  const metadata: Json = {
    recipients,
    subject,
    branding: profile.organization.name,
    delivery: 'secure_printable_report_link',
    provider: 'sendgrid',
    provider_message_id: providerMessageId,
    custom_message_included: Boolean(message),
  }
  const { error } = await supabase.from('exports').insert({
    documentation_session_id: session.id,
    organization_id: profile.organization_id,
    export_type: 'email',
    status: 'sent',
    created_by: profile.id,
    metadata,
  })
  if (error) redirect(getReportRedirectPath(session.id, { error: error.message }))
  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  redirect(getReportRedirectPath(session.id, { emailed: 1 }))
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
  if (error) redirect(getReportRedirectPath(session.id, { error: error.message }))
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  redirect(getReportRedirectPath(session.id, { shared: 1 }))
}

export async function disableReportShareLink(sessionId: string, tokenId: string) {
  const { supabase, profile, session } = await requireOwnedSession(sessionId)
  const { error } = await supabase.from('report_share_tokens').update({ disabled_at: new Date().toISOString() }).eq('id', tokenId).eq('organization_id', profile.organization_id)
  if (error) redirect(getReportRedirectPath(session.id, { error: error.message }))
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  redirect(getReportRedirectPath(session.id, { disabled: 1 }))
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
  if (error) redirect(getReportRedirectPath(session.id, { error: error.message }))
  revalidatePath(`/dashboard/sessions/${session.id}`)
  redirect(getReportRedirectPath(session.id, { saved: 1 }))
}
