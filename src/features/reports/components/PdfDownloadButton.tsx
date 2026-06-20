"use client";

import { useState } from "react";

type PdfDownloadButtonProps = {
  href: string;
  fileName?: string;
};

export function PdfDownloadButton({
  href,
  fileName = "report.pdf",
}: PdfDownloadButtonProps) {
  const [isPreparing, setIsPreparing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleDownload() {
    if (isPreparing) return;

    setIsPreparing(true);
    setMessage("Preparing PDF…");

    try {
      const response = await fetch(href, {
        cache: "no-store",
        credentials: "same-origin",
        redirect: "follow",
      });
      const contentType = response.headers.get("content-type") ?? "";

      if (
        !response.ok ||
        !contentType.toLowerCase().includes("application/pdf")
      ) {
        setMessage(
          response.ok
            ? "The PDF is not ready yet. Opening the server response in a new tab so you can review the message."
            : `Unable to prepare the PDF (${response.status}). Opening the server response in a new tab.`,
        );
        window.open(response.url || href, "_blank", "noopener,noreferrer");
        return;
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 30_000);
      setMessage("PDF download started.");
    } catch (error) {
      console.error("PDF download failed to start", error);
      setMessage(
        "Unable to start the PDF download. Opening the PDF route in a new tab.",
      );
      window.open(href, "_blank", "noopener,noreferrer");
    } finally {
      setIsPreparing(false);
    }
  }

  return (
    <div className="form-stack">
      <button
        type="button"
        className="button button-primary touch-target"
        disabled={isPreparing}
        aria-busy={isPreparing}
        onClick={handleDownload}
      >
        {isPreparing ? "Preparing PDF…" : "Download PDF"}
      </button>
      {message ? (
        <p className="muted" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      <noscript>
        <a
          href={href}
          className="button button-primary touch-target"
          target="_blank"
          rel="noopener noreferrer"
          download
        >
          Download PDF
        </a>
      </noscript>
    </div>
  );
}
