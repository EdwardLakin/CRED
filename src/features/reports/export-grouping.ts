export type ExportGroupCapture = {
  id: string;
  observation_group_id: string | null;
  group_order: number | null;
  captured_at: string;
};

export function getObservationGroupKey(capture: ExportGroupCapture) {
  return capture.observation_group_id ?? capture.id;
}

export function compareObservationGroupCaptures(
  left: ExportGroupCapture,
  right: ExportGroupCapture,
) {
  const groupKey = getObservationGroupKey(left);
  return (
    (left.group_order ?? (left.id === groupKey ? 1 : 999)) -
      (right.group_order ?? (right.id === groupKey ? 1 : 999)) ||
    left.captured_at.localeCompare(right.captured_at)
  );
}

export function getOrderedObservationGroupCaptures<TCapture extends ExportGroupCapture>(
  primary: TCapture,
  captures: TCapture[],
) {
  const groupKey = getObservationGroupKey(primary);
  return captures
    .filter((capture) => getObservationGroupKey(capture) === groupKey)
    .sort(compareObservationGroupCaptures);
}
