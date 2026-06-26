'use client'

import { useEffect, useMemo, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISSED_KEY = 'cred-pwa-install-dismissed'

function isIosSafari() {
  const userAgent = window.navigator.userAgent
  const platform = window.navigator.platform
  const isAppleTouchDevice = /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(userAgent)

  return isAppleTouchDevice && isSafari
}

function isStandaloneDisplay() {
  return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

function isDismissed() {
  return window.localStorage.getItem(DISMISSED_KEY) === 'true'
}

export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const canInstall = Boolean(installEvent)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        })
        .then(async (registration) => {
          await registration.update()

          if (registration.waiting) {
            registration.waiting.postMessage({
              type: 'SKIP_WAITING',
            })
          }

          navigator.serviceWorker.ready
            .then((readyRegistration) => {
              const channel = new MessageChannel()
              channel.port1.onmessage = (event) => {
                console.info('CRED offline shell diagnostics', event.data)
              }
              readyRegistration.active?.postMessage(
                { type: 'CRED_SW_DIAGNOSTICS' },
                [channel.port2],
              )
            })
            .catch(() => {})
        })
        .catch((error: unknown) => {
          console.warn(
            'CRED service worker registration failed',
            error,
          )
        })

      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          document.documentElement.dataset.offlineShell =
            'ready'
        },
      )
    }

    const updateStandaloneState = () => {
      const nextStandalone = isStandaloneDisplay()
      setIsStandalone(nextStandalone)
      document.documentElement.dataset.displayMode = nextStandalone ? 'standalone' : 'browser'
    }

    const standaloneQuery = window.matchMedia('(display-mode: standalone)')
    const fullscreenQuery = window.matchMedia('(display-mode: fullscreen)')

    const timerId = window.setTimeout(() => {
      setIsIOS(isIosSafari())
      updateStandaloneState()
      setIsVisible(!isDismissed())
    }, 0)

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
      setIsVisible(!isDismissed())
    }

    const handleAppInstalled = () => {
      setInstallEvent(null)
      setIsStandalone(true)
      setIsVisible(false)
      window.localStorage.setItem(DISMISSED_KEY, 'true')
      document.documentElement.dataset.displayMode = 'standalone'
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    standaloneQuery.addEventListener('change', updateStandaloneState)
    fullscreenQuery.addEventListener('change', updateStandaloneState)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      standaloneQuery.removeEventListener('change', updateStandaloneState)
      fullscreenQuery.removeEventListener('change', updateStandaloneState)
      window.clearTimeout(timerId)
    }
  }, [])

  const installLabel = useMemo(() => {
    if (canInstall) {
      return 'Install CRED'
    }

    return 'Add CRED to Home Screen'
  }, [canInstall])

  async function handleInstall() {
    if (!installEvent) {
      return
    }

    await installEvent.prompt()
    const choice = await installEvent.userChoice

    if (choice.outcome === 'accepted') {
      window.localStorage.setItem(DISMISSED_KEY, 'true')
      setIsVisible(false)
    }

    setInstallEvent(null)
  }

  function handleDismiss() {
    window.localStorage.setItem(DISMISSED_KEY, 'true')
    setIsVisible(false)
  }

  if (isStandalone || !isVisible || (!canInstall && !isIOS)) {
    return null
  }

  return (
    <aside className="pwa-install-prompt browser-only" aria-label="Install CRED app">
      <div>
        <strong>{installLabel}</strong>
        <p>
          {isIOS
            ? 'On iPhone or iPad, use Share → Add to Home Screen to launch CRED full screen without Safari chrome.'
            : 'Install CRED from your browser for a native app experience on this device.'}
        </p>
      </div>
      <div className="pwa-install-actions">
        {canInstall ? (
          <button type="button" className="button button-primary" onClick={handleInstall}>
            Install
          </button>
        ) : null}
        <button type="button" className="button button-secondary" onClick={handleDismiss}>
          Dismiss
        </button>
      </div>
    </aside>
  )
}
