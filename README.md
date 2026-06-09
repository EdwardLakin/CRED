# CRED

AI inspection and documentation workspace.

## Supabase Storage setup

Session capture intake uses a private Supabase Storage bucket named `documentation-captures`.
The migration `supabase/migrations/20260609190000_session_capture_intake.sql` creates the bucket, applies the initial 15MB upload limit, and adds organization-scoped storage policies.

If your Supabase project was provisioned manually or migrations were not applied, create a private bucket named `documentation-captures` before using capture uploads. The app will fail gracefully with an upload error that mentions the missing bucket when storage is not configured.
