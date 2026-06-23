import Link from 'next/link'
import { formatDateTime } from '@/features/sessions'
import type { getDeliverablesData } from '../data'
import { summarizeDeliverableContent } from '../data'
import { DeliverableCard } from './DeliverableCard'
import { DeliverablePreview } from './DeliverablePreview'

export function DeliverablesWorkspace({ data }: { data: Awaited<ReturnType<typeof getDeliverablesData>> }) {
  return <div className="form-stack"><section className="workspace-card-grid" aria-label="Available deliverable types">{data.availableTypes.map((type) => <DeliverableCard key={type.type} sessionId={data.session.id} {...type} />)}</section><section className="card detail-card form-stack"><div><p className="eyebrow">Generated deliverables</p><h2>Preview outputs</h2><p className="muted">Deterministic previews generated from evidence relationships. PDF export is not included in this foundation.</p></div>{data.deliverables.length === 0 ? <p className="muted">No deliverables generated yet.</p> : data.deliverables.map((deliverable) => <div key={deliverable.id} className="form-stack"><div className="metadata-list"><div><dt>Type</dt><dd>{deliverable.title}</dd></div><div><dt>Status</dt><dd>{deliverable.status}</dd></div><div><dt>Generated</dt><dd>{formatDateTime(deliverable.generated_at, data.timeZone)}</dd></div><div><dt>Preview</dt><dd>{summarizeDeliverableContent(deliverable.content)}</dd></div></div><div className="button-row"><Link href={`/dashboard/sessions/${data.session.id}/deliverables/${deliverable.id}`} className="button button-secondary touch-target">View</Link><Link href={`/dashboard/sessions/${data.session.id}/deliverables/${deliverable.id}/print`} className="button button-secondary touch-target">Print</Link></div><DeliverablePreview deliverable={deliverable} /></div>)}</section></div>
}
