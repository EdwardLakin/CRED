import { AI_SUGGESTION_PROMPT_REQUIREMENTS, assertAiSuggestionDefaults } from '@/features/evidence/suggestions/validation'

export type Capture = { id: string; technician_note: string | null; original_filename: string | null; captured_at: string | null; ai_summary?: string | null; extracted_text?: string | null; ocr_text?: string | null }
export type SuggestionRowsByTable = Record<'timeline_events' | 'evidence_entities' | 'evidence_assertions' | 'evidence_relationships', Record<string, unknown>[]>

export async function generateEvidenceSuggestions(sessionId: string, workspace: { supabase: unknown; organizationId: string; userId: string | null; timezone: string | null }): Promise<SuggestionRowsByTable> {
  const supabase = workspace.supabase as { from: (table: string) => { select: (columns: string) => { eq: (column: string, value: string) => { eq: (column: string, value: string) => { is: (column: string, value: null) => { order: (column: string, options?: { ascending?: boolean }) => Promise<{ data: unknown; error: unknown }> } } } } } }
  const { data } = await supabase.from('capture_items').select('*').eq('documentation_session_id', sessionId).eq('organization_id', workspace.organizationId).is('deleted_at', null).order('captured_at', { ascending: false })
  const captures = ((data ?? []) as Capture[]).slice(0, 10); const now = new Date().toISOString(); const rows: SuggestionRowsByTable = { timeline_events: [], evidence_entities: [], evidence_assertions: [], evidence_relationships: [] }
  for (const capture of captures) {
    const sourceEvidenceIds = [capture.id]; const text = [capture.technician_note, capture.ai_summary, capture.extracted_text, capture.original_filename].filter(Boolean).join(' ').slice(0, 240)
    if (!text) continue
    const provenance = { created_from: 'ai_evidence_suggestions_service', prompt_requirements: AI_SUGGESTION_PROMPT_REQUIREMENTS, source_evidence_ids: sourceEvidenceIds, reasoning_summary: 'Drafted from existing item text for human review only.' }
    const timeline = { documentation_session_id: sessionId, organization_id: workspace.organizationId, capture_item_id: capture.id, event_time: capture.captured_at ?? now, title: `Suggested event from ${capture.original_filename ?? 'item'}`, description: text, event_type: 'ai_suggestion', event_start_at: capture.captured_at ?? null, event_date_precision: capture.captured_at ? 'exact' : 'unknown', timezone: workspace.timezone, source_kind: 'ai', review_status: 'suggested', confidence: 0.55, provenance, created_by: workspace.userId, updated_at: now }
    assertAiSuggestionDefaults(timeline); rows.timeline_events.push(timeline)
    const assertion = { documentation_session_id: sessionId, organization_id: workspace.organizationId, assertion_type: 'factual_observation', statement: text, normalized_statement: text.toLocaleLowerCase(), attributes: { source_evidence_ids: sourceEvidenceIds }, suggestion_source: 'ai', review_status: 'suggested', confidence: 0.55, provenance, created_by: workspace.userId, updated_at: now }
    assertAiSuggestionDefaults(assertion); rows.evidence_assertions.push(assertion)
  }
  return rows
}

export function generateEvidenceSuggestionsForCaptures(sessionId: string, captures: Capture[], workspace: { organizationId: string; userId: string | null; timezone: string | null }): SuggestionRowsByTable {
  const now = new Date().toISOString(); const rows: SuggestionRowsByTable = { timeline_events: [], evidence_entities: [], evidence_assertions: [], evidence_relationships: [] }
  for (const capture of captures.slice(0, 25)) {
    const sourceEvidenceIds = [capture.id]; const text = [capture.technician_note, capture.ai_summary, capture.extracted_text, capture.ocr_text, capture.original_filename].filter(Boolean).join(' ').slice(0, 240)
    if (!text) continue
    const provenance = { created_from: 'ai_import_batch_suggestions_service', prompt_requirements: AI_SUGGESTION_PROMPT_REQUIREMENTS, source_evidence_ids: sourceEvidenceIds, reasoning_summary: 'Drafted from selected import items for human review only.' }
    const timeline = { documentation_session_id: sessionId, organization_id: workspace.organizationId, capture_item_id: capture.id, event_time: capture.captured_at ?? now, title: `Suggested event from ${capture.original_filename ?? 'selected item'}`, description: text, event_type: 'ai_suggestion', event_start_at: capture.captured_at ?? null, event_date_precision: capture.captured_at ? 'exact' : 'unknown', timezone: workspace.timezone, source_kind: 'ai', review_status: 'suggested', confidence: 0.55, provenance, created_by: workspace.userId, updated_at: now }
    assertAiSuggestionDefaults(timeline); rows.timeline_events.push(timeline)
    const assertion = { documentation_session_id: sessionId, organization_id: workspace.organizationId, assertion_type: 'factual_observation', statement: text, normalized_statement: text.toLocaleLowerCase(), attributes: { source_evidence_ids: sourceEvidenceIds }, suggestion_source: 'ai', review_status: 'suggested', confidence: 0.55, provenance, created_by: workspace.userId, updated_at: now }
    assertAiSuggestionDefaults(assertion); rows.evidence_assertions.push(assertion)
  }
  return rows
}
