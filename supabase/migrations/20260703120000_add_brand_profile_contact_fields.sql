alter table public.workspace_brand_profiles
  add column if not exists license_number text,
  add column if not exists certification_number text,
  add column if not exists tax_number text,
  add column if not exists insurance_number text,
  add column if not exists business_hours text,
  add column if not exists department text,
  add column if not exists branch_location text;
