import type { Json } from '@/lib/supabase/database.types'
export function EvidenceIndexPreview({ content }: { content: Json }) {
  const items = content && typeof content === 'object' && !Array.isArray(content) && Array.isArray(content.items) ? content.items as Array<Record<string, unknown>> : []
  return <div className="table-scroll"><table><thead><tr><th>Identifier</th><th>Title</th><th>Source</th><th>Review</th><th>Include</th></tr></thead><tbody>{items.slice(0, 10).map((item) => <tr key={String(item.evidence_item_id)}><td>{String(item.identifier).slice(0, 8)}</td><td>{String(item.title ?? 'Untitled')}</td><td>{String(item.source_kind ?? 'unknown')}</td><td>{String(item.review_status ?? 'unreviewed')}</td><td>{item.include_in_outputs ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div>
}
