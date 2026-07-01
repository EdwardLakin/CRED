/* eslint-disable @typescript-eslint/no-explicit-any */
import { COLOR_LABELS } from '@/features/branding/types';import { Color } from './ControlsShared'; export function ColorControls({brand,patch}:any){return <>{Object.entries(COLOR_LABELS).map(([k,label])=><Color key={k} label={label} value={brand.colors[k]} onChange={(v:string)=>patch({...brand,colors:{...brand.colors,[k]:v}})}/>)}</>}
