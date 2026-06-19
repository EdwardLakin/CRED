import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  experimental: {
    serverActions: {
      bodySizeLimit: '32mb',
    },
  },
}

export default nextConfig
