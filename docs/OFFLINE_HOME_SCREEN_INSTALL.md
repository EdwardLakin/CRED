# Offline Home Screen install on iOS/iPadOS

Use the dedicated offline entry point when installing CRED on iPhone or iPad. iOS/iPadOS can relaunch the exact page that was added to the Home Screen, so adding Dashboard or `/` can bypass the service worker during a cold offline launch.

## Manual iPad test steps

1. Install the Home Screen app from `/offline.html` with **Share → Add to Home Screen**.
2. Launch the Home Screen app while online.
3. Tap **Sign in and provision this device**.
4. Sign in.
5. Reach Dashboard and allow the offline bootstrap to persist offline identity.
6. Return to the offline shell at `/offline.html`.
7. Go offline, such as by enabling Airplane Mode.
8. Launch the Home Screen app.
9. Confirm the Offline Dashboard works and local sessions/captures are available.

Android and Chromium PWA installs can still use the browser install prompt. The dedicated `/offline.html` path is safe there too and keeps the same service-worker-backed offline shell.
