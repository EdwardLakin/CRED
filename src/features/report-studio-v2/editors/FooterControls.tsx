/* eslint-disable @typescript-eslint/no-explicit-any */
import { Check, Select, Text, Color } from './ControlsShared';

const SUPPORTED_FOOTER_LAYOUTS = [
  ['minimal', 'Minimal'],
  ['report_id_footer', 'Report ID'],
  ['contact_footer', 'Contact'],
  ['confidential_footer', 'Confidential'],
  ['split_footer', 'Split'],
] as const;

export function FooterControls({brand,patch}:any){
  const p=(x:any)=>patch({...brand,...x});
  return <>
    <Text label="Footer text" value={brand.footer_text} onChange={(v:string)=>p({footer_text:v})}/>
    <Select label="Layout" value={brand.footer_layout} onChange={(v:string)=>p({footer_layout:v})}>{SUPPORTED_FOOTER_LAYOUTS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select>
    <Check label="Page date" checked={brand.show_page_date} onChange={(v:boolean)=>p({show_page_date:v})}/>
    <Check label="Report ID" checked={brand.show_report_id} onChange={(v:boolean)=>p({show_report_id:v})}/>
    <Color label="Footer background" value={brand.colors.footerBackground} onChange={(v:string)=>p({colors:{...brand.colors,footerBackground:v}})}/>
  </>;
}
