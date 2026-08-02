'use client'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslations } from 'next-intl'
import { db, PROFILE_ID } from '@/lib/db'
import { ACHIEVEMENTS } from '@/lib/scoring'

export default function AchievementsPage() {
  const t = useTranslations('achievementsPage')
  const ta = useTranslations('achievements')
  const profile = useLiveQuery(() => db.profile.get(PROFILE_ID), [])
  const unlocked = profile?.achievements ?? {}
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length

  return (
    <div>
      <h1 className="serif" style={{ fontSize: 28 }}>{t('title')}</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 16px' }}>
        {t('unlockedOf', { count: unlockedCount, total: ACHIEVEMENTS.length })}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {ACHIEVEMENTS.map((a) => (
          <div key={a.id} className="card" style={{ padding: 12, opacity: unlocked[a.id] ? 1 : 0.45 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{unlocked[a.id] ? '🏅' : '🔒'} {ta(`${a.id}.title`)}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ta(`${a.id}.description`)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
