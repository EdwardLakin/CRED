import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { OfflineBanner } from '@/components/offline/OfflineBanner'
import { InstallPrompt } from '@/components/pwa'
import { ThemeProvider, type ThemeMode } from '@/components/theme'
import { OfflineProvider } from '@/features/offline/OfflineProvider'
import { createClient } from '@/lib/supabase/server'

import './globals.css'

export const metadata: Metadata = {
  title: 'CRED by ProFixIQ',
  description: 'Capture, Review, Extract, Document',
  manifest: '/manifest.webmanifest',
  applicationName: 'CRED',
  appleWebApp: {
    capable: true,
    title: 'CRED',
    statusBarStyle: 'black-translucent',
    startupImage: [
      {
        url: '/splash/cred-splash.svg',
        media: '(orientation: portrait)',
      },
    ],
  },
  icons: {
    icon: [
      { url: '/icons/cred-icon.svg', sizes: '192x192', type: 'image/svg+xml' },
      { url: '/icons/cred-icon.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'CRED',
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#155dfc' },
    { media: '(prefers-color-scheme: dark)', color: '#14213d' },
  ],
}

async function getInitialThemeMode(): Promise<ThemeMode> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return 'dark'
  }

  const { data: profile } = await supabase.from('profiles').select('theme_preference').eq('user_id', user.id).maybeSingle()

  return profile?.theme_preference ?? 'dark'
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const initialThemeMode = await getInitialThemeMode()
  const initialResolvedTheme = initialThemeMode === 'system' ? 'dark' : initialThemeMode

  return (
    <html lang="en" data-theme={initialResolvedTheme} style={{ colorScheme: initialResolvedTheme }} suppressHydrationWarning>
      <body>
        <ThemeProvider initialMode={initialThemeMode}>
          <OfflineProvider>
            <OfflineBanner />
            {children}
            <InstallPrompt />
          </OfflineProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
