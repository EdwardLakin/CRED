import type { Json } from '@/lib/supabase/database.types'

export const FIELD_SERVICE_SESSION_TYPE = 'field_service_report'

export type FieldServiceFieldType = 'text' | 'textarea' | 'number' | 'datetime-local' | 'date' | 'checkbox'

export type FieldServiceField = {
  name: string
  label: string
  type?: FieldServiceFieldType
  placeholder?: string
  wide?: boolean
}

export type FieldServiceSection = {
  key: string
  title: string
  description?: string
  fields: FieldServiceField[]
}

export const FIELD_SERVICE_SECTIONS: FieldServiceSection[] = [
  {
    key: 'header',
    title: 'Header',
    fields: [
      { name: 'customer_name', label: 'Customer Name' },
      { name: 'customer_address', label: 'Customer Address', wide: true },
      { name: 'customer_phone', label: 'Customer Phone' },
      { name: 'purchase_order_number', label: 'PO Number' },
      { name: 'work_order_number', label: 'Work Order Number' },
      { name: 'unit_number', label: 'Unit Number' },
      { name: 'licence_number', label: 'Licence Number' },
      { name: 'supervisor_signature_name', label: 'Supervisor Signature Name' },
      { name: 'job_completed', label: 'Job Completed', type: 'checkbox' },
    ],
  },
  {
    key: 'equipment',
    title: 'Equipment',
    fields: [
      { name: 'equipment_make', label: 'Equipment Make' },
      { name: 'equipment_model', label: 'Equipment Model' },
      { name: 'equipment_serial_number', label: 'Equipment Serial Number' },
      { name: 'engine_make', label: 'Engine Make' },
      { name: 'engine_model', label: 'Engine Model' },
      { name: 'engine_serial_number', label: 'Engine Serial Number' },
      { name: 'generator_make', label: 'Generator Make' },
      { name: 'generator_model', label: 'Generator Model' },
      { name: 'generator_serial_number', label: 'Generator Serial Number' },
      { name: 'generator_kilowatts', label: 'Generator kW', type: 'number' },
      { name: 'generator_volts', label: 'Generator Volts', type: 'number' },
      { name: 'controller_type', label: 'Controller Type' },
      { name: 'transmission_make', label: 'Transmission Make' },
      { name: 'transmission_model', label: 'Transmission Model' },
      { name: 'transmission_serial_number', label: 'Transmission Serial Number' },
      { name: 'transmission_cin_number', label: 'Transmission CIN Number' },
      { name: 'transmission_assembly_number', label: 'Transmission Assembly Number' },
      { name: 'date_in_service', label: 'Date In Service', type: 'date' },
      { name: 'hours', label: 'Hours', type: 'number' },
      { name: 'hours_kms', label: 'Hours / KMs' },
      { name: 'odometer', label: 'Odometer', type: 'number' },
    ],
  },
  {
    key: 'travel',
    title: 'Travel',
    description: 'GPS is optional. Manual odometer distance overrides GPS for billing/reporting.',
    fields: [
      { name: 'travel_start_location', label: 'Start Location' },
      { name: 'travel_end_location', label: 'End Location' },
      { name: 'travel_start_odometer', label: 'Start Odometer', type: 'number' },
      { name: 'travel_end_odometer', label: 'End Odometer', type: 'number' },
      { name: 'kilometers_traveled', label: 'Kilometers Traveled', type: 'number' },
      { name: 'travel_started_at', label: 'Travel Started At', type: 'datetime-local' },
      { name: 'travel_ended_at', label: 'Travel Ended At', type: 'datetime-local' },
      { name: 'gps_start_lat', label: 'GPS Start Latitude', type: 'number' },
      { name: 'gps_start_lng', label: 'GPS Start Longitude', type: 'number' },
      { name: 'gps_end_lat', label: 'GPS End Latitude', type: 'number' },
      { name: 'gps_end_lng', label: 'GPS End Longitude', type: 'number' },
      { name: 'gps_distance_km', label: 'GPS Distance KM', type: 'number' },
      { name: 'gps_distance_source', label: 'Distance Source' },
    ],
  },
  {
    key: 'work_performed',
    title: 'Work Performed',
    fields: [
      { name: 'complaint', label: 'Complaint', type: 'textarea', wide: true },
      { name: 'cause_of_failure', label: 'Cause of Failure', type: 'textarea', wide: true },
      { name: 'correction', label: 'Correction', type: 'textarea', wide: true },
      { name: 'technician_notes', label: 'Technician Notes', type: 'textarea', wide: true },
    ],
  },
  {
    key: 'time_card',
    title: 'Time Card',
    fields: [
      { name: 'work_started_at', label: 'Work Started At', type: 'datetime-local' },
      { name: 'work_ended_at', label: 'Work Ended At', type: 'datetime-local' },
      { name: 'travel_time_hours', label: 'Travel Time Hours', type: 'number' },
      { name: 'working_time_hours', label: 'Working Time Hours', type: 'number' },
      { name: 'overtime_hours', label: 'Overtime Hours', type: 'number' },
      { name: 'double_time_hours', label: 'Double Time Hours', type: 'number' },
      { name: 'total_hours', label: 'Total Hours', type: 'number' },
    ],
  },
  {
    key: 'charges',
    title: 'Charges / Documentation Only',
    description: 'Reference-only totals for paperwork recreation. CRED does not perform invoicing or accounting here.',
    fields: [
      { name: 'labour_charge', label: 'Labour Charge', type: 'number' },
      { name: 'parts_charge', label: 'Parts Charge', type: 'number' },
      { name: 'mileage_charge', label: 'Mileage Charge', type: 'number' },
      { name: 'expenses_charge', label: 'Expenses Charge', type: 'number' },
      { name: 'misc_charges', label: 'Misc Charges', type: 'number' },
      { name: 'subtotal', label: 'Subtotal', type: 'number' },
      { name: 'tax', label: 'Tax', type: 'number' },
      { name: 'total', label: 'Total', type: 'number' },
    ],
  },
  {
    key: 'signatures',
    title: 'Signatures',
    fields: [
      { name: 'technician_name', label: 'Technician Name' },
      { name: 'technician_signature', label: 'Technician Signature' },
      { name: 'customer_name_signed', label: 'Customer Name Signed' },
      { name: 'customer_signature', label: 'Customer Signature' },
      { name: 'customer_signed_at', label: 'Customer Signed At', type: 'datetime-local' },
    ],
  },
]

