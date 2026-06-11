import type { Json } from '@/lib/supabase/database.types'

import {
  FIELD_SERVICE_SECTIONS,
  formatDateTimeLocal,
  getFieldServiceBoolean,
  getFieldServiceText,
  normalizeFieldServiceDetails,
} from '../types'
import { TravelWorkflowControls } from './TravelWorkflowControls'

function FieldControl({
  details,
  field,
}: {
  details: Record<string, unknown>
  field: (typeof FIELD_SERVICE_SECTIONS)[number]['fields'][number]
}) {
  const commonProps = {
    id: field.name,
    name: field.name,
    className: field.type === 'textarea' ? 'textarea' : 'input',
  }

  if (field.type === 'checkbox') {
    return (
      <label className="checkbox-field field-service-checkbox">
        <input type="checkbox" name={field.name} defaultChecked={getFieldServiceBoolean(details, field.name)} />
        <span>{field.label}</span>
      </label>
    )
  }

  const defaultValue = field.type === 'datetime-local' ? formatDateTimeLocal(details[field.name]) : getFieldServiceText(details, field.name)

  return (
    <div className={`field-stack${field.wide ? ' field-wide' : ''}`}>
      <label htmlFor={field.name} className="label">
        {field.label}
      </label>
      {field.type === 'textarea' ? (
        <textarea {...commonProps} defaultValue={defaultValue} placeholder={field.placeholder} rows={4} />
      ) : (
        <input
          {...commonProps}
          type={field.type ?? 'text'}
          step={field.type === 'number' ? 'any' : undefined}
          defaultValue={defaultValue}
          placeholder={field.placeholder}
        />
      )}
    </div>
  )
}

export function FieldServiceDetailsCard({ details }: { details: Json | null }) {
  const normalizedDetails = normalizeFieldServiceDetails(details)

  return (
    <section className="form-stack field-service-details-card">
      <div>
        <p className="eyebrow guided-eyebrow">Field service report</p>
        <h2>Field Service Details</h2>
        <p className="muted">
          Wajax-style service report fields for documentation only. Evidence capture, review, and printable report preparation remain unchanged.
        </p>
      </div>

      <TravelWorkflowControls />

      {FIELD_SERVICE_SECTIONS.map((section) => (
        <fieldset key={section.key} className="field-service-section">
          <legend>{section.title}</legend>
          {section.description ? <p className="muted field-service-section-description">{section.description}</p> : null}
          <div className="field-grid">
            {section.fields.map((field) => (
              <FieldControl key={field.name} details={normalizedDetails} field={field} />
            ))}
          </div>
        </fieldset>
      ))}
    </section>
  )
}
