-- Storage hardening follow-up to docs/LAUNCH_READINESS_AUDIT.md P1:
-- "Add explicit bucket-level size/MIME limits for documentation-templates
-- and documentation-signatures." documentation-captures already enforces
-- both at the bucket level (see 20260609190000/20260610153000); templates
-- and signatures did not.
--
-- Also creates the documentation-branding bucket, which
-- src/features/branding/actions.ts and the report-pdf export route read
-- and write (BUCKET = 'documentation-branding'), but which no prior
-- migration ever provisioned or granted storage policies for. Without this,
-- branding uploads only work if the bucket was created out-of-band in the
-- Supabase dashboard, and even then there is no organization-scoped RLS
-- policy restricting access to its objects.

-- Bucket-level limits matching the app-level validation already enforced
-- in src/features/templates/actions.ts (PDF/DOCX/JPEG/PNG/WEBP/HEIC/HEIF).
-- The cap must be at least as large as the highest plan's file-size limit:
-- importTemplate() passes file.size through requireUsageAllowance(), which
-- validates against PLAN_LIMITS[plan].maxCaptureFileSizeBytes in
-- src/features/billing/limits.ts — 25 MB (individual), 50 MB (team), and
-- 100 MB (shop, the same STORAGE_BUCKET_MAX_BYTES ceiling documentation-
-- captures already uses). A lower bucket cap would let the app approve an
-- upload that Storage then rejects for team/shop workspaces.
update storage.buckets
set file_size_limit = 104857600, -- 100 MB
    allowed_mime_types = array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif'
    ]
where id = 'documentation-templates';

-- Bucket-level limits matching the app-level validation already enforced
-- in src/features/signatures/actions.ts (canvas signatures decoded from a
-- PNG/JPEG/WEBP data URL).
update storage.buckets
set file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = array[
      'image/png',
      'image/jpeg',
      'image/webp'
    ]
where id = 'documentation-signatures';

-- Create the branding bucket, matching the app-level validation already
-- enforced in src/features/branding/actions.ts uploadImage() (PNG/JPEG/
-- WEBP/SVG, 2 MB max).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentation-branding',
  'documentation-branding',
  false,
  2097152, -- 2 MB
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Organization-scoped storage policies for documentation-branding, mirroring
-- the documentation-templates policies added in
-- 20260611224500_template_signature_share_rls_audit.sql. Upload paths are
-- organizations/{organizationId}/branding/{file} (see uploadImage() in
-- src/features/branding/actions.ts).
do $$
begin
  drop policy if exists "Organization members can upload documentation branding" on storage.objects;
  create policy "Organization members can upload documentation branding"
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'documentation-branding'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'branding'
      and array_length(storage.foldername(name), 1) = 3
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can read documentation branding" on storage.objects;
  create policy "Organization members can read documentation branding"
    on storage.objects for select
    to authenticated
    using (
      bucket_id = 'documentation-branding'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'branding'
      and array_length(storage.foldername(name), 1) = 3
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can update documentation branding" on storage.objects;
  create policy "Organization members can update documentation branding"
    on storage.objects for update
    to authenticated
    using (
      bucket_id = 'documentation-branding'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'branding'
      and array_length(storage.foldername(name), 1) = 3
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
    )
    with check (
      bucket_id = 'documentation-branding'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'branding'
      and array_length(storage.foldername(name), 1) = 3
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
    );

  drop policy if exists "Organization members can delete documentation branding" on storage.objects;
  create policy "Organization members can delete documentation branding"
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'documentation-branding'
      and (storage.foldername(name))[1] = 'organizations'
      and (storage.foldername(name))[3] = 'branding'
      and array_length(storage.foldername(name), 1) = 3
      and storage.filename(name) <> ''
      and exists (
        select 1 from public.profiles
        where profiles.organization_id::text = (storage.foldername(name))[2]
          and profiles.user_id = auth.uid()
      )
    );
end $$;
