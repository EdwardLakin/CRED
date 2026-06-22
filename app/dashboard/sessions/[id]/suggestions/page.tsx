import Link from 'next/link'
import { EvidenceWorkspaceBacklinks } from '@/features/evidence/components/EvidenceWorkspaceNav'
import { SuggestionsWorkspace } from '@/features/evidence/suggestions/components/SuggestionsWorkspace'
import { getSuggestionsData } from '@/features/evidence/suggestions/data'

export default async function SuggestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getSuggestionsData(id)
  return <main className="page-shell dashboard-shell"><div className="section-header page-header"><div><Link href={`/dashboard/sessions/${data.session.id}`} className="secondary-link touch-target">← Session</Link><h1>Suggestions</h1><p className="muted">{data.session.title} · AI-generated suggestions require human review</p></div></div><EvidenceWorkspaceBacklinks sessionId={data.session.id} current="suggestions" /><SuggestionsWorkspace data={data} /></main>
}
