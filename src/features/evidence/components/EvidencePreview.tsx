import Image from 'next/image'

import type { EvidenceLibraryItem } from '@/features/evidence/library/data'

export function EvidencePreview({ item, signedUrl, large = false }: { item: EvidenceLibraryItem; signedUrl?: string; large?: boolean }) {
  if (signedUrl && (item.media_kind === 'image' || item.type === 'photo')) {
    return <Image src={signedUrl} alt={item.original_filename || 'Evidence preview'} className={large ? 'evidence-preview-large' : 'evidence-preview-thumb'} width={large ? 960 : 320} height={large ? 640 : 180} unoptimized />
  }

  if (signedUrl) {
    return <a href={signedUrl} target="_blank" rel="noreferrer" className={large ? 'evidence-file-preview-large' : 'evidence-file-preview'}>Open file</a>
  }

  return <div className={large ? 'evidence-file-preview-large' : 'evidence-file-preview'}>{item.media_kind || item.type || 'Evidence'}</div>
}
