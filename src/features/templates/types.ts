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
    name: 'Battery and Charging System',
    description: 'AI-guided battery test and charging system workflow with form-aware readings, documentation requirements, and pass/fail thresholds.',
    templateType: 'system',
    sections: ['Battery Identification', 'Battery Test Form', 'Charging System', 'Findings', 'Recommendations', 'Technician Approval'],
    fields: ['Battery Voltage', 'CCA', 'Current Draw', 'Ripple Voltage'],
    requiredEvidence: [
      { key: 'battery_voltage', label: 'Battery Voltage', required: true, matchTerms: ['battery voltage', 'voltage', '12.6v', '12.4v'] },
      { key: 'cca', label: 'CCA', required: true, matchTerms: ['cca', 'cold cranking amps', 'cranking amps'] },
      { key: 'current_draw', label: 'Current Draw', required: true, matchTerms: ['current draw', 'parasitic draw', 'amp draw'] },
      { key: 'ripple_voltage', label: 'Ripple Voltage', required: true, matchTerms: ['ripple voltage', 'alternator ripple', 'ac ripple'] },
    ],
    recommendedEvidence: [{ key: 'battery_label', label: 'Battery Label', required: false, matchTerms: ['battery label', 'battery date', 'battery spec'] }],
    signatureRequirements: [{ key: 'technician_approval', label: 'Technician Approval', required: true, matchTerms: ['technician approval', 'technician signature'] }],
    pdfLayout: { sections: ['Summary', 'Battery Test Form', 'Items', 'Findings', 'Signatures'], includeEvidenceGallery: true, includeSignatures: true },
  },
  {
    name: 'Safety Inspection',
    description: 'Required safety item workflow with defect documentation, critical finding escalation, and final technician approval.',
    templateType: 'system',
    sections: ['Asset Identification', 'Safety Items', 'Critical Findings', 'Corrective Actions', 'Technician Approval'],
    fields: ['Asset ID', 'Brakes', 'Steering', 'Lights', 'Horn', 'Leaks', 'Guarding'],
    requiredEvidence: ['Asset ID', 'Brakes', 'Steering', 'Lights', 'Horn', 'Leaks'].map((label) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label, required: true, matchTerms: [label.toLowerCase()] })),
    recommendedEvidence: [{ key: 'overview_photo', label: 'Overview Photo', required: false, matchTerms: ['overview', 'asset overview'] }],
    signatureRequirements: [{ key: 'technician_approval', label: 'Technician Approval', required: true, matchTerms: ['technician approval', 'signature'] }],
    pdfLayout: { sections: ['Summary', 'Safety Items', 'Critical Findings', 'Items', 'Signatures'], includeEvidenceGallery: true, includeSignatures: true },
  },
  {
    name: 'Forklift Inspection',
    description: 'Forklift inspection workflow for mast, forks, chains, hydraulics, safety devices, and operator signoff.',
    templateType: 'system',
    sections: ['Forklift Identification', 'Pre-Operation Checks', 'Mast and Forks', 'Hydraulics', 'Safety Devices', 'Signoff'],
    fields: ['Unit Number', 'Hour Meter', 'Fork Condition', 'Chain Condition', 'Hydraulic Leaks', 'Capacity Plate'],
    requiredEvidence: ['Unit Number', 'Hour Meter', 'Fork Condition', 'Chain Condition', 'Hydraulic Leaks', 'Capacity Plate'].map((label) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label, required: true, matchTerms: [label.toLowerCase()] })),
    recommendedEvidence: [{ key: 'operator_note', label: 'Operator Note', required: false, matchTerms: ['operator note', 'voice note'] }],
    signatureRequirements: [{ key: 'inspector_signature', label: 'Inspector Signature', required: true, matchTerms: ['inspector signature'] }],
    pdfLayout: { sections: ['Summary', 'Forklift Checks', 'Items', 'Defects', 'Signatures'], includeEvidenceGallery: true, includeSignatures: true },
  },
  {
    name: 'Fleet PM',
    description: 'Preventive maintenance inspection workflow with fluid, tire, brake, lighting, and service documentation requirements.',
    templateType: 'system',
    sections: ['Vehicle Identification', 'PM Checklist', 'Service Findings', 'Parts and Recommendations', 'Approval'],
    fields: ['VIN', 'Unit Number', 'Odometer', 'Engine Oil', 'Coolant', 'Tires', 'Brakes', 'Lights'],
    requiredEvidence: ['VIN', 'Odometer', 'Engine Oil', 'Coolant', 'Tires', 'Brakes', 'Lights'].map((label) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label, required: true, matchTerms: [label.toLowerCase()] })),
    recommendedEvidence: [{ key: 'service_sticker', label: 'Service Sticker', required: false, matchTerms: ['service sticker', 'pm sticker'] }],
    signatureRequirements: [{ key: 'technician_approval', label: 'Technician Approval', required: true, matchTerms: ['technician approval', 'signature'] }],
    pdfLayout: { sections: ['Summary', 'PM Checklist', 'Items', 'Recommendations', 'Signatures'], includeEvidenceGallery: true, includeSignatures: true },
  },
  {
    name: 'Trailer Inspection',
    description: 'Trailer inspection workflow for VIN, brakes, tires, lights, coupling, deck/body, and defect documentation.',
    templateType: 'system',
    sections: ['Trailer Identification', 'Brake and Tire Inspection', 'Lighting', 'Coupling', 'Body and Deck', 'Signoff'],
    fields: ['VIN', 'Unit Number', 'Brake Condition', 'Tire Tread', 'Lights', 'Coupler', 'Deck Condition'],
    requiredEvidence: ['VIN', 'Brake Condition', 'Tire Tread', 'Lights', 'Coupler', 'Deck Condition'].map((label) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label, required: true, matchTerms: [label.toLowerCase()] })),
    recommendedEvidence: [{ key: 'landing_gear', label: 'Landing Gear', required: false, matchTerms: ['landing gear', 'jack'] }],
    signatureRequirements: [{ key: 'inspector_signature', label: 'Inspector Signature', required: true, matchTerms: ['inspector signature'] }],
    pdfLayout: { sections: ['Summary', 'Trailer Items', 'Items', 'Findings', 'Signatures'], includeEvidenceGallery: true, includeSignatures: true },
  },
  {
    name: 'CVIP Inspection',
    description: 'Commercial vehicle report profile with VIN, registration, odometer, brake, and tire coverage suggestions.',
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
    pdfLayout: { sections: ['Summary', 'Items', 'Findings', 'Signatures'], includeEvidenceGallery: true, includeSignatures: true },
  },
  {
    name: 'Field Service Report',
    description: 'Field service report profile with complaint, cause, correction, equipment, repair documentation, and signatures.',
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
    pdfLayout: { sections: ['Service Details', 'Items', 'Time Card', 'Signatures'], includeEvidenceGallery: true, includeSignatures: true },
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
    pdfLayout: { sections: ['Summary', 'Items'], includeEvidenceGallery: true, includeSignatures: false },
  },
  {
    name: 'Inspection Report',
    description: 'General inspection report profile for findings, recommendations, and supporting items.',
    templateType: 'system',
    sections: ['Customer Information', 'Equipment Information', 'Findings', 'Recommendations'],
    fields: ['Customer Name', 'Asset ID', 'Odometer', 'Findings'],
    requiredEvidence: [{ key: 'asset_identifier', label: 'Asset Identifier', required: true, matchTerms: ['asset', 'vin', 'unit'] }],
    recommendedEvidence: [{ key: 'findings_photo', label: 'Findings Photo', required: false, matchTerms: ['finding', 'condition', 'photo'] }],
    signatureRequirements: [],
    pdfLayout: { sections: ['Summary', 'Items', 'Findings'], includeEvidenceGallery: true, includeSignatures: false },
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
    pdfLayout: { sections: ['Summary', 'Damage', 'Items', 'Signatures'], includeEvidenceGallery: true, includeSignatures: true },
  },
]

export function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}
