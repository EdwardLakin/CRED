-- PR 11: enforce active evidence relationship uniqueness with organization scope.
--
-- Cleanup behavior before index creation:
-- - active duplicate groups are identified by organization_id, documentation_session_id,
--   source_type, source_id, target_type, target_id, and relationship_type where deleted_at is null.
-- - the oldest valid active relationship in each group is preserved.
-- - later duplicates are soft-deleted by setting deleted_at/updated_at only.
-- - provenance, creator/reviewer, review state, labels, and all other audit fields remain intact.
-- - no evidence endpoint records are deleted.

with ranked_active_relationships as (
  select
    id,
    row_number() over (
      partition by organization_id, documentation_session_id, source_type, source_id, target_type, target_id, relationship_type
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.evidence_relationships
  where deleted_at is null
)
update public.evidence_relationships relationships
set deleted_at = now(),
    updated_at = now()
from ranked_active_relationships ranked
where relationships.id = ranked.id
  and ranked.duplicate_rank > 1
  and relationships.deleted_at is null;

-- Replace the original session-scoped unique index with an organization-scoped index.
-- The drop is safe after cleanup because the stronger index has the same active-row intent
-- plus organization_id in the key requested for database-level tenancy integrity.
drop index if exists public.evidence_relationships_unique_active_idx;

create unique index if not exists evidence_relationships_unique_active_org_idx
on public.evidence_relationships (
  organization_id,
  documentation_session_id,
  source_type,
  source_id,
  target_type,
  target_id,
  relationship_type
)
where deleted_at is null;

comment on index public.evidence_relationships_unique_active_org_idx is 'Prevents duplicate active evidence relationships per organization/session/source/target/type while allowing soft-deleted relationships to be recreated.';
