'use client'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, PROFILE_ID } from '@/lib/db'
import { ACHIEVEMENTS } from '@/lib/scoring'

export default function AchievementsPage() {
  const profile = useLiveQuery(() => db.profile.get(PROFILE_ID), [])
  const unlocked = profile?.achievements ?? {}
  const unlockedCount = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length

  return (
    <div>
      <h1 className="serif" style={{ fontSize: 28 }}>Úspechy</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 16px' }}>
        {unlockedCount} / {ACHIEVEMENTS.length} odomknutých
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {ACHIEVEMENTS.map((a) => (
          <div key={a.id} className="card" style={{ padding: 12, opacity: unlocked[a.id] ? 1 : 0.45 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{unlocked[a.id] ? '🏅' : '🔒'} {a.title}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.description}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
