import { DeliverablePrintView } from '@/features/evidence/deliverables/components/DeliverablePrintView'
import { getDeliverableDetail } from '@/features/evidence/deliverables/data'

export default async function DeliverablePrintPage({ params }: { params: Promise<{ id: string; deliverableId: string }> }) {
  const { id, deliverableId } = await params
  const data = await getDeliverableDetail(id, deliverableId)
  return <DeliverablePrintView data={data} />
}
