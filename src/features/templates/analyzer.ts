import { SYSTEM_TEMPLATES, type EvidenceRequirement, type TemplateDraft } from './types'

const COMMON_SECTIONS = ['Customer Information', 'Equipment Information', 'Travel', 'Complaint', 'Cause', 'Correction', 'Findings', 'Recommendations', 'Signatures']
const COMMON_FIELDS = ['VIN', 'Unit Number', 'Asset ID', 'Hours', 'Odometer', 'Serial Number', 'Customer Name', 'Work Order Number', 'PO Number']

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function requirement(label: string, required = true): EvidenceRequirement {
  return { key: slug(label), label, required, matchTerms: [label.toLowerCase()] }
}

export function analyzeTemplateUpload(filename: string, mimeType: string): TemplateDraft {
  const normalized = `${filename} ${mimeType}`.toLowerCase()
  const baseName = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Imported Form Profile'
  const matchedSystem = SYSTEM_TEMPLATES.find((template) => normalized.includes(template.name.toLowerCase().split(' ')[0]))

  if (matchedSystem) {
    return { ...matchedSystem, name: `${baseName} Draft`, templateType: 'organization' }
  }

  if (normalized.includes('service') || normalized.includes('work order')) {
    const service = SYSTEM_TEMPLATES.find((template) => template.name === 'Field Service Report')!
    return { ...service, name: `${baseName} Draft`, templateType: 'organization' }
  }

  if (normalized.includes('cvip') || normalized.includes('inspection')) {
    const inspection = normalized.includes('cvip') ? SYSTEM_TEMPLATES[0] : SYSTEM_TEMPLATES.find((template) => template.name === 'Inspection Report')!
    return { ...inspection, name: `${baseName} Draft`, templateType: 'organization' }
  }

  const requiredEvidence = ['Unit Identification', 'Data Plate', 'Finding Photo', 'Signature'].map((label) => requirement(label, label !== 'Signature'))

  return {
    name: `${baseName} Draft`,
    description: 'AI Form Profile Draft generated from the uploaded form. Review sections, fields, coverage suggestions, signatures, and report structure before saving.',
    templateType: 'organization',
    sections: COMMON_SECTIONS,
    fields: COMMON_FIELDS,
    requiredEvidence: requiredEvidence.filter((item) => item.required),
    recommendedEvidence: [requirement('Signature', false)],
    signatureRequirements: [requirement('Technician Signature', true), requirement('Customer Signature', false)],
    pdfLayout: { sections: COMMON_SECTIONS, includeEvidenceGallery: true, includeSignatures: true },
  }
}
