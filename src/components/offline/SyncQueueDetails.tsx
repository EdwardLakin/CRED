"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { getSyncQueueDebugItems } from "@/features/offline/queue";
import { useOffline } from "@/features/offline/OfflineProvider";

type QueueItem = Awaited<ReturnType<typeof getSyncQueueDebugItems>>[number];

function statusLabel(status: string) {
  if (status === "uploading") return "Uploading";
  if (status === "creating_record") return "Finishing save";
  if (status === "blocked" || status === "failed") return "Needs attention";
  if (status === "synced") return "Synced";
  return "Waiting to sync";
}

export function SyncQueueDetails() {
  const { clearStaleUploads } = useOffline();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isClearing, startClearing] = useTransition();
  const loadItems = useCallback(
    () => getSyncQueueDebugItems().then(setItems).catch(() => setItems([])),
    [],
  );

  useEffect(() => {
    if (open) void loadItems();
  }, [loadItems, open]);

  function clearStale() {
    setMessage(null);
    startClearing(async () => {
      try {
        const removed = await clearStaleUploads();
        await loadItems();
        setMessage(
          removed > 0
            ? `${removed} stale upload${removed === 1 ? "" : "s"} cleared.`
            : "No stale uploads were found.",
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to clear stale uploads.");
      }
    });
  }

  return (
    <details className="sync-queue-details" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>View sync queue</summary>
      {items.length === 0 ? (
        <p className="muted">No uploads are waiting on this device.</p>
      ) : (
        <>
          <ul>
            {items.map((item) => (
              <li key={item.localId}>
                <strong>{item.filename || "Captured item"}</strong> · {statusLabel(item.status)}
                {item.lastError ? ` · ${item.lastError}` : ""}
              </li>
            ))}
          </ul>
          <button
            className="button button-secondary touch-target"
            type="button"
            disabled={isClearing}
            onClick={clearStale}
          >
            {isClearing ? "Checking…" : "Clear stale uploads"}
          </button>
        </>
      )}
      {message ? <p role="status">{message}</p> : null}
    </details>
  );
}
