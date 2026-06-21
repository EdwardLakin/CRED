alter table public.capture_items
  add column if not exists evidence_category text not null default 'supporting_evidence'
  check (evidence_category in ('supporting_evidence', 'observation', 'concern', 'recommended_action'));

comment on column public.capture_items.evidence_category is
  'Technician-selected lightweight report organization category. Existing rows default to supporting evidence.';
