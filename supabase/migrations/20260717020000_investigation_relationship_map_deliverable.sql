begin;

alter table public.evidence_deliverables
  drop constraint if exists evidence_deliverables_type_check;

alter table public.evidence_deliverables
  add constraint evidence_deliverables_type_check
  check (deliverable_type in ('chronology', 'evidence_index', 'observation_summary', 'relationship_map'));

comment on constraint evidence_deliverables_type_check on public.evidence_deliverables is
  'Supported CRED deliverable types; relationship_map is gated to CRED Investigation by the application.';

commit;
