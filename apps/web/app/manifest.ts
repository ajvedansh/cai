import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CAI — Channel AI Intelligence',
    short_name: 'CAI',
    description: 'Trade signal intelligence dashboard for Indian markets',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d0f14',
    theme_color: '#818cf8',
    orientation: 'portrait-primary',
    icons: [
      { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'maskable' },
      { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Trade Calls', url: '/trade-calls', description: 'View active trade calls' },
      { name: 'Review Queue', url: '/review', description: 'Review pending signals' },
      { name: 'Signal Tester', url: '/tester', description: 'Test signal parsing' },
    ],
  }
}
