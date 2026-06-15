alter table public.capture_items
  add column if not exists capture_ai_analysis jsonb not null default '{
    "classification": null,
    "confidence": null,
    "extracted_text": null,
    "extracted_values": {},
    "generated_note": null,
    "generated_observation": null,
    "generated_recommendation": null,
    "ai_status": "pending",
    "analyzed_at": null
  }'::jsonb;

comment on column public.capture_items.capture_ai_analysis is
  'Normalized AI evidence analysis for a capture. Stores classification, confidence, OCR text, structured readings, generated note/observation/recommendation, review status, and analyzed timestamp. AI output is editable and optional.';
