/**
 * Technician-set severity for a documented item.
 *
 * This is deliberately separate from normalizeReportSeverity() in
 * report-structure.ts, which infers a severity by pattern-matching text and is
 * used for internal grouping. Nothing inferred belongs on a customer-facing
 * item: the report states how serious a condition is, and a person has to be
 * the one who says so. An item with no severity set prints no severity at all,
 * rather than defaulting to a guess.
 *
 * The scale is domain-neutral on purpose. CRED reports cover vehicles,
 * properties, claims and investigations, so the words have to read sensibly for
 * a cracked weld, a mouldy ceiling and a disputed delivery alike.
 */
export const ITEM_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const

export type ItemSeverity = (typeof ITEM_SEVERITIES)[number]

export const ITEM_SEVERITY_LABELS: Record<ItemSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

/** Plain-language help shown beside the control, so the scale means the same thing to every technician. */
export const ITEM_SEVERITY_HINTS: Record<ItemSeverity, string> = {
  low: 'Cosmetic or minor wear. No action needed now.',
  medium: 'Should be addressed, but not urgent.',
  high: 'Needs attention soon to prevent further damage.',
  critical: 'Unsafe or causing ongoing damage. Address immediately.',
}

/** Higher sorts first when severity is used for ordering or rollups. */
export const ITEM_SEVERITY_RANK: Record<ItemSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

/**
 * Returns the severity a person set, or null when none was set. Never falls
 * back to a default — an unrated item must stay visibly unrated.
 */
export function normalizeItemSeverity(value: unknown): ItemSeverity | null {
  return typeof value === 'string' && ITEM_SEVERITIES.includes(value as ItemSeverity)
    ? (value as ItemSeverity)
    : null
}

export function getItemSeverityLabel(value: unknown): string | null {
  const severity = normalizeItemSeverity(value)
  return severity ? ITEM_SEVERITY_LABELS[severity] : null
}
