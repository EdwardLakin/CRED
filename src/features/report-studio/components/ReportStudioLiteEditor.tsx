"use client";

import type { ReactNode } from "react";

export function ReportStudioLiteEditor({ children }: { children: ReactNode }) {
  return (
    <section
      className="report-studio-lite-shell"
      aria-label="Report Studio Lite mobile editor"
    >
      {children}
    </section>
  );
}
