# Offline Home Screen install on iOS/iPadOS

Use the dedicated offline entry point when installing CRED on iPhone or iPad. iOS/iPadOS can relaunch the exact page that was added to the Home Screen, so adding Dashboard or `/` can bypass the service worker during a cold offline launch.

## Manual iPad test steps

1. Sign in online.
2. Open Dashboard once to provision identity on the device.
3. Tap **Set up offline Home Screen app**.
4. Confirm `/offline.html` says **Offline ready on this device**.
5. Use **Share → Add to Home Screen** from that `/offline.html` page.
6. Launch the Home Screen app once while online.
7. Close the app, enable Airplane Mode, and relaunch it.
8. Confirm the Offline Dashboard loads.

Android and Chromium PWA installs can still use the browser install prompt. The dedicated `/offline.html` path is safe there too and keeps the same service-worker-backed offline shell.
