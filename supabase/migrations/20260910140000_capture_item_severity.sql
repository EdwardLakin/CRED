-- Technician-set severity for a documented item.
--
-- Until now the delivered report carried severity only as prose a technician
-- typed into the session's final notes, so the one thing that tells a reader
-- which defects matter most was buried in a paragraph at the end and could not
-- be shown against the item it describes.
--
-- Severity is nullable with no default. An unrated item stays unrated and
-- prints no severity, rather than inheriting a guess: the codebase already
-- infers a severity from text for internal grouping, and that inference must
-- never reach a customer as though a person had assessed it.

alter table public.capture_items
  add column if not exists severity text;

alter table public.capture_items
  drop constraint if exists capture_items_severity_check;

alter table public.capture_items
  add constraint capture_items_severity_check
  check (severity is null or severity in ('low', 'medium', 'high', 'critical'));

comment on column public.capture_items.severity is
  'Technician-assigned severity for this item: low, medium, high or critical. Null means not rated, and prints nothing. Never inferred.';

-- Reports list items by severity, so support that read without a scan.
create index if not exists capture_items_session_severity_idx
  on public.capture_items (documentation_session_id, severity)
  where deleted_at is null and severity is not null;
