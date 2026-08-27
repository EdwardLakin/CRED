import type { DeliverableSourceData } from '../service'

export function DeliverableSourcePreview({ sources }: { sources: DeliverableSourceData }) {
  return <section className="card detail-card form-stack"><div><p className="eyebrow">Preview source set</p><h3>Default safe source material</h3><p className="muted">This preview shows the deterministic records included before any additional checkbox narrowing is submitted.</p></div><PreviewList title="Items" rows={sources.evidenceItems.map((item) => item.original_filename ?? item.technician_note ?? item.ai_summary ?? item.id)} /><PreviewList title="Timeline events" rows={sources.timelineEvents.map((event) => event.title)} /><PreviewList title="Entities" rows={sources.entities.map((entity) => entity.display_name)} /><PreviewList title="Factual observations" rows={sources.assertions.map((assertion) => assertion.statement)} /></section>
}

function PreviewList({ title, rows }: { title: string; rows: string[] }) {
  return <div><h4>{title}</h4>{rows.length === 0 ? <p className="muted">No records selected.</p> : <ul>{rows.slice(0, 8).map((row, index) => <li key={`${title}-${index}`}>{row}</li>)}</ul>}</div>
}
