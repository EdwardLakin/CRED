/* eslint-disable @typescript-eslint/no-explicit-any */
import { PreviewDocument } from "./preview/PreviewDocument";
export function ReportPreviewCanvas(props:any){return <section className="rsv2-preview-canvas" data-testid="report-preview-scroll"><div className="rsv2-preview-hint">Click any report section to edit it.</div><PreviewDocument {...props}/></section>}
