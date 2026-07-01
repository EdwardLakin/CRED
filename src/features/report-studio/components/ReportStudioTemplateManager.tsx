"use client";

import type { ReactNode } from "react";

export function ReportStudioTemplateManager({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <section
      className="brand-section form-stack"
      data-report-studio-component="template-manager"
    >
      {children}
    </section>
  );
}
