/* eslint-disable @typescript-eslint/no-explicit-any */
import { Check, Select } from './ControlsShared';
import { EVIDENCE_IMAGE_SIZES } from '@/features/branding/types';

const SUPPORTED_EVIDENCE_STYLES = [
  ['compact_list', 'Compact list'],
  ['standard_cards', 'Standard cards'],
  ['large_photo_cards', 'Large photo cards'],
  ['photo_left_notes_right', 'Photo left / notes right'],
  ['notes_first_photos_below', 'Notes first / photos below'],
  ['photo_grid', 'Photo grid'],
] as const;

export function EvidenceControls({brand,patch}:any){
  const rs=brand.report_style,p=(x:any)=>patch({...brand,report_style:{...rs,...x}});
  return <>
    <Select label="Item layout" value={rs.evidenceStyle} onChange={(v:string)=>p({evidenceStyle:v})}>{SUPPORTED_EVIDENCE_STYLES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select>
    <Select label="Photo size" value={rs.evidenceImageSize} onChange={(v:string)=>p({evidenceImageSize:v})}>{EVIDENCE_IMAGE_SIZES.map(x=><option key={x}>{x}</option>)}</Select>
    <Check label="Item numbering" checked={rs.evidenceNumbering} onChange={(v:boolean)=>p({evidenceNumbering:v})}/>
    <Check label="Source Index (advanced)" checked={rs.evidenceAppendix} onChange={(v:boolean)=>p({evidenceAppendix:v})}/>
    <Check label="Timestamps" checked={rs.timestamps} onChange={(v:boolean)=>p({timestamps:v})}/>
    <Check label="Metadata" checked={rs.captureMetadata} onChange={(v:boolean)=>p({captureMetadata:v})}/>
    <Check label="Notes" checked={rs.notes} onChange={(v:boolean)=>p({notes:v})}/>
  </>;
}
