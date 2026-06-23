import { DeliverableDetail } from '@/features/evidence/deliverables/components/DeliverableDetail'
import { getDeliverableDetail } from '@/features/evidence/deliverables/data'

export default async function DeliverableDetailPage({ params }: { params: Promise<{ id: string; deliverableId: string }> }) {
  const { id, deliverableId } = await params
  const data = await getDeliverableDetail(id, deliverableId)
  return <DeliverableDetail data={data} />
}
