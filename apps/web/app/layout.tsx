import type { Metadata, Viewport } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import Script from 'next/script'

export const metadata: Metadata = {
  title: { default: 'CAI — Signal Intelligence', template: '%s | CAI' },
  description: 'Trade signal intelligence dashboard for Indian markets',
  appleWebApp: { capable: true, title: 'CAI', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  themeColor: '#818cf8',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg-primary text-slate-200 antialiased">
        <Sidebar />
        <main className="ml-[240px] min-h-screen">
          <div className="max-w-[1400px] p-6 animate-fadeIn">
            {children}
          </div>
        </main>
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
          }
        `}</Script>
      </body>
    </html>
  )
}
