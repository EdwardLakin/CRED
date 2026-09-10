-- Technician-owned sections used to be seeded with placeholder prose as their
-- stored body ("No technician diagnostic summary entered." and its sibling).
-- The report builder no longer writes those, but drafts generated before that
-- change still carry them, and the review editor and export both render stored
-- bodies as-is — so reopening or exporting an older report kept printing the
-- placeholder to the customer.
--
-- Null the two exact legacy values. Only those two strings are matched, so a
-- technician who happens to have written their own text is untouched. Sections
-- become genuinely empty, which is what an unanswered section should be: the
-- editor shows its prompt as a placeholder, and the export omits it.

update public.ai_report_draft_sections
set body = null
where body in (
  'No technician diagnostic summary entered.',
  'No technician next step or escalation note entered.'
);
