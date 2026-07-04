/* eslint-disable @typescript-eslint/no-explicit-any */
import { PreviewDocument } from "./preview/PreviewDocument";
export function ReportPreviewCanvas(props:any){return <section className="rsv2-preview-canvas" data-testid="report-preview-scroll"><div className="rsv2-preview-hint">Click any report section to edit it.</div><p className="rsv2-editing-note">Future-ready selected-element model: previews expose stable data-edit-key targets; editable style values persist through template config.</p><PreviewDocument {...props}/></section>}
