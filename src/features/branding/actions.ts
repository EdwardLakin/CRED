/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireSessionWorkspace } from '@/features/sessions/data'
import { COVER_PAGE_LAYOUTS, DEFAULT_BRAND_COLORS, DEFAULT_REPORT_STYLE, EVIDENCE_IMAGE_SIZES, EVIDENCE_STYLES, FOOTER_LAYOUTS, HEADER_LAYOUTS, SECTION_STYLES, TYPOGRAPHY_PRESETS, WATERMARK_OPTIONS, isValidHexColor } from './types'
const BUCKET='documentation-branding'
function s(fd:FormData,k:string){const v=fd.get(k); return typeof v==='string'?v.trim():''}
function b(fd:FormData,k:string){return fd.get(k)==='on'}
async function uploadImage(file: File | null, org:string, kind:string, supabase:any){ if(!file || file.size===0) return undefined; if(!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.type)) throw new Error(`${kind} must be PNG, JPEG, WEBP, or SVG.`); if(file.size>2_000_000) throw new Error(`${kind} must be 2 MB or smaller.`); const ext=(file.name.split('.').pop()||'png').replace(/[^a-z0-9]/gi,'').toLowerCase(); const path=`organizations/${org}/branding/${kind}-${Date.now()}.${ext}`; const bytes=Buffer.from(await file.arrayBuffer()); const {error}=await supabase.storage.from(BUCKET).upload(path,bytes,{contentType:file.type,upsert:false}); if(error) throw error; return path }
export async function saveBrandingSettings(formData: FormData){ const {supabase, profile}=await requireSessionWorkspace(); try{ const colorKeys=['primary','accent','headerBackground','headerText','footerBackground','footerText','sectionHeading','border','mutedBackground','evidenceAccent'] as const; const colors={...DEFAULT_BRAND_COLORS}; for(const key of colorKeys){const value=s(formData,`color_${key}`)||colors[key]; if(!isValidHexColor(value)) throw new Error(`Enter a valid hex color for ${key}.`); colors[key]=value} const preset=TYPOGRAPHY_PRESETS.includes(s(formData,'typography_preset') as any)?s(formData,'typography_preset'):'professional_sans'; const header=HEADER_LAYOUTS.includes(s(formData,'header_layout') as any)?s(formData,'header_layout'):'classic_letterhead'; const currentPath=(name:string)=>s(formData,`current_${name}`)||null; const remove=(name:string)=>b(formData,`remove_${name}`); const logo= remove('logo')?null:(await uploadImage(formData.get('logo') as File | null,profile.organization_id,'logo',supabase) ?? currentPath('logo')); const darkLogo= remove('dark_logo')?null:(await uploadImage(formData.get('dark_logo') as File | null,profile.organization_id,'dark-logo',supabase) ?? currentPath('dark_logo')); const icon= remove('icon')?null:(await uploadImage(formData.get('icon') as File | null,profile.organization_id,'icon',supabase) ?? currentPath('icon')); const sig= remove('signature')?null:(await uploadImage(formData.get('signature') as File | null,profile.organization_id,'signature',supabase) ?? currentPath('signature')); const reportStyle={...DEFAULT_REPORT_STYLE, sectionStyle:SECTION_STYLES.includes(s(formData,'section_style') as any)?s(formData,'section_style'):'carded', evidenceImageSize:EVIDENCE_IMAGE_SIZES.includes(s(formData,'evidence_image_size') as any)?s(formData,'evidence_image_size'):'standard', evidenceStyle:EVIDENCE_STYLES.includes(s(formData,'evidence_style') as any)?s(formData,'evidence_style'):'carded', evidenceNumbering:b(formData,'evidence_numbering'), evidenceAppendix:b(formData,'evidence_appendix'), timestamps:b(formData,'timestamps'), captureMetadata:b(formData,'capture_metadata'), notes:b(formData,'evidence_notes'), location:b(formData,'evidence_location'), evidenceIds:b(formData,'evidence_ids'), sectionGrouping:b(formData,'section_grouping'), showReportDate:b(formData,'show_report_date'), showPreparedBy:b(formData,'show_prepared_by'), showPageNumber:b(formData,'show_page_number'), showGeneratedByCred:b(formData,'show_generated_by_cred'), typedSignature:s(formData,'typed_signature')||null, signatureDate:b(formData,'signature_date'), approvalBlock:b(formData,'approval_block'), reviewedByLabel:s(formData,'reviewed_by_label')||'Reviewed by', coverPage:COVER_PAGE_LAYOUTS.includes(s(formData,'cover_page') as any)?s(formData,'cover_page'):'none', coverImageSource:s(formData,'cover_image_source')==='first_evidence_image'?'first_evidence_image':'none', showCoverLogo:b(formData,'showCoverLogo'), showCoverCompanyInfo:b(formData,'showCoverCompanyInfo'), showCoverTitle:b(formData,'showCoverTitle'), showCoverClient:b(formData,'showCoverClient'), showCoverAsset:b(formData,'showCoverAsset'), showCoverLocation:b(formData,'showCoverLocation'), showCoverPreparedBy:b(formData,'showCoverPreparedBy'), showCoverDate:b(formData,'showCoverDate'), showCoverReportId:b(formData,'showCoverReportId'), showCoverImage:b(formData,'showCoverImage'), showConfidentialityLabel:b(formData,'showConfidentialityLabel'), showSectionLabels:b(formData,'showSectionLabels'), showSectionDividers:b(formData,'showSectionDividers'), showSectionNumbers:b(formData,'showSectionNumbers'), sectionSpacing:['compact','standard','spacious'].includes(s(formData,'section_spacing'))?s(formData,'section_spacing'):'standard', watermark:{...DEFAULT_REPORT_STYLE.watermark, option:WATERMARK_OPTIONS.includes(s(formData,'watermark_option') as any)?s(formData,'watermark_option'):'none', text:s(formData,'watermark_text')}}; const payload={organization_id:profile.organization_id, display_name:s(formData,'display_name')||null, tagline:s(formData,'tagline')||null, phone:s(formData,'phone')||null, email:s(formData,'email')||null, website:s(formData,'website')||null, address:s(formData,'address')||null, license_number:s(formData,'license_number')||null, certification_number:s(formData,'certification_number')||null, tax_number:s(formData,'tax_number')||null, insurance_number:s(formData,'insurance_number')||null, business_hours:s(formData,'business_hours')||null, department:s(formData,'department')||null, branch_location:s(formData,'branch_location')||null, prepared_by_name:s(formData,'prepared_by_name')||null, prepared_by_title:s(formData,'prepared_by_title')||null, logo_storage_path:logo, dark_logo_storage_path:darkLogo, icon_storage_path:icon, signature_storage_path:sig, colors, typography:{preset}, header_layout:header, footer_layout:FOOTER_LAYOUTS.includes(s(formData,'footer_layout') as any)?s(formData,'footer_layout'):'minimal', report_style:reportStyle, footer_text:s(formData,'footer_text')||null, show_report_id:b(formData,'show_report_id'), show_page_date:b(formData,'show_page_date'), show_contact_info:b(formData,'show_contact_info'), show_confidentiality_note:b(formData,'show_confidentiality_note'), show_signature_block:b(formData,'show_signature_block'), updated_by:profile.id}; const {error}=await (supabase.from('workspace_brand_profiles') as any).upsert(payload,{onConflict:'organization_id'}); if(error) throw error }catch(e){ redirect(`/dashboard/settings/branding?error=${encodeURIComponent(e instanceof Error?e.message:'Unable to save branding.')}`)} revalidatePath('/dashboard/settings/branding'); redirect('/dashboard/settings/branding?saved=1') }
export async function resetBrandingSettings(){ const {supabase, profile}=await requireSessionWorkspace(); await (supabase.from('workspace_brand_profiles') as any).delete().eq('organization_id',profile.organization_id); revalidatePath('/dashboard/settings/branding'); redirect('/dashboard/settings/branding?reset=1') }

