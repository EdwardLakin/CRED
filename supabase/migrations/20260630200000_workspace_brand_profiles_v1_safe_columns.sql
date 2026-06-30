alter table public.workspace_brand_profiles
  add column if not exists license_number text,
  add column if not exists certification_number text,
  add column if not exists tax_number text,
  add column if not exists insurance_number text,
  add column if not exists business_hours text,
  add column if not exists department text,
  add column if not exists branch_location text;

alter table public.workspace_brand_profiles drop constraint if exists workspace_brand_profiles_header_layout_check;
alter table public.workspace_brand_profiles add constraint workspace_brand_profiles_header_layout_check check (header_layout in ('classic','compact','bold','split','minimal','classic_letterhead','compact_service','bold_banner','split_identity','report_cover','left_rail','certification_block','centered_logo','two_column_details','government_form_header','industrial_strip'));
