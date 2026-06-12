'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireActiveBillingAccess } from '@/features/billing'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { recordUsageEvent, requireUsageAllowance } from '@/features/usage'
import { analyzeTemplateUpload } from './analyzer'
import { SYSTEM_TEMPLATES, toJson, type EvidenceRequirement } from './types'

const TEMPLATE_BUCKET = 'documentation-templates'
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

function getString(formData: FormData, field: string) {
  const value = formData.get(field)
  return typeof value === 'string' ? value.trim() : ''
}

function parseLines(value: string) {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
}

function buildRequirement(label: string, required = true): EvidenceRequirement {
  return {
    key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
    label,
    required,
    matchTerms: [label.toLowerCase()],
  }
}

export async function importTemplate(formData: FormData) {
  const file = formData.get('template_file')
  if (!(file instanceof File) || file.size === 0) {
    redirect('/dashboard/settings/templates?error=Choose%20a%20PDF%2C%20DOCX%2C%20image%2C%20or%20paper%20form%20photo.')
  }

  const mimeType = file.type || 'application/octet-stream'
  if (!ALLOWED_TYPES.has(mimeType)) {
    redirect('/dashboard/settings/templates?error=Form%20Profile%20uploads%20support%20PDF%2C%20DOCX%2C%20images%2C%20and%20paper%20form%20photos.')
  }

  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    redirect(`/dashboard/settings/templates?error=${encodeURIComponent(billingAccess.message)}`)
  }

  const storageAllowance = await requireUsageAllowance({
    supabase,
    organizationId: profile.organization_id,
    plan: billingAccess.access.plan,
    eventType: 'storage_bytes_added',
    quantity: file.size,
    fileSizeBytes: file.size,
  })

  if (!storageAllowance.ok) {
    redirect(`/dashboard/settings/templates?error=${encodeURIComponent(storageAllowance.message)}`)
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 160)
  const storagePath = `organizations/${profile.organization_id}/templates/${Date.now()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from(TEMPLATE_BUCKET).upload(storagePath, file, { contentType: mimeType, upsert: false })

  if (uploadError) {
    redirect(`/dashboard/settings/templates?error=${encodeURIComponent(uploadError.message)}`)
  }

  const draft = analyzeTemplateUpload(file.name, mimeType)
  const { data: templateImport, error: importError } = await supabase
    .from('template_imports')
    .insert({
      organization_id: profile.organization_id,
      filename: file.name,
      source_file_path: storagePath,
      ai_status: 'draft_ready',
      extracted_structure: toJson(draft),
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (importError || !templateImport) {
    redirect(`/dashboard/settings/templates?error=${encodeURIComponent(importError?.message ?? 'Unable to save form profile import.')}`)
  }

  const { error: templateError } = await supabase.from('documentation_workflow_templates').insert({
    organization_id: profile.organization_id,
    name: draft.name,
    description: draft.description,
    template_type: 'organization',
    source_import_id: templateImport.id,
    required_evidence: toJson(draft.requiredEvidence),
    recommended_evidence: toJson(draft.recommendedEvidence),
    sections: toJson(draft.sections),
    fields: toJson(draft.fields),
    pdf_layout: toJson(draft.pdfLayout),
    signature_requirements: toJson(draft.signatureRequirements),
    created_by: profile.id,
  })

  if (templateError) {
    redirect(`/dashboard/settings/templates?error=${encodeURIComponent(templateError.message)}`)
  }

  await recordUsageEvent({
    supabase,
    organizationId: profile.organization_id,
    eventType: 'template_imported',
    metadata: { template_import_id: templateImport.id, filename: file.name, mime_type: mimeType, size: file.size },
    createdBy: profile.id,
  })
  await recordUsageEvent({
    supabase,
    organizationId: profile.organization_id,
    eventType: 'storage_bytes_added',
    quantity: file.size,
    metadata: { source: 'template_import', template_import_id: templateImport.id, filename: file.name, mime_type: mimeType },
    createdBy: profile.id,
  })

  revalidatePath('/dashboard/settings/templates')
  redirect('/dashboard/settings/templates?imported=1')
}

export async function saveTemplate(templateId: string, formData: FormData) {
  const name = getString(formData, 'name')
  if (!name) redirect('/dashboard/settings/templates?error=Form%20Profile%20name%20is%20required.')
  const description = getString(formData, 'description')
  const sections = parseLines(getString(formData, 'sections'))
  const fields = parseLines(getString(formData, 'fields'))
  const requiredEvidence = parseLines(getString(formData, 'required_evidence')).map((label) => buildRequirement(label, true))
  const optionalEvidence = parseLines(getString(formData, 'recommended_evidence')).map((label) => buildRequirement(label, false))
  const signatureRequirements = parseLines(getString(formData, 'signature_requirements')).map((label) => buildRequirement(label, !label.toLowerCase().includes('optional')))
  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    redirect(`/dashboard/settings/templates?error=${encodeURIComponent(billingAccess.message)}`)
  }

  const { error } = await supabase.from('documentation_workflow_templates').update({
    name,
    description,
    sections: toJson(sections),
    fields: toJson(fields),
    required_evidence: toJson(requiredEvidence),
    recommended_evidence: toJson(optionalEvidence),
    signature_requirements: toJson(signatureRequirements),
    updated_at: new Date().toISOString(),
  }).eq('id', templateId).eq('organization_id', profile.organization_id)

  if (error) redirect(`/dashboard/settings/templates?error=${encodeURIComponent(error.message)}`)
  revalidatePath('/dashboard/settings/templates')
  redirect('/dashboard/settings/templates?saved=1')
}

export async function duplicateSystemTemplate(index: number) {
  const draft = SYSTEM_TEMPLATES[index]
  if (!draft) redirect('/dashboard/settings/templates?error=System%20Form%20Profile%20not%20found.')
  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    redirect(`/dashboard/settings/templates?error=${encodeURIComponent(billingAccess.message)}`)
  }

  const { error } = await supabase.from('documentation_workflow_templates').insert({
    organization_id: profile.organization_id,
    name: `${draft.name} Copy`,
    description: draft.description,
    template_type: 'organization',
    required_evidence: toJson(draft.requiredEvidence),
    recommended_evidence: toJson(draft.recommendedEvidence),
    sections: toJson(draft.sections),
    fields: toJson(draft.fields),
    pdf_layout: toJson(draft.pdfLayout),
    signature_requirements: toJson(draft.signatureRequirements),
    created_by: profile.id,
  })
  if (error) redirect(`/dashboard/settings/templates?error=${encodeURIComponent(error.message)}`)
  revalidatePath('/dashboard/settings/templates')
  redirect('/dashboard/settings/templates?duplicated=1')
}

export async function duplicateOrganizationTemplate(templateId: string) {
  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    redirect(`/dashboard/settings/templates?error=${encodeURIComponent(billingAccess.message)}`)
  }

  const { data: template, error: loadError } = await supabase.from('documentation_workflow_templates').select('*').eq('id', templateId).eq('organization_id', profile.organization_id).single()
  if (loadError || !template) redirect('/dashboard/settings/templates?error=Form%20Profile%20not%20found.')
  const { error } = await supabase.from('documentation_workflow_templates').insert({
    organization_id: profile.organization_id,
    name: `${template.name} Copy`,
    description: template.description,
    template_type: 'organization',
    source_import_id: template.source_import_id,
    required_evidence: template.required_evidence,
    recommended_evidence: template.recommended_evidence,
    sections: template.sections,
    fields: template.fields,
    pdf_layout: template.pdf_layout,
    signature_requirements: template.signature_requirements,
    created_by: profile.id,
  })
  if (error) redirect(`/dashboard/settings/templates?error=${encodeURIComponent(error.message)}`)
  revalidatePath('/dashboard/settings/templates')
  redirect('/dashboard/settings/templates?duplicated=1')
}

export async function archiveTemplate(templateId: string) {
  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    redirect(`/dashboard/settings/templates?error=${encodeURIComponent(billingAccess.message)}`)
  }

  const { error } = await supabase.from('documentation_workflow_templates').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', templateId).eq('organization_id', profile.organization_id)
  if (error) redirect(`/dashboard/settings/templates?error=${encodeURIComponent(error.message)}`)
  revalidatePath('/dashboard/settings/templates')
  redirect('/dashboard/settings/templates?archived=1')
}

export async function deleteTemplate(templateId: string) {
  const { supabase, profile } = await requireSessionWorkspace()
  const billingAccess = requireActiveBillingAccess(profile)

  if (!billingAccess.ok) {
    redirect(`/dashboard/settings/templates?error=${encodeURIComponent(billingAccess.message)}`)
  }

  const { error } = await supabase.from('documentation_workflow_templates').delete().eq('id', templateId).eq('organization_id', profile.organization_id)
  if (error) redirect(`/dashboard/settings/templates?error=${encodeURIComponent(error.message)}`)
  revalidatePath('/dashboard/settings/templates')
  redirect('/dashboard/settings/templates?deleted=1')
}
