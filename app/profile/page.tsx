'use client'
import { useEffect, useState } from 'react'
import { Link } from 'next-view-transitions'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslations } from 'next-intl'
import { LOCALES, useAppLocale, type Locale } from '@/components/LocaleProvider'
import { db, PROFILE_ID } from '@/lib/db'
import { FEED_DEFAULT_COUNT, getFeedCount, setFeedCount } from '@/lib/feed'
import { ACHIEVEMENTS } from '@/lib/scoring'
import { isSupabaseConfigured, getUserEmail, runSync, signInWithGoogle, signOut } from '@/lib/supabase'

type SyncState = 'idle' | 'syncing' | 'ok' | 'offline' | 'signed_out' | 'error'

const FEED_COUNT_OPTIONS = [0, 3, 5, 10] as const

const LOCALE_LABELS: Record<Locale, string> = { sk: 'Slovenčina', ru: 'Русский', en: 'English' }

export default function ProfilePage() {
  const t = useTranslations('profile')
  const { locale, setLocale } = useAppLocale()
  const profile = useLiveQuery(() => db.profile.get(PROFILE_ID), [])
  const [email, setEmail] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [theme, setTheme] = useState<string>('light')
  const [feedCount, setFeedCountState] = useState<number>(FEED_DEFAULT_COUNT)

  useEffect(() => {
    getUserEmail().then(setEmail)
    setTheme(localStorage.getItem('theme') ?? 'light')
    getFeedCount().then(setFeedCountState)
  }, [])

  async function applyFeedCount(n: number) {
    setFeedCountState(n)
    await setFeedCount(n)
  }

  function applyTheme(t: string) {
    setTheme(t)
    localStorage.setItem('theme', t)
    document.documentElement.dataset.theme = t
  }

  async function doSync() {
    setSyncState('syncing')
    setSyncState(await runSync())
  }

  const unlocked = profile?.achievements ?? {}
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length

  return (
    <div>
      <h1 className="serif" style={{ fontSize: 28 }}>{t('title')}</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24 }}>
          <div><div className="serif" style={{ fontSize: 28 }}>{profile?.total_points ?? 0}</div><div style={{ color: 'var(--muted)', fontSize: 13 }}>{t('pointsLabel', { count: profile?.total_points ?? 0 })}</div></div>
          <div><div className="serif" style={{ fontSize: 28 }}>{profile?.current_streak ?? 0}</div><div style={{ color: 'var(--muted)', fontSize: 13 }}>{t('streakLabel', { count: profile?.current_streak ?? 0 })}</div></div>
          <div><div className="serif" style={{ fontSize: 28 }}>{profile?.best_streak ?? 0}</div><div style={{ color: 'var(--muted)', fontSize: 13 }}>{t('bestLabel')}</div></div>
        </div>
      </div>

      <Link href="/achievements" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <span style={{ fontWeight: 600 }}>{t('achievements')}</span>
          <span style={{ color: 'var(--muted)' }}>{unlockedCount} / {ACHIEVEMENTS.length} →</span>
        </div>
      </Link>

      <h2 style={{ fontSize: 16 }}>{t('sync')}</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        {!isSupabaseConfigured() && <p style={{ color: 'var(--muted)', margin: 0 }}>{t('notConfigured')}</p>}
        {isSupabaseConfigured() && !email && <button className="btn btn-primary" onClick={signInWithGoogle}>{t('signIn')}</button>}
        {email && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14 }}>{email}</span>
            <button className="btn" onClick={doSync} disabled={syncState === 'syncing'}>
              {syncState === 'syncing' ? t('syncing') : t('syncNow')}
            </button>
            <button className="btn" onClick={() => signOut().then(() => setEmail(null))}>{t('signOut')}</button>
            {syncState === 'ok' && <span style={{ color: 'var(--accent)', fontSize: 13 }}>{t('syncOk')}</span>}
            {(syncState === 'offline' || syncState === 'error') && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{syncState === 'offline' ? t('syncOffline') : t('syncError')}</span>}
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 16 }}>{t('language')}</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {LOCALES.map((l) => (
          <button key={l} className="btn" style={locale === l ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : {}}
            onClick={() => setLocale(l)}>
            {LOCALE_LABELS[l]}
          </button>
        ))}
      </div>

      <h2 style={{ fontSize: 16 }}>{t('appearance')}</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['light', 'dark'] as const).map((th) => (
          <button key={th} className="btn" style={theme === th ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : {}}
            onClick={() => applyTheme(th)}>
            {th === 'light' ? t('light') : t('dark')}
          </button>
        ))}
      </div>

      <h2 style={{ fontSize: 16 }}>{t('feed')}</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        {FEED_COUNT_OPTIONS.map((n) => (
          <button key={n} className="btn" style={feedCount === n ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : {}}
            onClick={() => applyFeedCount(n)}>
            {n === 0 ? t('feedOff') : n}
          </button>
        ))}
      </div>
    </div>
  )
}