export async function saveReportTemplate(formData: FormData){
  const {supabase, profile}=await requireSessionWorkspace();
  const { normalizeBrandProfile } = await import('./types');
  const { templatePayloadFromBrand } = await import('./templates');
  try{
    const name=s(formData,'template_name')||'Untitled report template';
    const description=s(formData,'template_description')||null;
    const currentId=s(formData,'template_id');
    const mode=s(formData,'template_mode')||'create';
    const makeDefault=b(formData,'template_is_default');
    const {data: brandRow}=await (supabase.from('workspace_brand_profiles') as any).select('*').eq('organization_id',profile.organization_id).maybeSingle();
    const brand=normalizeBrandProfile(brandRow as any);
    if(makeDefault) await (supabase.from('workspace_report_templates') as any).update({is_default:false,updated_by:profile.id}).eq('organization_id',profile.organization_id);
    if(mode==='update' && currentId){
      const payload={...templatePayloadFromBrand(brand,profile.organization_id,profile.id,name,description,makeDefault),created_by:undefined,updated_at:new Date().toISOString()};
      const {error}=await (supabase.from('workspace_report_templates') as any).update(payload).eq('id',currentId).eq('organization_id',profile.organization_id);
      if(error) throw error;
    } else {
      const payload=templatePayloadFromBrand(brand,profile.organization_id,profile.id,mode==='duplicate'?`${name} Copy`:name,description,makeDefault);
      const {error}=await (supabase.from('workspace_report_templates') as any).insert(payload);
      if(error) throw error;
    }
  }catch(e){ redirect(`/dashboard/settings/branding?error=${encodeURIComponent(e instanceof Error?e.message:'Unable to save template.')}`)}
  revalidatePath('/dashboard/settings/branding'); redirect('/dashboard/settings/branding?template_saved=1')
}

export async function deleteReportTemplate(templateId:string){
  const {supabase, profile}=await requireSessionWorkspace();
  const {data: templates}=await (supabase.from('workspace_report_templates') as any).select('id,is_default').eq('organization_id',profile.organization_id);
  const current=(templates??[]).find((t:any)=>t.id===templateId);
  if(!current) redirect('/dashboard/settings/branding?error=Template not found.');
  if(current.is_default && (templates??[]).length>1) redirect('/dashboard/settings/branding?error=Set another template as default before deleting this default template.');
  const {error}=await (supabase.from('workspace_report_templates') as any).delete().eq('id',templateId).eq('organization_id',profile.organization_id);
  if(error) redirect(`/dashboard/settings/branding?error=${encodeURIComponent(error.message)}`);
  revalidatePath('/dashboard/settings/branding'); redirect('/dashboard/settings/branding?template_deleted=1')
}

export async function setDefaultReportTemplate(templateId:string){
  const {supabase, profile}=await requireSessionWorkspace();
  await (supabase.from('workspace_report_templates') as any).update({is_default:false,updated_by:profile.id}).eq('organization_id',profile.organization_id);
  const {error}=await (supabase.from('workspace_report_templates') as any).update({is_default:true,updated_by:profile.id,updated_at:new Date().toISOString()}).eq('id',templateId).eq('organization_id',profile.organization_id);
  if(error) redirect(`/dashboard/settings/branding?error=${encodeURIComponent(error.message)}`);
  revalidatePath('/dashboard/settings/branding'); redirect('/dashboard/settings/branding?template_default=1')
}
