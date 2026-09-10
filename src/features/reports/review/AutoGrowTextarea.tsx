"use client";

import { useCallback, useEffect, useRef, type TextareaHTMLAttributes } from "react";

/**
 * A textarea that grows to fit its content.
 *
 * The review editor's customer-facing fields were fixed-height, so the text a
 * reviewer is being asked to approve was routinely cut off mid-sentence with no
 * indication anything was hidden. Growing to content means what you see is what
 * the customer gets.
 *
 * `field-sizing: content` does this natively in newer browsers; this keeps the
 * behaviour consistent on the older Safari versions field technicians are on.
 * The `rows` prop still sets the minimum height.
 */
export function AutoGrowTextarea({
  onInput,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element) return;
    // Collapse first so the scroll height reflects a shrink as well as a grow.
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    resize(element);
    if (typeof ResizeObserver === "undefined") return;
    // The field's width changes when the grid reflows; height must follow.
    const observer = new ResizeObserver(() => resize(element));
    observer.observe(element);
    return () => observer.disconnect();
  }, [resize]);

  return (
    <textarea
      {...props}
      ref={ref}
      data-autogrow="true"
      onInput={(event) => {
        resize(event.currentTarget);
        onInput?.(event);
      }}
    />
  );
}
