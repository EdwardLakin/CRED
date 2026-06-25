import { Suspense } from "react";

import { OfflineCaptureWorkspace } from "@/features/offline/components/OfflineCaptureWorkspace";

export default function OfflineCapturePage() {
  return (
    <Suspense
      fallback={
        <main className="page-shell">
          <section className="card form-stack">
            <p className="eyebrow">Offline capture</p>
            <h1>Opening local workspace…</h1>
          </section>
        </main>
      }
    >
      <OfflineCaptureWorkspace />
    </Suspense>
  );
}
