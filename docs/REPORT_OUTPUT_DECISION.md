# Report Output Decision

## Current supported format

CRED currently serves report output as print-ready HTML from the existing report route. The report is optimized for browser printing and includes a polished print stylesheet, evidence media, technician notes, extracted details, and captured signatures.

## Binary PDF status

True binary PDF generation is **not implemented** for the MVP. The current dependency set does not include a small, reliable server-side HTML-to-PDF renderer. Adding a headless browser dependency would increase deployment size and fragility, and manually recreating the HTML layout in a PDF drawing library would risk inconsistent report output before launch.

## User-facing copy

The product now describes this flow as a **Printable Report**. Buttons and report-page instructions use honest labels such as “Open Printable Report” and “Print / Save as PDF.” The report route continues to return `text/html`, and the page instructs users to use their browser’s Print or Share menu to save as PDF.

## Future PDF hardening

Future work can add true `application/pdf` responses once a Vercel-compatible renderer is selected and tested. That work should preserve token-scoped public report access, avoid exposing private storage paths, embed or safely proxy signed media server-side, set `Content-Disposition: attachment; filename="cred-report-{sessionId}.pdf"`, and record `pdf_generated` only when a real PDF file is produced.
