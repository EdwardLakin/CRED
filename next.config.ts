import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/api/dashboard/sessions/[id]/report-pdf/download': [
      './node_modules/@sparticuz/chromium/bin/**/*',
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '32mb',
    },
  },
}

export default nextConfig
