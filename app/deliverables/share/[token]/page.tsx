import { createAdminClient } from '@/lib/supabase/admin'
import { formatDateTime } from '@/features/sessions'
import { resolveDeliverableShareToken } from '@/features/evidence/deliverables/share'
import { DeliverablePrintView } from '@/features/evidence/deliverables/components/DeliverablePrintView'

export default async function SharedDeliverablePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createAdminClient()
  const { shareToken, session, deliverable } = await resolveDeliverableShareToken(supabase, token)
  return <main className="page-shell"><section className="card detail-card form-stack"><div className="section-header"><div><p className="eyebrow">Secure share link</p><h1>{deliverable.title}</h1><p className="muted">Finalized deliverable · This exact version</p></div><button className="button button-secondary touch-target" type="button">Print</button></div><div className="metadata-list"><div><dt>Organization / facility</dt><dd>{session.title}</dd></div><div><dt>Version</dt><dd>Version {deliverable.version_number}</dd></div><div><dt>Lifecycle</dt><dd>Final</dd></div><div><dt>Generated</dt><dd>{formatDateTime(deliverable.generated_at, null)}</dd></div>{deliverable.finalized_at ? <div><dt>Finalized</dt><dd>{formatDateTime(deliverable.finalized_at, null)}</dd></div> : null}<div><dt>Expires</dt><dd>{shareToken.expires_at ? formatDateTime(shareToken.expires_at, null) : 'When revoked'}</dd></div></div><p className="muted"><strong>Source-controlled deliverable:</strong> This read-only page renders the stored finalized content and provenance note for this exact version. Newer versions are not shared automatically.</p></section><DeliverablePrintView data={{ session: session as never, deliverable, shareTokens: [shareToken], timeZone: null }} /></main>
}
