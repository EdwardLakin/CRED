-- Close the remaining Supabase security-advisor findings on internal functions
-- (lints 0011 / 0028 / 0029), following the same principle as
-- 20260827012954_restrict_subscription_sync_to_service_role.sql: a function that
-- application code never calls through PostgREST should not carry an EXECUTE
-- grant for anon or authenticated.
--
-- Two categories are handled here.
--
-- 1. Trigger functions. These are invoked by the trigger machinery as the table
--    owner and never need a direct EXECUTE grant, so revoking one cannot break
--    the trigger that uses it. They were only ever exposed because the default
--    grant on a newly created function includes PUBLIC.
--
-- 2. Internal helpers that only trigger functions and service-role maintenance
--    paths call. Verified against the application source: no `.rpc(...)` call
--    site exists for any function named below.
--
-- Deliberately NOT changed here:
--
-- * public.is_org_member, is_organization_member, is_organization_admin,
--   is_workspace_member and is_workspace_admin. These are referenced inside RLS
--   policy expressions, which Postgres evaluates as the *calling* role, so
--   `authenticated` genuinely requires EXECUTE on them. Revoking would break
--   every policy that calls one. They return only a boolean about a caller's own
--   membership and require the caller to already know an organization UUID, so
--   the residual exposure is low.
-- * create_onboarding_workspace, finalize_evidence_deliverable and
--   soft_delete_documentation_item, which authenticated users are meant to call.

-- 1. Trigger functions: no direct EXECUTE grant is required.

revoke execute on function public.assign_documentation_session_report_identifier() from public, anon, authenticated;
revoke execute on function public.prevent_capture_item_scope_retarget() from public, anon, authenticated;
revoke execute on function public.validate_evidence_relationship_endpoints() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.touch_capture_processing_jobs_updated_at() from public, anon, authenticated;
revoke execute on function public.default_ai_evidence_review_status_to_suggested() from public, anon, authenticated;
revoke execute on function public.default_ai_timeline_review_status_to_suggested() from public, anon, authenticated;

-- 2. Internal helpers called only by triggers or service-role maintenance.

revoke execute on function public.next_report_identifier(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.validate_evidence_relationship_endpoint(text, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.queue_missing_capture_processing_jobs() from public, anon, authenticated;

-- The capture worker reconciles missed jobs through the service-role client in
-- app/api/internal/capture-processing/tick/route.ts.
grant execute on function public.queue_missing_capture_processing_jobs() to service_role;

-- 3. Pin search_path on the functions that still resolve it at call time
--    (advisor lint 0011). Each of these bodies references only `public`
--    objects, so pinning `public` preserves current behaviour while removing
--    the role-mutable resolution path.

alter function public.set_updated_at() set search_path = public;
alter function public.touch_updated_at() set search_path = public;
alter function public.touch_capture_processing_jobs_updated_at() set search_path = public;
alter function public.default_ai_evidence_review_status_to_suggested() set search_path = public;
alter function public.default_ai_timeline_review_status_to_suggested() set search_path = public;
