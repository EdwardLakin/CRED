/* eslint-disable @typescript-eslint/no-explicit-any */
import { TYPOGRAPHY_OPTIONS } from '@/features/branding/types';
import { SAFE_FONT_STACKS, TYPOGRAPHY_AREAS } from '../constants';
import { Select } from './ControlsShared';

const SUPPORTED_PRESETS = [
  'professional_sans',
  'editorial_serif',
  'legal_document',
  'system_sans',
  'system_serif',
] as const;

export function TypographyControls({brand,patch}:any){
  const p=(typography:any)=>patch({...brand,typography:{...brand.typography,...typography}});
  const applyPreset=(value:string)=>{
    const preset=(TYPOGRAPHY_OPTIONS as any)[value];
    if(!preset)return;
    p({
      ...preset,
      areaStacks:{
        ...((brand.typography as any).areaStacks??{}),
        cover_page:preset.headingStack,
        header:preset.headingStack,
        section_headings:preset.headingStack,
        body_text:preset.bodyStack,
        evidence_titles:preset.headingStack,
        evidence_notes:preset.bodyStack,
        footer:preset.bodyStack,
        signature:preset.bodyStack,
      },
    });
  };
  return <>
    <Select label="Preset" value={brand.typography.preset} onChange={applyPreset}>{SUPPORTED_PRESETS.map(x=><option key={x} value={x}>{TYPOGRAPHY_OPTIONS[x].name}</option>)}</Select>
    {TYPOGRAPHY_AREAS.map(([key,label])=><Select key={key} label={`${label} font`} value={(brand.typography as any).areaStacks?.[key]??brand.typography.bodyStack} onChange={(v:string)=>p({areaStacks:{...(brand.typography as any).areaStacks,[key]:v}})}>{SAFE_FONT_STACKS.map(f=><option key={f}>{f}</option>)}</Select>)}
  </>;
}
