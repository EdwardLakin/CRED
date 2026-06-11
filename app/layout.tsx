import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { InstallPrompt } from '@/components/pwa'
import { ThemeProvider } from '@/components/theme'

import './globals.css'

export const metadata: Metadata = {
  title: 'CRED by ProFixIQ',
  description: 'Capture, Review, Extract, Document',
  manifest: '/manifest.json',
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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {children}
          <InstallPrompt />
        </ThemeProvider>
      </body>
    </html>
  )
}
