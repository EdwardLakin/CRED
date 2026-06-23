import { generateEvidenceDeliverableFormAction } from '../actions'
import type { getDeliverablesData } from '../data'
import { DeliverableGenerationOptions } from './DeliverableGenerationOptions'
import { DeliverableSourceCounts } from './DeliverableSourceCounts'
import { DeliverableSourcePreview } from './DeliverableSourcePreview'
import { DeliverableSourceSelector } from './DeliverableSourceSelector'

export function DeliverableAssemblyPanel({ data }: { data: Awaited<ReturnType<typeof getDeliverablesData>> }) {
  return <section className="card detail-card form-stack" aria-label="Deliverable assembly controls"><div><p className="eyebrow">Deliverable assembly</p><h2>Choose source material before generation</h2><p className="muted">Safe defaults include reviewed, output-included evidence and accepted or edited workspace records only. Suggested, rejected, deleted, cross-session, and cross-organization records are excluded.</p></div><DeliverableSourceCounts counts={data.sourceCounts} /><form action={generateEvidenceDeliverableFormAction.bind(null, data.session.id)} className="form-stack"><DeliverableGenerationOptions /><DeliverableSourceSelector sources={data.assemblySources} /><button className="button button-primary touch-target">Generate deliverable from selected sources</button></form><DeliverableSourcePreview sources={data.previewSources} /></section>
}
