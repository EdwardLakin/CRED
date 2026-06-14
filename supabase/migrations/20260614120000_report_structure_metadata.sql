alter table public.ai_report_drafts
  add column if not exists report_structure jsonb not null default '{}'::jsonb;

comment on column public.ai_report_drafts.report_structure is
  'Normalized form-derived and evidence-first report structure metadata. Keeps report generation compatible while letting captured forms drive section order and evidence associations.';
