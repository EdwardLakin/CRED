import type { Json } from '@/lib/supabase/database.types'

export type EvidenceRequirement = {
  key: string
  label: string
  required: boolean
  matchTerms: string[]
  description?: string
}

export type TemplateDraft = {
  name: string
  description: string
  templateType: string
  sections: string[]
  fields: string[]
  requiredEvidence: EvidenceRequirement[]
  recommendedEvidence: EvidenceRequirement[]
  signatureRequirements: EvidenceRequirement[]
  pdfLayout: { sections: string[]; includeEvidenceGallery: boolean; includeSignatures: boolean }
}

export const SYSTEM_TEMPLATES: TemplateDraft[] = [
  {
    name: 'CVIP Inspection',
    description: 'Commercial vehicle inspection workflow with VIN, registration, odometer, brake, and tire evidence rules.',
    templateType: 'system',
    sections: ['Customer Information', 'Equipment Information', 'Findings', 'Recommendations', 'Signatures'],
    fields: ['VIN', 'Unit Number', 'Odometer', 'Customer Name', 'Work Order Number'],
    requiredEvidence: [
      { key: 'vin_plate', label: 'VIN Plate', required: true, matchTerms: ['vin', 'vin plate', 'vehicle identification'] },
      { key: 'registration', label: 'Registration', required: true, matchTerms: ['registration', 'permit'] },
      { key: 'odometer', label: 'Odometer', required: true, matchTerms: ['odometer', 'mileage', 'hour meter'] },
      { key: 'front_brakes', label: 'Front Brakes', required: true, matchTerms: ['front brake', 'front brakes', 'brake'] },
      { key: 'rear_brakes', label: 'Rear Brakes', required: true, matchTerms: ['rear brake', 'rear brakes', 'brake'] },
      { key: 'tire_tread', label: 'Tire Tread', required: true, matchTerms: ['tire tread', 'tread', 'tire'] },
    ],
    recommendedEvidence: [],
    signatureRequirements: [{ key: 'inspector_signature', label: 'Inspector Signature', required: true, matchTerms: ['inspector signature', 'signature'] }],
    pdfLayout: { sections: ['Summary', 'Evidence', 'Findings', 'Signatures'], includeEvidenceGallery: true, includeSignatures: true },
  },
  {
    name: 'Field Service Report',
    description: 'Field service documentation workflow with complaint, cause, correction, equipment, repair evidence, and signatures.',
    templateType: 'system',
    sections: ['Customer Information', 'Equipment Information', 'Travel', 'Complaint', 'Cause', 'Correction', 'Signatures'],
    fields: ['Unit Number', 'Serial Number', 'Customer Name', 'Work Order Number', 'PO Number'],
    requiredEvidence: [
      { key: 'unit_identification', label: 'Unit Identification', required: true, matchTerms: ['unit', 'asset id', 'vin', 'serial'] },
      { key: 'data_plate', label: 'Data Plate', required: true, matchTerms: ['data plate', 'info plate', 'serial plate'] },
      { key: 'defect_photo', label: 'Defect Photo', required: true, matchTerms: ['defect', 'damage', 'complaint', 'failure'] },
      { key: 'repair_photo', label: 'Repair Photo', required: true, matchTerms: ['repair', 'correction', 'fixed', 'after'] },
    ],
    recommendedEvidence: [{ key: 'customer_signature', label: 'Customer Signature', required: false, matchTerms: ['customer signature'] }],
    signatureRequirements: [
      { key: 'technician_signature', label: 'Technician Signature', required: true, matchTerms: ['technician signature'] },
      { key: 'customer_signature', label: 'Customer Signature', required: false, matchTerms: ['customer signature'] },
    ],
    pdfLayout: { sections: ['Service Details', 'Evidence', 'Time Card', 'Signatures'], includeEvidenceGallery: true, includeSignatures: true },
  },
  {
    name: 'Asset Verification',
    description: 'Verify asset identity, data plates, and ownership details.',
    templateType: 'system',
    sections: ['Asset Identification', 'Equipment Information', 'Findings'],
    fields: ['VIN', 'Asset ID', 'Serial Number', 'Unit Number'],
    requiredEvidence: [{ key: 'asset_id', label: 'Asset ID', required: true, matchTerms: ['asset', 'unit', 'vin', 'serial'] }],
    recommendedEvidence: [{ key: 'data_plate', label: 'Data Plate', required: false, matchTerms: ['data plate', 'info plate'] }],
    signatureRequirements: [],
    pdfLayout: { sections: ['Summary', 'Evidence'], includeEvidenceGallery: true, includeSignatures: false },
  },
  {
    name: 'Inspection Report',
    description: 'General inspection workflow for findings, recommendations, and supporting evidence.',
    templateType: 'system',
    sections: ['Customer Information', 'Equipment Information', 'Findings', 'Recommendations'],
    fields: ['Customer Name', 'Asset ID', 'Odometer', 'Findings'],
    requiredEvidence: [{ key: 'asset_identifier', label: 'Asset Identifier', required: true, matchTerms: ['asset', 'vin', 'unit'] }],
    recommendedEvidence: [{ key: 'findings_photo', label: 'Findings Photo', required: false, matchTerms: ['finding', 'condition', 'photo'] }],
    signatureRequirements: [],
    pdfLayout: { sections: ['Summary', 'Evidence', 'Findings'], includeEvidenceGallery: true, includeSignatures: false },
  },
  {
    name: 'Damage Report',
    description: 'Damage documentation package with affected areas, photos, and corrective recommendations.',
    templateType: 'system',
    sections: ['Customer Information', 'Equipment Information', 'Damage', 'Recommendations', 'Signatures'],
    fields: ['Customer Name', 'Asset ID', 'Damage Area', 'Severity'],
    requiredEvidence: [{ key: 'damage_photo', label: 'Damage Photo', required: true, matchTerms: ['damage', 'defect', 'impact'] }],
    recommendedEvidence: [{ key: 'overview_photo', label: 'Overview Photo', required: false, matchTerms: ['overview', 'context'] }],
    signatureRequirements: [],
    pdfLayout: { sections: ['Summary', 'Damage', 'Evidence', 'Signatures'], includeEvidenceGallery: true, includeSignatures: true },
  },
]

export function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}
