import type { Json } from '@/lib/supabase/database.types'

type RelationshipRow = {
  relationship_id: string
  relationship_type: string
  source_type: string
  source_label: string
  target_type: string
  target_label: string
  review_status: string
}

export function RelationshipMapPreview({ content }: { content: Json }) {
  const rows = getRelationshipRows(content)
  if (rows.length === 0) return <p className="muted">No verified relationships were available for this deliverable.</p>
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Source</th><th>Relationship</th><th>Target</th><th>Status</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.relationship_id}><td><strong>{row.source_label}</strong><br /><span className="muted">{row.source_type}</span></td><td>{row.relationship_type}</td><td><strong>{row.target_label}</strong><br /><span className="muted">{row.target_type}</span></td><td>{row.review_status}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

function getRelationshipRows(content: Json): RelationshipRow[] {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return []
  const rows = (content as Record<string, Json>).relationships
  if (!Array.isArray(rows)) return []
  return rows.filter((row): row is RelationshipRow => Boolean(row && typeof row === 'object' && !Array.isArray(row) && typeof row.relationship_id === 'string'))
}
