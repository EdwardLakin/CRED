import type { getDeliverablesData } from '../data'

export function DeliverableGenerationOptions({ availableTypes }: { availableTypes: Awaited<ReturnType<typeof getDeliverablesData>>['availableTypes'] }) {
  return <fieldset className="form-stack"><legend>Deliverable type</legend>{availableTypes.map((card, index) => <label key={card.type} className="checkbox-row"><input type="radio" name="deliverable_type" value={card.type} defaultChecked={index === 0} /> <span><strong>{card.title}</strong><br /><span className="muted">{card.description}</span></span></label>)}</fieldset>
}
