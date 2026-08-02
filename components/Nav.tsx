'use client'
import { useEffect } from 'react'
import { Link } from 'next-view-transitions'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

const LINKS = [
  { href: '/', key: 'today' },
  { href: '/base', key: 'words' },
  { href: '/add', key: 'add' },
  { href: '/profile', key: 'profile' },
] as const

const TAB_ORDER = ['/', '/base', '/add', '/profile']

export default function Nav() {
  const pathname = usePathname()
  const t = useTranslations('nav')

  // Clear the direction hint once the transition it triggered has settled, so a
  // later non-Nav navigation (e.g. round summary -> /) doesn't inherit a stale
  // forward/back value and falls back to the default cross-fade as intended.
  useEffect(() => {
    const t = setTimeout(() => {
      delete document.documentElement.dataset.navDir
    }, 400)
    return () => clearTimeout(t)
  }, [pathname])

  function handleClick(targetHref: string) {
    const currentIndex = TAB_ORDER.indexOf(pathname)
    const targetIndex = TAB_ORDER.indexOf(targetHref)
    if (currentIndex === -1 || targetIndex === -1) return
    document.documentElement.dataset.navDir = targetIndex > currentIndex ? 'forward' : 'back'
  }

  return (
    <nav className="nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''} onClick={() => handleClick(l.href)}>
          {t(l.key)}
        </Link>
      ))}
    </nav>
  )
}
