"use client";

import { useOffline } from "@/features/offline/OfflineProvider";
import { SyncQueueDetails } from "./SyncQueueDetails";

export function OfflineBanner() {
  const { online, syncing, pendingCaptures, lastError, syncNow } = useOffline();

  if (online && !syncing && pendingCaptures === 0 && !lastError) {
    return null;
  }

  const label = syncing
    ? "Syncing"
    : !online
      ? "Offline"
      : lastError
        ? "Sync needs attention"
        : `${pendingCaptures} waiting to sync`;
  const detail = lastError
    ? lastError
    : syncing
      ? "Checking saved captures."
      : online
        ? `${pendingCaptures} capture${pendingCaptures === 1 ? "" : "s"} saved on this device.`
        : "Captures will sync automatically when your connection returns.";

  return (
    <aside
      className="offline-status"
      aria-label="Offline and sync status"
      aria-live="polite"
    >
      <details className="offline-status-control">
        <summary>
          <span
            className={lastError ? "offline-status-dot attention" : "offline-status-dot"}
            aria-hidden="true"
          />
          <span>{label}</span>
        </summary>
        <div className="offline-status-panel">
          <p>{detail}</p>
          {online && (pendingCaptures > 0 || lastError) ? (
            <button
              className="button button-secondary touch-target"
              type="button"
              onClick={() => void syncNow()}
            >
              Sync now
            </button>
          ) : null}
          <SyncQueueDetails />
        </div>
      </details>
    </aside>
  );
}
