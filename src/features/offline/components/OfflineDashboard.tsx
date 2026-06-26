"use client";

import { useEffect, useState } from "react";

import { OfflineCaptureWorkspace } from "@/features/offline/components/OfflineCaptureWorkspace";
import { getOfflineIdentity } from "@/features/offline/offline-identity";
import {
  createOfflineSessionDraft,
  getMostRecentOfflineSession,
} from "@/features/offline/offline-sessions";
import { getPendingCaptures } from "@/features/offline/queue";

export function OfflineDashboard() {
  const [pendingCount, setPendingCount] = useState(0);
  const [activeSessionId, setActiveSessionId] =
    useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const identity = getOfflineIdentity();

    if (!identity) {
      return;
    }

    void getPendingCaptures(identity.userId)
      .then((records) => {
        setPendingCount(records.length);
      })
      .catch((loadError: unknown) => {
        console.warn(
          "Unable to count pending offline captures",
          loadError,
        );
      });
  }, []);

  async function startOfflineSession() {
    if (starting) {
      return;
    }

    const identity = getOfflineIdentity();

    if (!identity) {
      setError(
        "Open CRED once while online before starting a new offline session.",
      );
      return;
    }

    setStarting(true);
    setError(null);

    try {
      const session = await createOfflineSessionDraft({
        organizationId: identity.organizationId,
        userId: identity.userId,
      });

      setActiveSessionId(session.localSessionId);
    } catch (createError) {
      console.warn(
        "Unable to create offline session",
        createError,
      );
      setError(
        "CRED could not create the offline session on this device. Reload CRED and try again.",
      );
    } finally {
      setStarting(false);
    }
  }

  async function continueOfflineSession() {
    if (continuing) {
      return;
    }

    const identity = getOfflineIdentity();

    if (!identity) {
      setError(
        "Open CRED once while online before continuing an offline session.",
      );
      return;
    }

    setContinuing(true);
    setError(null);

    try {
      const session = await getMostRecentOfflineSession(
        identity.userId,
      );

      if (!session) {
        setError(
          "No unfinished offline session is saved on this device.",
        );
        return;
      }

      setActiveSessionId(session.localSessionId);
    } catch (loadError) {
      console.warn(
        "Unable to open offline session",
        loadError,
      );
      setError(
        "CRED could not open the saved offline session on this device.",
      );
    } finally {
      setContinuing(false);
    }
  }

  if (activeSessionId) {
    return (
      <OfflineCaptureWorkspace
        forcedLocalSessionId={activeSessionId}
      />
    );
  }

  return (
    <main className="page-shell dashboard-shell">
      <section className="card detail-card form-stack">
        <p className="eyebrow">Offline mode</p>
        <h1>Offline Dashboard</h1>

        <p className="muted">
          Start a new inspection or continue saved captures.
          CRED will sync automatically when your connection
          returns.
        </p>

        {error ? <p className="error">{error}</p> : null}

        <div className="button-row">
          <button
            className="button button-primary touch-target"
            type="button"
            disabled={starting || continuing}
            onClick={() => void startOfflineSession()}
          >
            {starting
              ? "Creating session…"
              : "New Offline Session"}
          </button>

          <button
            className="button button-secondary touch-target"
            type="button"
            disabled={starting || continuing}
            onClick={() => void continueOfflineSession()}
          >
            {continuing
              ? "Opening session…"
              : "Continue Offline Session"}
          </button>
        </div>

        <p className="muted">
          {pendingCount} pending upload
          {pendingCount === 1 ? "" : "s"}
        </p>
      </section>
    </main>
  );
}
