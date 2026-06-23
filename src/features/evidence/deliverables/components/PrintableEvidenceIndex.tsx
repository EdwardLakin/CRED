import type { Json } from '@/lib/supabase/database.types'

function rows(content: Json) {
  return content && typeof content === 'object' && !Array.isArray(content) && Array.isArray(content.items) ? content.items as Array<Record<string, unknown>> : []
}

export function PrintableEvidenceIndex({ content }: { content: Json }) {
  const items = rows(content)
  return <section className="print-section"><h2>Evidence Index</h2>{items.length === 0 ? <p>No evidence index rows were captured in this deliverable snapshot.</p> : <div className="print-table-wrap"><table className="print-table"><thead><tr><th>Identifier</th><th>Title</th><th>Source kind</th><th>Source date</th><th>Review</th><th>Included</th></tr></thead><tbody>{items.map((item) => <tr key={String(item.evidence_item_id)}><td>{String(item.identifier ?? '').slice(0, 12)}</td><td><strong>{String(item.title ?? 'Untitled evidence')}</strong></td><td>{String(item.source_kind ?? 'unknown')}</td><td>{String(item.source_date ?? item.captured_date ?? 'Not dated')}</td><td>{String(item.review_status ?? 'unreviewed')}</td><td>{item.include_in_outputs ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div>}</section>
}
