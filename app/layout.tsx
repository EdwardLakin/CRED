import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { ThemeProvider } from '@/components/theme'

import './globals.css'

export const metadata: Metadata = {
  title: 'CRED',
  description: 'AI inspection documentation for service businesses.',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