export const FIELD_SERVICE_FIELD_NAMES = FIELD_SERVICE_SECTIONS.flatMap((section) => section.fields.map((field) => field.name))

export const FIELD_SERVICE_FIELD_LABELS = Object.fromEntries(
  FIELD_SERVICE_SECTIONS.flatMap((section) => section.fields.map((field) => [field.name, field.label])),
) as Record<string, string>

const CHECKBOX_FIELDS = new Set(FIELD_SERVICE_SECTIONS.flatMap((section) => section.fields.filter((field) => field.type === 'checkbox').map((field) => field.name)))

export function isFieldServiceSessionType(sessionType: string) {
  return sessionType === FIELD_SERVICE_SESSION_TYPE
}

export function isFieldServiceFieldName(value: string) {
  return FIELD_SERVICE_FIELD_NAMES.includes(value)
}

export function isCheckboxField(name: string) {
  return CHECKBOX_FIELDS.has(name)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeFieldServiceDetails(value: Json | null | undefined) {
  return isRecord(value) ? value : {}
}

export function getFieldServiceText(details: Record<string, unknown>, name: string) {
  const value = details[name]
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

export function getFieldServiceBoolean(details: Record<string, unknown>, name: string) {
  return details[name] === true || details[name] === 'true' || details[name] === 'on'
}

export function formatDateTimeLocal(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16)
  return date.toISOString().slice(0, 16)
}
