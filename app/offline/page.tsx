export default function OfflinePage() {
  return (
    <main className="centered-page offline-page">
      <section className="card offline-card" aria-labelledby="offline-title">
        <div className="empty-icon" aria-hidden="true">
          ⛔
        </div>
        <h1 id="offline-title">You’re offline.</h1>
        <p>Previously loaded inspections remain available.</p>
        <p>Reconnect to sync new data.</p>
      </section>
    </main>
  )
}
