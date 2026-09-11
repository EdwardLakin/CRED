/* eslint-disable @typescript-eslint/no-explicit-any */
import { Check, Color, Select } from './ControlsShared';
import { SAFE_FONT_STACKS } from '../constants';

const SUPPORTED_HEADER_LAYOUTS = [
  ['classic_letterhead', 'Classic letterhead'],
  ['compact_service', 'Compact service'],
  ['minimal', 'Minimal'],
  ['left_rail', 'Left rail'],
  ['centered_logo', 'Centered logo'],
  ['industrial_strip', 'Industrial strip'],
] as const;

export function HeaderControls({brand,patch}:any){
  const p=(x:any)=>patch({...brand,...x});
  return <>
    <Select label="Layout" value={brand.header_layout} onChange={(v:string)=>p({header_layout:v})}>{SUPPORTED_HEADER_LAYOUTS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select>
    <Color label="Background color" value={brand.colors.headerBackground} onChange={(v:string)=>p({colors:{...brand.colors,headerBackground:v}})}/>
    <Check label="Accent rail" checked={brand.report_style.headerOptions?.gradientPreset} onChange={(v:boolean)=>p({report_style:{...brand.report_style,headerOptions:{...brand.report_style.headerOptions,gradientPreset:v}}})}/>
    <Color label="Text color" value={brand.colors.headerText} onChange={(v:string)=>p({colors:{...brand.colors,headerText:v}})}/>
    <Color label="Divider/accent color" value={brand.colors.primary} onChange={(v:string)=>p({colors:{...brand.colors,primary:v}})}/>
    <Select label="Font family" value={(brand.typography as any).areaStacks?.header??brand.typography.headingStack} onChange={(v:string)=>p({typography:{...brand.typography,areaStacks:{...(brand.typography as any).areaStacks,header:v}}})}>{SAFE_FONT_STACKS.map(f=><option key={f}>{f}</option>)}</Select>
  </>;
}
