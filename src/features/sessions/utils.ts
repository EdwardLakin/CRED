import { formatDateInTimeZone, formatDateTimeInTimeZone } from '@/lib/date-format'

export function formatDateTime(value: string | null, timeZone?: string | null) {
  return formatDateTimeInTimeZone(value, timeZone)
}

export function formatDate(value: string | null, timeZone?: string | null) {
  return formatDateInTimeZone(value, timeZone)
}
