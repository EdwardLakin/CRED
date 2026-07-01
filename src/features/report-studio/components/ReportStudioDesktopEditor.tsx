"use client";

import type { ReactNode } from "react";

export function ReportStudioDesktopEditor({
  sidebar,
  preview,
  controls,
}: {
  sidebar: ReactNode;
  preview: ReactNode;
  controls: ReactNode;
}) {
  return (
    <div className="report-studio-workbench">
      {sidebar}
      <main className="report-studio-main">
        <div className="report-studio-split">
          <div className="report-studio-preview-column">{preview}</div>
          {controls}
        </div>
      </main>
    </div>
  );
}
