alter table public.organization_usage_events
  drop constraint if exists organization_usage_events_event_type_check;

alter table public.organization_usage_events
  add constraint organization_usage_events_event_type_check
  check (event_type in (
    'ai_classification',
    'ai_extraction',
    'ai_report_draft_generation',
    'capture_uploaded',
    'storage_bytes_added',
    'email_report_sent',
    'share_link_created',
    'printable_report_opened',
    'pdf_report_downloaded',
    'template_imported',
    'signature_captured'
  ));
