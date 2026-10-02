import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import { ServiceWorker } from '@/components/ServiceWorker'
import './globals.css'

const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-sans', display: 'swap' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'EDU-Tracker', template: '%s, EDU-Tracker' },
  description: 'Study timer, sessions, goals and stats.',
  applicationName: 'EDU-Tracker',
  appleWebApp: { capable: true, title: 'EDU-Tracker', statusBarStyle: 'black' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: '#0C0C0C',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  )
}
