import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter } from 'next/font/google'
import { ViewTransitions } from 'next-view-transitions'
import Nav from '@/components/Nav'
import SyncBootstrap from '@/components/SyncBootstrap'
import LocaleProvider from '@/components/LocaleProvider'
import './globals.css'

const fraunces = Fraunces({ subsets: ['latin', 'latin-ext'], variable: '--font-fraunces' })
const inter = Inter({ subsets: ['latin', 'latin-ext', 'cyrillic'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Slovníček',
  description: 'Personal Slovak vocabulary trainer',
  manifest: '/manifest.webmanifest',
  other: { google: 'notranslate' },
}
export const viewport: Viewport = { themeColor: '#2b7de9' }

const themeInit = `try{const t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch{}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransitions>
      <html lang="sk" translate="no" className={`${fraunces.variable} ${inter.variable}`} suppressHydrationWarning>
        {/* suppress: extensions like Grammarly inject body attributes before hydration */}
        <body suppressHydrationWarning>
          <script dangerouslySetInnerHTML={{ __html: themeInit }} />
          <LocaleProvider>
            <SyncBootstrap />
            <main className="app-main">{children}</main>
            <Nav />
          </LocaleProvider>
        </body>
      </html>
    </ViewTransitions>
  )
}
