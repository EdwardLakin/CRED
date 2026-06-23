-- Verification-only check for capture_items update policy. Do not apply as a migration.
-- Run against the preview/CRED Test database after current migrations are applied.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'capture_items'
  and cmd in ('UPDATE', 'ALL')
order by policyname;

-- Live verification matrix (use authenticated same-org and cross-org clients):
-- 1. same-org update evidence_review_status where deleted_at is null returns exactly one row.
-- 2. same-org update include_in_report where deleted_at is null returns exactly one row.
-- 3. cross-org update returns zero rows or an RLS denial.
-- 4. deleted capture update returns zero rows.
-- 5. attempts to change immutable scope fields such as organization_id/documentation_session_id are denied or fail verification.
