import { deliverableTypeCards } from '../data'

export function DeliverableGenerationOptions() {
  return <fieldset className="form-stack"><legend>Deliverable type</legend>{deliverableTypeCards.map((card, index) => <label key={card.type} className="checkbox-row"><input type="radio" name="deliverable_type" value={card.type} defaultChecked={index === 0} /> <span><strong>{card.title}</strong><br /><span className="muted">{card.description}</span></span></label>)}</fieldset>
}
