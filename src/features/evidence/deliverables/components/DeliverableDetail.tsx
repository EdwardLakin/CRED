import Link from 'next/link'
import { formatDateTime } from '@/features/sessions'
import type { DeliverableDetailData } from '../data'
import { summarizeDeliverableContent, summarizeDeliverableProvenance } from '../data'
import { DeliverablePreview } from './DeliverablePreview'

export function DeliverableDetail({ data }: { data: DeliverableDetailData }) {
  const { deliverable, session, timeZone } = data
  return <main className="page-shell dashboard-shell"><div className="section-header page-header"><div><Link href={`/dashboard/sessions/${session.id}/deliverables`} className="secondary-link touch-target">← Deliverables workspace</Link><h1>{deliverable.title}</h1><p className="muted">{session.title} · Printable evidence deliverable</p></div><Link href={`/dashboard/sessions/${session.id}/deliverables/${deliverable.id}/print`} className="button button-primary touch-target">Print / export</Link></div><section className="card detail-card form-stack"><div className="metadata-list"><div><dt>Type</dt><dd>{deliverable.deliverable_type}</dd></div><div><dt>Status</dt><dd>{deliverable.status}</dd></div><div><dt>Generated</dt><dd>{formatDateTime(deliverable.generated_at, timeZone)}</dd></div><div><dt>Preview</dt><dd>{summarizeDeliverableContent(deliverable.content)}</dd></div></div><div><h2>Source / provenance</h2><p className="muted">{summarizeDeliverableProvenance(deliverable.provenance, deliverable.source_ids)}</p></div><div><h2>Preview content</h2><DeliverablePreview deliverable={deliverable} /></div></section></main>
}
