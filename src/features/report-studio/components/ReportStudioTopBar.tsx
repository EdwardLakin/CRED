"use client";

import { Button } from "@/components/ui";

type ReportStudioTopBarProps = {
  title: string;
  backHref: string;
  canExport: boolean;
  exportHref: string;
  invalid?: boolean;
};

export function ReportStudioTopBar({
  title,
  backHref,
  canExport,
  exportHref,
  invalid = false,
}: ReportStudioTopBarProps) {
  return (
    <header className="report-studio-appbar">
      <div className="cred-wordmark">CRED</div>
      <nav className="report-studio-breadcrumb" aria-label="Breadcrumb">
        <span>Sessions</span>
        <span>›</span>
        <span>{title}</span>
        <span>›</span>
        <strong>Report Studio</strong>
      </nav>
      <div className="report-studio-actions">
        <a className="button button-secondary" href={backHref}>
          Back to Review
        </a>
        <Button form="report-studio-form" type="submit" disabled={invalid}>
          Save Template
        </Button>
        <a
          className="button button-primary"
          aria-disabled={!canExport}
          href={exportHref}
        >
          Apply &amp; Export
        </a>
      </div>
    </header>
  );
}
