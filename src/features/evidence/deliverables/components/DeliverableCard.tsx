import { generateEvidenceDeliverable } from '../actions'

export function DeliverableCard({ sessionId, type, title, description }: { sessionId: string; type: string; title: string; description: string }) {
  return <div className="card detail-card form-stack"><div><h3>{title}</h3><p className="muted">{description}</p></div><form action={generateEvidenceDeliverable.bind(null, sessionId)}><input type="hidden" name="deliverable_type" value={type} /><button className="button button-primary touch-target">Generate / regenerate</button></form></div>
}
