import Link from 'next/link'
import { EvidenceWorkspaceBacklinks } from '@/features/evidence/components/EvidenceWorkspaceNav'

import { AssertionsWorkspace } from '@/features/evidence/components/AssertionsWorkspace'
import { getAssertionsData } from '@/features/evidence/assertions/data'

export default async function AssertionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getAssertionsData(id)
  return <main className="page-shell dashboard-shell"><div className="section-header page-header"><div><Link href={`/dashboard/sessions/${data.session.id}`} className="secondary-link touch-target">← Session</Link><h1>Factual Observations</h1><p className="muted">{data.session.title} · {data.assertions.length} factual observations</p></div></div><EvidenceWorkspaceBacklinks sessionId={data.session.id} current="assertions" /><AssertionsWorkspace {...data} /></main>
}
