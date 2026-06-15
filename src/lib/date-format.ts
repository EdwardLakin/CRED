const DEFAULT_TIME_ZONE = 'UTC'

export function normalizeTimeZone(timeZone: string | null | undefined) {
  if (!timeZone) return DEFAULT_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(new Date())
    return timeZone
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

export function formatDateTimeInTimeZone(value: string | Date | null | undefined, timeZone: string | null | undefined) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en', {
    timeZone: normalizeTimeZone(timeZone),
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value))
}

export function formatDateInTimeZone(value: string | Date | null | undefined, timeZone: string | null | undefined) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en', {
    timeZone: normalizeTimeZone(timeZone),
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}
