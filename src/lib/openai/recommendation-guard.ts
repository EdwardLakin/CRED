// Recommendation Guard
//
// Policy: the inspector is the source of truth. The AI may rewrite,
// reorganize, or clean up the inspector's own words, but it must never be
// the origin of a recommendation. A recommendation may only appear in a
// report if the inspector's own technician_note/transcript for that item
// already states one; the AI's job there is at most to rephrase that
// statement, never to compose a new one from an observation, a measurement,
// or "documented concerns" in general.
//
// Every AI text-generation path that can produce recommendation-shaped
// content (report-draft-generator, capture-extractor, final-notes-generator,
// observation-writing-assistant) must run its output through this guard
// before it is stored or returned. Prompt instructions alone ("don't invent
// recommendations") are necessary but not sufficient — this module is the
// enforced backstop for when a model ignores them.

const RECOMMENDATION_SIGNAL_PATTERN =
  /\b(?:recommend(?:ation|ations|ed|s)?|should\s+be\s+(?:repaired|replaced|serviced|inspected|addressed|monitored)|needs?\s+to\s+be\s+(?:repaired|replaced|serviced|inspected|addressed)|requires?\s+(?:repair|replacement|service|monitoring)|repair\s+(?:recommended|required)|replacement\s+(?:recommended|required)|monitoring\s+(?:recommended|required)|corrective\s+action|follow[- ]?up\s+(?:recommended|required))\b/i

/** Does this text contain recommendation-shaped language at all? */
export function containsRecommendationSignal(text: string | null | undefined): boolean {
  return typeof text === 'string' && RECOMMENDATION_SIGNAL_PATTERN.test(text)
}

function splitSentences(text: string): string[] {
  return (
    text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [text.trim()].filter(Boolean)
  )
}

/**
 * Removes recommendation-shaped sentences from free text unless the
 * inspector's own source text for the same item already contains a
 * recommendation. Use this for prose the AI is allowed to otherwise
 * rewrite/organize (a section body, a generated summary) where only some
 * sentences might drift into recommendation territory.
 */
export function stripUnsupportedRecommendationSentences(
  text: string | null | undefined,
  inspectorSourceText: string | null | undefined,
): string | null {
  if (!text) return null
  if (containsRecommendationSignal(inspectorSourceText)) return text
  const kept = splitSentences(text).filter((sentence) => !containsRecommendationSignal(sentence))
  const result = kept.join(' ').trim()
  return result || null
}

/**
 * Sanitizes a single-value recommendation field (e.g. a finding's
 * `recommendation`, a capture's `generated_recommendation`). The AI-authored
 * value is only kept when the inspector's own source text for that same
 * item already signals a recommendation — otherwise it's dropped entirely,
 * regardless of how well-grounded the surrounding observation is. Being
 * evidence-grounded is not the same as being inspector-authored.
 */
export function sanitizeRecommendationField(
  recommendation: string | null | undefined,
  inspectorSourceText: string | null | undefined,
): string | null {
  if (!recommendation) return null
  return containsRecommendationSignal(inspectorSourceText) ? recommendation : null
}

/**
 * True when the given title/body pair reads as a recommendation-flavored
 * section (mirrors the same heuristic src/features/reports/report-structure.ts
 * uses to decide a draft section becomes a "Recommendation" in the export).
 */
export function looksLikeRecommendationSection(title: string | null | undefined, body: string | null | undefined): boolean {
  return /recommend|replace|repair|correct/i.test(`${title ?? ''} ${body ?? ''}`)
}
