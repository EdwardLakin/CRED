export const OFFLINE_DOCUMENT_PATH = '/offline.html';

export const OFFLINE_DOCUMENT_HTML = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0f172a">
<title>CRED Offline</title>
<link rel="stylesheet" href="/offline/offline-shell.css">
</head>
<body>
<main class="shell">
  <section class="card" id="dashboard">
    <p class="eyebrow">CRED offline shell</p>
    <h1>Offline Dashboard</h1>
    <p class="muted" id="provisioning">Checking this device…</p>
    <p class="tiny muted" id="version">Service worker: checking…</p>
    <div id="offlineReady" class="card" aria-live="polite">Checking offline readiness…</div>
    <div id="support"></div>
    <p id="message"></p>
    <div class="button-row"><button id="newSession">Start New Session</button><button id="syncAll" class="secondary">Prepare All Reachable Sessions</button></div>
    <section class="session-list" id="sessions"></section>
  </section>
  <section id="workspace" class="hidden"></section>
</main>
<script type="module" src="/offline/offline-shell.js"></script>
</body>
</html>
`;
