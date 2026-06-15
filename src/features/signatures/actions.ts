'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireActiveBillingAccess } from '@/features/billing'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { recordUsageEvent, requireUsageAllowance } from '@/features/usage'

const SIGNATURE_BUCKET = 'documentation-signatures'
const SIGNATURE_TYPES = new Set(['Technician Signature', 'Customer Signature', 'Inspector Signature', 'Supervisor Signature'])

function getString(formData: FormData, field: string) {
  const value = formData.get(field)
  return typeof value === 'string' ? value.trim() : ''
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/)
  if (!match) return null
  return { extension: match[1] === 'jpeg' ? 'jpg' : match[1], bytes: Buffer.from(match[2], 'base64'), mimeType: `image/${match[1]}` }
}

export async function saveSignature(sessionId: string, formData: FormData) {
  const signerName = getString(formData, 'signer_name')
  const signatureType = getString(formData, 'signature_type')
  const signatureDataUrl = getString(formData, 'signature_data_url')

  if (!signerName || !SIGNATURE_TYPES.has(signatureType)) {
    redirect(`/dashboard/sessions/${sessionId}/report?error=${encodeURIComponent('Signer name and signature type are required.')}`)
  }

  const decoded = decodeDataUrl(signatureDataUrl)
  if (!decoded || decoded.bytes.byteLength < 100) {
    redirect(`/dashboard/sessions/${sessionId}/report?error=${encodeURIComponent('Capture a signature before saving.')}`)
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    redirect(`/dashboard/sessions/${sessionId}/report?error=${encodeURIComponent(billingAccess.message)}`)
  }

  const storageAllowance = await requireUsageAllowance({
    supabase,
    organizationId: profile.organization_id,
    plan: billingAccess.access.plan,
    eventType: 'storage_bytes_added',
    quantity: decoded.bytes.byteLength,
    fileSizeBytes: decoded.bytes.byteLength,
  })

  if (!storageAllowance.ok) {
    redirect(`/dashboard/sessions/${sessionId}/report?error=${encodeURIComponent(storageAllowance.message)}`)
  }

  const { data: session, error: sessionError } = await supabase.from('documentation_sessions').select('id').eq('id', sessionId).eq('organization_id', profile.organization_id).single()
  if (sessionError || !session) redirect(`/dashboard/sessions/${sessionId}/report?error=${encodeURIComponent('Documentation session not found.')}`)

  const storagePath = `organizations/${profile.organization_id}/sessions/${session.id}/signatures/${Date.now()}-${signatureType.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${decoded.extension}`
  const { error: uploadError } = await supabase.storage.from(SIGNATURE_BUCKET).upload(storagePath, decoded.bytes, { contentType: decoded.mimeType, upsert: false })
  if (uploadError) redirect(`/dashboard/sessions/${session.id}/report?error=${encodeURIComponent(uploadError.message)}`)

  const { error } = await supabase.from('signature_captures').insert({
    documentation_session_id: session.id,
    organization_id: profile.organization_id,
    signature_type: signatureType,
    signer_name: signerName,
    signature_image_path: storagePath,
    created_by: profile.id,
  })

  if (error) redirect(`/dashboard/sessions/${session.id}/report?error=${encodeURIComponent(error.message)}`)
  await recordUsageEvent({
    supabase,
    organizationId: profile.organization_id,
    eventType: 'signature_captured',
    metadata: { session_id: session.id, signature_type: signatureType, size: decoded.bytes.byteLength },
    createdBy: profile.id,
  })
  await recordUsageEvent({
    supabase,
    organizationId: profile.organization_id,
    eventType: 'storage_bytes_added',
    quantity: decoded.bytes.byteLength,
    metadata: { source: 'signature', session_id: session.id, signature_type: signatureType },
    createdBy: profile.id,
  })
  revalidatePath(`/dashboard/sessions/${session.id}`)
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  redirect(`/dashboard/sessions/${session.id}/report?saved=signature`)
}

export async function useSavedSignature(sessionId: string) {
  const { supabase, profile } = await requireSessionWorkspace()
  if (!profile.use_default_signature || !profile.default_signature_path) {
    redirect(`/dashboard/sessions/${sessionId}/report?error=${encodeURIComponent('No enabled saved signature is available.')}`)
  }
  const { data: session, error: sessionError } = await supabase.from('documentation_sessions').select('id').eq('id', sessionId).eq('organization_id', profile.organization_id).single()
  if (sessionError || !session) redirect(`/dashboard/sessions/${sessionId}/report?error=${encodeURIComponent('Documentation session not found.')}`)
  const { data: existing } = await supabase.from('signature_captures').select('id').eq('documentation_session_id', session.id).eq('organization_id', profile.organization_id).ilike('signature_type', '%Inspector%').maybeSingle()
  if (existing) redirect(`/dashboard/sessions/${session.id}/report?saved=signature`)
  const { error } = await supabase.from('signature_captures').insert({
    documentation_session_id: session.id,
    organization_id: profile.organization_id,
    signature_type: 'Inspector Signature',
    signer_name: profile.full_name,
    signature_image_path: profile.default_signature_path,
    created_by: profile.id,
  })
  if (error) redirect(`/dashboard/sessions/${session.id}/report?error=${encodeURIComponent(error.message)}`)
  await recordUsageEvent({ supabase, organizationId: profile.organization_id, eventType: 'signature_captured', metadata: { session_id: session.id, signature_type: 'Inspector Signature', source: 'default_signature' }, createdBy: profile.id })
  revalidatePath(`/dashboard/sessions/${session.id}/report`)
  redirect(`/dashboard/sessions/${session.id}/report?saved=signature`)
}
