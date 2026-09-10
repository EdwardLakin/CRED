"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Embeds the printable report and grows to its full height.
 *
 * The share page embeds the HTML report (preview=1), not the PDF. An inline PDF
 * in an iframe renders as page one on iOS with no way to page through it, which
 * is what left a recipient looking at the cover. HTML also has to be readable
 * without an inner scroll region, though: iOS routes a scroll gesture inside a
 * nested frame to the outer page. Since the frame is same-origin HTML we can
 * measure the document and size the frame to it, so the page scrolls normally
 * and nothing is trapped.
 *
 * If measurement is unavailable for any reason, the frame keeps a tall fallback
 * height and the "Open the full report" link above it is the way through.
 */
export function SharedReportFrame({ src, title }: { src: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!doc?.documentElement) return;
    const next = Math.max(
      doc.documentElement.scrollHeight,
      doc.body?.scrollHeight ?? 0,
    );
    if (next > 0) setHeight(next);
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let observer: ResizeObserver | null = null;

    function attach() {
      measure();
      const doc = frame?.contentDocument;
      if (!doc?.documentElement || typeof ResizeObserver === "undefined") return;
      // Images and fonts land after load and change the height, so observe
      // rather than measuring once.
      observer = new ResizeObserver(() => measure());
      observer.observe(doc.documentElement);
    }

    frame.addEventListener("load", attach);
    // The frame may already be loaded when this effect runs.
    if (frame.contentDocument?.readyState === "complete") attach();

    window.addEventListener("resize", measure);
    return () => {
      frame.removeEventListener("load", attach);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [measure]);

  return (
    <iframe
      ref={frameRef}
      src={src}
      title={title}
      className="report-preview-frame"
      style={height ? { height: `${height}px`, minHeight: 0 } : undefined}
    />
  );
}
