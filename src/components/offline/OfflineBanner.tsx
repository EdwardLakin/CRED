"use client";

import { useOffline } from "@/features/offline/OfflineProvider";

export function OfflineBanner() {
  const { online, syncing, pendingCaptures, lastError, syncNow } = useOffline();

  if (online && !syncing && pendingCaptures === 0 && !lastError) {
    return null;
  }

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <div>
        <strong>{syncing ? "Syncing…" : online ? "Online" : "Offline"}</strong>
        <p className="muted">
          {lastError
            ? lastError
            : syncing
              ? "Checking offline captures."
              : online
                ? `${pendingCaptures} capture${pendingCaptures === 1 ? "" : "s"} waiting to sync.`
                : "Captures will sync automatically when connection returns."}
        </p>
      </div>
      {online && pendingCaptures > 0 ? (
        <button className="button button-secondary" type="button" onClick={() => void syncNow()}>
          Sync now
        </button>
      ) : null}
    </div>
  );
}
