/* eslint-disable @typescript-eslint/no-explicit-any */
import { Check, Text } from './ControlsShared';

export function SignatureControls({brand,patch}:any){
  const rs=brand.report_style,p=(x:any)=>patch({...brand,report_style:{...rs,...x}});
  return <>
    <Check label="Show completion / signature block" checked={brand.show_signature_block} onChange={(v:boolean)=>patch({...brand,show_signature_block:v})}/>
    <Text label="Typed signature fallback" value={rs.typedSignature} onChange={(v:string)=>p({typedSignature:v,signatureLayout:'single_signature'})}/>
    <Check label="Show completed date" checked={rs.signatureDate} onChange={(v:boolean)=>p({signatureDate:v,signatureLayout:'single_signature'})}/>
  </>;
}
