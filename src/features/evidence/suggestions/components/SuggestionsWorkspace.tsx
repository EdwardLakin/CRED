import { generateAiEvidenceSuggestions } from '@/features/evidence/suggestions/actions'
import type { getSuggestionsData } from '@/features/evidence/suggestions/data'
import { EntitySuggestionCard } from './EntitySuggestionCard'
import { ObservationSuggestionCard } from './ObservationSuggestionCard'
import { RelationshipSuggestionCard } from './RelationshipSuggestionCard'
import { TimelineSuggestionCard } from './TimelineSuggestionCard'

type SuggestionsData = Awaited<ReturnType<typeof getSuggestionsData>>

export function SuggestionsWorkspace({ data }: { data: SuggestionsData }) {
  const generateAction = generateAiEvidenceSuggestions.bind(null, data.session.id)
  return <section className="form-stack" aria-labelledby="suggestions-heading"><div className="card detail-card form-stack"><div><p className="eyebrow">AI Evidence Suggestions</p><h2 id="suggestions-heading">Reviewable suggestions only</h2><p className="muted">AI can organize uploaded evidence into suggestions, but it never creates verified truth automatically. Accept, edit and accept, or reject each item.</p></div><form action={generateAction}><button className="button button-primary touch-target">Generate suggestions from evidence</button></form></div><SuggestionSection title="Timeline Suggestions" empty="No timeline suggestions yet.">{data.timelineSuggestions.map((suggestion) => <TimelineSuggestionCard key={suggestion.id} sessionId={data.session.id} suggestion={suggestion} />)}</SuggestionSection><SuggestionSection title="Entity Suggestions" empty="No entity suggestions yet.">{data.entitySuggestions.map((suggestion) => <EntitySuggestionCard key={suggestion.id} sessionId={data.session.id} suggestion={suggestion} />)}</SuggestionSection><SuggestionSection title="Observation Suggestions" empty="No observation suggestions yet.">{data.observationSuggestions.map((suggestion) => <ObservationSuggestionCard key={suggestion.id} sessionId={data.session.id} suggestion={suggestion} />)}</SuggestionSection><SuggestionSection title="Relationship Suggestions" empty="No relationship suggestions yet.">{data.relationshipSuggestions.map((suggestion) => <RelationshipSuggestionCard key={suggestion.id} sessionId={data.session.id} suggestion={suggestion} />)}</SuggestionSection></section>
}

function SuggestionSection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return <section className="form-stack"><h2>{title}</h2>{hasChildren ? children : <p className="muted">{empty}</p>}</section>
}
