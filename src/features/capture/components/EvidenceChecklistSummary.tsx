import type { CaptureItem } from '../types'
import { getEvidenceChecklistSummary } from '../guided-workflow'

export function EvidenceChecklistSummary({ captures, sessionType }: { captures: CaptureItem[]; sessionType: string }) {
  const summaries = getEvidenceChecklistSummary(captures, sessionType)
  const completeCount = summaries.filter((summary) => summary.status !== 'Missing').length

  return (
    <section className="card detail-card evidence-checklist-summary-card">
      <div className="captures-section-header">
        <div>
          <h2>Report Coverage</h2>
          <p className="muted">
            Compact report coverage for this evidence package. Suggestions are reminders only. Capture evidence in the order that matches your work.
          </p>
        </div>
        <span className="ai-status-pill info">{completeCount} of {summaries.length} groups</span>
      </div>

      <div className="compact-checklist-grid" aria-label="Report coverage summary">
        {summaries.map((summary) => {
          const isMissing = summary.status === 'Missing'
          const label = summary.count > 0 ? `${summary.step.shortLabel} (${summary.count})` : summary.step.shortLabel

          return (
            <span key={summary.step.key} className={isMissing ? 'compact-checklist-item missing' : 'compact-checklist-item'}>
              <span aria-hidden="true">{isMissing ? '✗' : '✓'}</span>
              <span>{label}</span>
            </span>
          )
        })}
      </div>

      <details className="expanded-checklist-details">
        <summary className="secondary-link touch-target">Expand Coverage Suggestions</summary>
        <div className="guided-step-list compact-expanded-step-list">
          {summaries.map((summary) => (
            <article key={summary.step.key} className="guided-step-card guided-step-card-compact">
              <div className="guided-step-header">
                <div>
                  <h3>{summary.step.label}</h3>
                  <p>{summary.step.instruction}</p>
                </div>
                <span className={`guided-status guided-status-${summary.status.toLowerCase().replace(/\s+/g, '-')}`}>
                  {summary.status === 'Missing' ? 'Unresolved' : summary.status}
                </span>
              </div>
              <div className="guided-step-meta">
                <span>{summary.count} related capture{summary.count === 1 ? '' : 's'}</span>
                <span>Examples: {summary.step.examples.join(', ')}</span>
              </div>
            </article>
          ))}
        </div>
      </details>
    </section>
  )
}
