import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="page-shell">
      <section className="card form-stack">
        <p className="eyebrow">Offline mode</p>
        <h1>You&apos;re offline</h1>
        <p className="muted">
          Previously loaded sessions can remain available for capture. New captures will be saved on this device and
          synced automatically after your connection returns.
        </p>
        <p className="muted">
          Reconnect before generating reports, exporting PDFs, or loading sessions that have not been opened on this
          device yet.
        </p>
        <Link className="button button-primary" href="/dashboard">
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
