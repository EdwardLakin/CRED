"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getOfflineIdentity } from "@/features/offline/offline-identity";
import { createOfflineSessionDraft } from "@/features/offline/offline-sessions";
import { getPendingCaptures } from "@/features/offline/queue";

export function OfflineDashboard() {
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const identity = getOfflineIdentity();
    if (!identity) return;

    void getPendingCaptures(identity.userId).then((records) => {
      setPendingCount(records.length);
    });
  }, []);

  async function startOfflineSession() {
    const identity = getOfflineIdentity();

    if (!identity) {
      setError("Open CRED once while online before starting a new offline session.");
      return;
    }

    const session = await createOfflineSessionDraft({
      organizationId: identity.organizationId,
      userId: identity.userId,
    });

    window.location.href = `/offline/capture?localSessionId=${encodeURIComponent(session.localSessionId)}`;
  }

  return (
    <main className="page-shell dashboard-shell">
      <section className="card detail-card form-stack">
        <p className="eyebrow">Offline mode</p>
        <h1>Offline Dashboard</h1>
        <p className="muted">
          Start a new inspection or continue saved captures. CRED will sync automatically when your connection returns.
        </p>

        {error ? <p className="error">{error}</p> : null}

        <div className="button-row">
          <button className="button button-primary touch-target" type="button" onClick={() => void startOfflineSession()}>
            New Offline Session
          </button>

          <Link className="button button-secondary touch-target" href="/offline/capture">
            Continue Offline Session
          </Link>
        </div>

        <p className="muted">{pendingCount} pending upload{pendingCount === 1 ? "" : "s"}</p>
      </section>
    </main>
  );
}
