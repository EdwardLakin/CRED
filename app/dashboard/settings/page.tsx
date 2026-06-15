import Link from 'next/link'

import { signOut } from '../actions'
import { ThemeToggle } from '@/components/theme'
import { Button, Card } from '@/components/ui'
import { BrowserTimeZoneInput, SignaturePad } from '@/components/ui/SignaturePad'
import { clearDefaultSignature, saveDefaultSignature, saveInspectorFacilitySettings } from '@/features/settings/actions'
import { hasInternalAdminAccess, requireSessionWorkspace } from '@/features/sessions/data'

export default async function SettingsPage() {
  const { supabase, profile } = await requireSessionWorkspace()
  const organization = profile.organization
  const industry = organization.industry || 'Not set'
  const canManageInternalTools = hasInternalAdminAccess(profile)
  const settingsSaved = false
  const { data: defaultSignatureUrl } = profile.default_signature_path ? await supabase.storage.from('documentation-signatures').createSignedUrl(profile.default_signature_path, 60 * 10) : { data: null }
  const fields = [
    ['inspector_name', 'Inspector name', profile.full_name],
    ['inspector_role_or_title', 'Role/title', profile.inspector_role_or_title ?? ''],
    ['technician_license_number', 'Technician licence number', profile.technician_license_number ?? ''],
    ['inspector_phone', 'Inspector phone', profile.inspector_phone ?? ''],
    ['inspector_email', 'Inspector email', profile.inspector_email ?? ''],
    ['facility_name', 'Facility/shop name', profile.company_profile?.facility_name ?? profile.company_profile?.company_name ?? organization.name],
    ['facility_number', 'Facility number', profile.company_profile?.facility_number ?? ''],
    ['facility_address_line_1', 'Address line 1', profile.company_profile?.facility_address_line_1 ?? ''],
    ['facility_address_line_2', 'Address line 2', profile.company_profile?.facility_address_line_2 ?? ''],
    ['facility_city', 'City', profile.company_profile?.facility_city ?? ''],
    ['facility_region', 'Region/state/province', profile.company_profile?.facility_region ?? ''],
    ['facility_postal_code', 'Postal/ZIP code', profile.company_profile?.facility_postal_code ?? ''],
    ['facility_country', 'Country', profile.company_profile?.facility_country ?? ''],
    ['facility_phone', 'Facility phone', profile.company_profile?.facility_phone ?? ''],
    ['facility_email', 'Facility email', profile.company_profile?.facility_email ?? ''],
    ['permit_number', 'Permit number', profile.company_profile?.permit_number ?? ''],
    ['certification_number', 'Certification number', profile.company_profile?.certification_number ?? ''],
  ] as const

  return (
    <main className="page-shell dashboard-shell">
      <div className="section-header page-header"><div><p className="eyebrow">Settings</p><h1>Workspace settings</h1><p className="muted">Manage account details, organization context, display preferences, and workspace controls.</p></div></div>
      {settingsSaved ? <p className="success">Settings saved.</p> : null}
      <Card className="dashboard-card workspace-card"><div className="dashboard-grid settings-summary-grid"><div><strong>User</strong><p className="muted">{profile.full_name}</p></div><div><strong>Organization</strong><p className="muted">{organization.name}</p></div><div><strong>Industry</strong><p className="muted">{industry}</p></div><div className="workspace-actions"><ThemeToggle /><form action={signOut} className="sign-out-form"><Button type="submit" variant="secondary">Sign out</Button></form></div></div></Card>
      <Card className="dashboard-card workspace-card">
        <form action={saveInspectorFacilitySettings} className="form-stack">
          <div><p className="eyebrow">Reports</p><h2>Inspector / Facility Details</h2><p className="muted">Saved details autofill Review and exported reports. You can still capture a report-specific signature.</p></div>
          <label className="field-stack"><span className="label">Timezone</span><BrowserTimeZoneInput name="timezone" defaultValue={profile.timezone ?? 'UTC'} /></label>
          <div className="field-grid">{fields.map(([name, label, value]) => <label key={name} className="field-stack"><span className="label">{label}</span><input className="input" name={name} defaultValue={value} /></label>)}</div>
          
          <div className="signature-review-panel form-stack">
            <div><h3>Reusable user signature</h3><p className="muted">Save a default signature that can be applied to individual reports from Review.</p></div>
            {defaultSignatureUrl?.signedUrl ? <div className="saved-signature-card"><strong>Saved signature preview</strong>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed signature URLs are short-lived Supabase links and should render exactly as captured. */}
              <img className="saved-signature-image" src={defaultSignatureUrl.signedUrl} alt="Saved default signature" /></div> : <p className="muted">No reusable signature saved yet.</p>}
          </div>
          <label className="report-visibility-toggle"><input type="checkbox" name="use_default_signature" defaultChecked={profile.use_default_signature} /><span>Use saved default signature in reports when no report-specific signature is captured</span></label>
          <div className="form-actions"><Button type="submit">Save Inspector / Facility Details</Button></div>
        </form>
        <form action={saveDefaultSignature} className="form-stack signature-capture-form"><SignaturePad /><div className="form-actions"><Button type="submit">Save / Replace Default Signature</Button></div></form>
        {profile.default_signature_path ? <form action={clearDefaultSignature}><Button type="submit" variant="secondary">Clear Default Signature</Button></form> : null}
      </Card>
      <section className="settings-link-grid" aria-label="Settings areas">
        {canManageInternalTools ? <Link href="/dashboard/templates" className="card settings-link-card touch-target"><span className="eyebrow">Internal / Admin</span><h2>Report context library</h2><p className="muted">Admin-only compatibility tools for reusable report context. Normal evidence capture does not require setup.</p></Link> : null}
        <Link href="/dashboard/billing" className="card settings-link-card touch-target"><span className="eyebrow">Billing</span><h2>Plan and subscription</h2><p className="muted">Review current billing status, usage, storage, report sends, and checkout access.</p></Link>
      </section>
    </main>
  )
}
