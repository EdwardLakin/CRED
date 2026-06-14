'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireSessionWorkspace } from '@/features/sessions/data'

function getString(formData: FormData, field: string) {
  const value = formData.get(field)
  return typeof value === 'string' ? value.trim() || null : null
}

export async function saveInspectorFacilitySettings(formData: FormData) {
  const { supabase, profile } = await requireSessionWorkspace()

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name: getString(formData, 'inspector_name') ?? profile.full_name,
      inspector_role_or_title: getString(formData, 'inspector_role_or_title'),
      technician_license_number: getString(formData, 'technician_license_number'),
      inspector_phone: getString(formData, 'inspector_phone'),
      inspector_email: getString(formData, 'inspector_email'),
      use_default_signature: formData.get('use_default_signature') === 'on',
    })
    .eq('id', profile.id)
    .eq('organization_id', profile.organization_id)

  if (profileError) redirect(`/dashboard/settings?error=${encodeURIComponent(profileError.message)}`)

  const facility = {
    facility_name: getString(formData, 'facility_name'),
    facility_number: getString(formData, 'facility_number'),
    facility_address_line_1: getString(formData, 'facility_address_line_1'),
    facility_address_line_2: getString(formData, 'facility_address_line_2'),
    facility_city: getString(formData, 'facility_city'),
    facility_region: getString(formData, 'facility_region'),
    facility_postal_code: getString(formData, 'facility_postal_code'),
    facility_country: getString(formData, 'facility_country'),
    facility_phone: getString(formData, 'facility_phone'),
    facility_email: getString(formData, 'facility_email'),
    permit_number: getString(formData, 'permit_number'),
    certification_number: getString(formData, 'certification_number'),
  }

  const { error: companyError } = await supabase
    .from('company_profiles')
    .upsert({
      organization_id: profile.organization_id,
      company_name: profile.company_profile?.company_name ?? profile.organization.name,
      ...facility,
    }, { onConflict: 'organization_id' })

  if (companyError) redirect(`/dashboard/settings?error=${encodeURIComponent(companyError.message)}`)

  revalidatePath('/dashboard/settings')
  redirect('/dashboard/settings?saved=inspector-facility')
}
