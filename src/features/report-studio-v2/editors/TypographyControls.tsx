/* eslint-disable @typescript-eslint/no-explicit-any */
import { TYPOGRAPHY_OPTIONS, TYPOGRAPHY_PRESETS } from '@/features/branding/types';
import { SAFE_FONT_STACKS, TYPOGRAPHY_AREAS } from '../constants';
import { Select } from './ControlsShared';

export function TypographyControls({brand,patch}:any){
  const p=(typography:any)=>patch({...brand,typography:{...brand.typography,...typography}});
  const applyPreset=(value:string)=>{
    const preset=(TYPOGRAPHY_OPTIONS as any)[value];
    if(!preset)return;
    p({
      ...preset,
      areaStacks:{
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
    <Select label="Preset" value={brand.typography.preset} onChange={applyPreset}>{TYPOGRAPHY_PRESETS.map(x=><option key={x} value={x}>{TYPOGRAPHY_OPTIONS[x].name}</option>)}</Select>
    {TYPOGRAPHY_AREAS.map(([key,label])=><Select key={key} label={`${label} font`} value={(brand.typography as any).areaStacks?.[key]??brand.typography.bodyStack} onChange={(v:string)=>p({areaStacks:{...(brand.typography as any).areaStacks,[key]:v}})}>{SAFE_FONT_STACKS.map(f=><option key={f} value={f}>{f}</option>)}</Select>)}
  </>;
}
