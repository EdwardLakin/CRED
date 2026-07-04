/* eslint-disable @typescript-eslint/no-explicit-any */
import { Check, Select } from './ControlsShared';

const coverOptions = [
  ['none', 'None'],
  ['simple_cover', 'Simple'],
  ['professional_cover', 'Professional'],
  ['minimal_cover', 'Minimal'],
  ['classic_cover', 'Classic'],
  ['modern_gradient_cover', 'Modern gradient'],
  ['full_color_cover', 'Full color'],
  ['split_panel_cover', 'Split panel'],
  ['photo_cover', 'Photo cover'],
  ['industrial_bold_cover', 'Industrial bold'],
];

function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const safeValue = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#ffffff';
  return <label className="rsv2-field rsv2-color-field"><span>{label}</span><input type="color" value={safeValue} aria-label={`${label} picker`} onChange={(e)=>onChange(e.target.value)}/><input aria-label={`${label} hex value`} placeholder="#000000" value={value} onChange={(e)=>onChange(e.target.value)}/></label>;
}

function CoverTextColor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const normalized = value && value !== 'auto' ? value : '#ffffff';
  return <div className="rsv2-field"><span>Cover text color</span><select value={value ?? 'auto'} onChange={(e)=>onChange(e.target.value)}><option value="auto">Auto / default</option><option value="#000000">Black</option><option value="#ffffff">White</option></select><label className="rsv2-color-field rsv2-inline-color"><input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(normalized) ? normalized : '#ffffff'} aria-label="Custom cover text color picker" onChange={(e)=>onChange(e.target.value)}/><input aria-label="Custom cover text hex value" placeholder="#111827" value={value === 'auto' ? '' : value} onChange={(e)=>onChange(e.target.value || 'auto')}/></label></div>;
}

export function CoverControls({brand,patch}:any){
  const rs=brand.report_style,p=(x:any)=>patch({...brand,report_style:{...rs,...x}});
  return <>
    <Select label="Cover" value={rs.coverPage} onChange={(v:string)=>p({coverPage:v})}>{coverOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select>
    <Color label="Background color" value={rs.coverBackgroundColor ?? '#ffffff'} onChange={(v)=>p({coverBackgroundColor:v})}/>
    <Color label="Gradient start" value={rs.coverGradientStart ?? brand.colors.primary} onChange={(v)=>p({coverGradientStart:v})}/>
    <Color label="Gradient end" value={rs.coverGradientEnd ?? '#ffffff'} onChange={(v)=>p({coverGradientEnd:v})}/>
    <Color label="Accent color" value={rs.coverAccentColor ?? brand.colors.primary} onChange={(v)=>p({coverAccentColor:v})}/>
    <CoverTextColor value={rs.coverTextColor ?? 'auto'} onChange={(v)=>p({coverTextColor:v})}/>
    <Select label="Title alignment" value={rs.coverTitleAlignment ?? 'left'} onChange={(v:string)=>p({coverTitleAlignment:v})}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></Select>
    <Select label="Logo size" value={rs.coverLogoSize ?? 'medium'} onChange={(v:string)=>p({coverLogoSize:v})}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></Select>
    <Check label="Show logo" checked={rs.showCoverLogo} onChange={(v:boolean)=>p({showCoverLogo:v})}/>
    <Check label="Show report ID" checked={rs.showCoverReportId} onChange={(v:boolean)=>p({showCoverReportId:v})}/>
    <Check label="Show date" checked={rs.showCoverDate} onChange={(v:boolean)=>p({showCoverDate:v})}/>
    <Check label="Show customer" checked={rs.showCoverClient} onChange={(v:boolean)=>p({showCoverClient:v})}/>
    <Check label="Show asset" checked={rs.showCoverAsset} onChange={(v:boolean)=>p({showCoverAsset:v})}/>
    <Check label="Show cover image" checked={rs.showCoverImage} onChange={(v:boolean)=>p({showCoverImage:v,coverImageSource:v?'first_evidence_image':'none'})}/>
  </>;
}
