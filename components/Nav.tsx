'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: 'Dnes' },
  { href: '/base', label: 'Slová' },
  { href: '/add', label: '+ Pridať' },
  { href: '/profile', label: 'Profil' },
]

export default function Nav() {
  const pathname = usePathname()
  return (
    <nav className="nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''}>
          {l.label}
        </Link>
      ))}
    </nav>
  )
}
