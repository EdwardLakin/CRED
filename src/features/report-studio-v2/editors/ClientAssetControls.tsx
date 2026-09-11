/* eslint-disable @typescript-eslint/no-explicit-any */
import { Check, Select } from './ControlsShared';

const SUPPORTED_SECTION_STYLES = [
  ['clean_document', 'Clean document'],
  ['minimal', 'Minimal'],
  ['boxed', 'Boxed'],
  ['carded', 'Carded'],
  ['inspection', 'Inspection'],
  ['executive', 'Executive'],
] as const;

export function ClientAssetControls({brand,patch}:any){
  const rs=brand.report_style,p=(x:any)=>patch({...brand,report_style:{...rs,...x}});
  return <>
    <Select label="Section style" value={rs.sectionStyle} onChange={(v:string)=>p({sectionStyle:v})}>{SUPPORTED_SECTION_STYLES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select>
    <Select label="Spacing" value={rs.sectionSpacing} onChange={(v:string)=>p({sectionSpacing:v})}><option>compact</option><option>standard</option><option>spacious</option></Select>
    <Check label="Labels" checked={rs.showSectionLabels} onChange={(v:boolean)=>p({showSectionLabels:v})}/>
    <Check label="Dividers" checked={rs.showSectionDividers} onChange={(v:boolean)=>p({showSectionDividers:v})}/>
    <Check label="Numbers" checked={rs.showSectionNumbers} onChange={(v:boolean)=>p({showSectionNumbers:v})}/>
  </>;
}
