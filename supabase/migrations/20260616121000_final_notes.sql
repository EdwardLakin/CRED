alter table public.documentation_sessions
  add column if not exists final_notes text,
  add column if not exists final_notes_ai_generated boolean not null default false,
  add column if not exists final_notes_updated_at timestamptz,
  add column if not exists final_notes_edited_by_user boolean not null default false,
  add column if not exists include_final_notes_in_export boolean not null default true;

comment on column public.documentation_sessions.final_notes is
  'Technician-facing final work order notes scoped to this documentation session.';
comment on column public.documentation_sessions.final_notes_ai_generated is
  'True when current final notes were initially drafted by user-requested AI generation.';
comment on column public.documentation_sessions.final_notes_edited_by_user is
  'True when a user manually saved edits to final work order notes.';
comment on column public.documentation_sessions.include_final_notes_in_export is
  'Controls whether final work order notes appear in exported reports.';
