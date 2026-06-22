'use client'

import { useEffect, useMemo, useState } from 'react'

export type EvidenceLightboxItem = {
  id: string
  captureId?: string
  src: string
  downloadUrl?: string | null
  title: string
  note?: string | null
}

export function EvidenceImageTrigger({
  items,
  currentId,
  imageClassName,
}: {
  items: EvidenceLightboxItem[]
  currentId: string
  imageClassName?: string
}) {
  const safeItems = useMemo(() => items.filter((item) => item.src), [items])
  const matchingIndex = safeItems.findIndex((item) => item.id === currentId || item.captureId === currentId)
  const initialIndex = matchingIndex >= 0 ? matchingIndex : 0
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const currentItem = safeItems[initialIndex]
  const activeItem = activeIndex === null ? null : safeItems[activeIndex]
  const displayedIndex = activeIndex ?? 0

  useEffect(() => {
    if (activeIndex === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveIndex(null)
      if (event.key === 'ArrowLeft') setActiveIndex((index) => index === null ? null : (index + safeItems.length - 1) % safeItems.length)
      if (event.key === 'ArrowRight') setActiveIndex((index) => index === null ? null : (index + 1) % safeItems.length)
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [activeIndex, safeItems.length])

  if (!currentItem) return null

  return (
    <>
      <button type="button" className="evidence-image-expand-button" onClick={() => setActiveIndex(initialIndex)} aria-label={`Expand image ${currentItem.title}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed evidence URLs are short-lived Supabase links and should render exactly as captured. */}
        <img className={imageClassName} src={currentItem.src} alt={currentItem.title} loading="eager" decoding="sync" />
        <span className="evidence-expand-overlay" aria-hidden="true">⛶</span>
      </button>
      {activeItem ? (
        <div className="evidence-lightbox" role="dialog" aria-modal="true" aria-label={`Image preview: ${activeItem.title}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveIndex(null) }}>
          <div className="evidence-lightbox-panel">
            <button type="button" className="evidence-lightbox-close" onClick={() => setActiveIndex(null)} aria-label="Close image preview">×</button>
            <div className="evidence-lightbox-image-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed evidence URLs are short-lived Supabase links and should render exactly as captured. */}
              <img src={activeItem.src} alt={activeItem.title} />
            </div>
            <div className="evidence-lightbox-caption">
              <strong>{activeItem.title}</strong>
              {activeItem.note ? <p>{activeItem.note}</p> : null}
            </div>
            {safeItems.length > 1 ? (
              <div className="evidence-lightbox-nav">
                <button type="button" onClick={() => setActiveIndex((displayedIndex + safeItems.length - 1) % safeItems.length)} aria-label="Previous evidence image">‹</button>
                <span>{displayedIndex + 1} / {safeItems.length}</span>
                <button type="button" onClick={() => setActiveIndex((displayedIndex + 1) % safeItems.length)} aria-label="Next evidence image">›</button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
