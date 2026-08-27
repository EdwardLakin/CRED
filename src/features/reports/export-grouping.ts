export type ExportGroupCapture = {
  id: string;
  documentation_item_id?: string | null;
  attachment_order?: number | null;
  observation_group_id: string | null;
  group_order: number | null;
  captured_at: string;
};

export function getObservationGroupKey(capture: ExportGroupCapture) {
  return (
    capture.documentation_item_id ?? capture.observation_group_id ?? capture.id
  );
}

export function compareObservationGroupCaptures(
  left: ExportGroupCapture,
  right: ExportGroupCapture,
) {
  const groupKey = getObservationGroupKey(left);
  return (
    (left.attachment_order ??
      left.group_order ??
      (left.id === groupKey ? 1 : 999)) -
      (right.attachment_order ??
        right.group_order ??
        (right.id === groupKey ? 1 : 999)) ||
    left.captured_at.localeCompare(right.captured_at)
  );
}

export function getObservationGroupIdentity(capture: ExportGroupCapture) {
  return [capture.id, capture.observation_group_id].filter(
    (value): value is string => Boolean(value),
  );
}

export function capturesShareObservationGroup(
  left: ExportGroupCapture,
  right: ExportGroupCapture,
) {
  const leftKeys = new Set(getObservationGroupIdentity(left));
  return getObservationGroupIdentity(right).some((key) => leftKeys.has(key));
}

export function getOrderedObservationGroupCaptures<
  TCapture extends ExportGroupCapture,
>(primary: TCapture, captures: TCapture[]) {
  if (primary.documentation_item_id) {
    return captures
      .filter(
        (capture) =>
          capture.documentation_item_id === primary.documentation_item_id,
      )
      .sort(compareObservationGroupCaptures);
  }

  const groupKeys = new Set(getObservationGroupIdentity(primary));
  let changed = true;

  while (changed) {
    changed = false;
    for (const capture of captures) {
      const identities = getObservationGroupIdentity(capture);
      if (!identities.some((key) => groupKeys.has(key))) continue;
      for (const key of identities) {
        if (groupKeys.has(key)) continue;
        groupKeys.add(key);
        changed = true;
      }
    }
  }

  return captures
    .filter((capture) =>
      getObservationGroupIdentity(capture).some((key) => groupKeys.has(key)),
    )
    .sort(compareObservationGroupCaptures);
}
