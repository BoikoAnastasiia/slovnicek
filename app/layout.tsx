import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter } from 'next/font/google'
import Nav from '@/components/Nav'
import SyncBootstrap from '@/components/SyncBootstrap'
import './globals.css'

const fraunces = Fraunces({ subsets: ['latin', 'latin-ext'], variable: '--font-fraunces' })
const inter = Inter({ subsets: ['latin', 'latin-ext', 'cyrillic'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Slovníček',
  description: 'Personal Slovak vocabulary trainer',
  manifest: '/manifest.webmanifest',
}
export const viewport: Viewport = { themeColor: '#2f6f5e' }

const themeInit = `try{const t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch{}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <SyncBootstrap />
        <main className="app-main">{children}</main>
        <Nav />
      </body>
    </html>
  )
}
