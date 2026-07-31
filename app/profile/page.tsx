'use client'
import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, nowIso, PROFILE_ID } from '@/lib/db'
import { FEED_DEFAULT_COUNT, getFeedCount, setFeedCount } from '@/lib/feed'
import { plural } from '@/lib/plural'
import { ACHIEVEMENTS } from '@/lib/scoring'
import { getSupabase, getUserEmail, runSync, signInWithGoogle, signOut } from '@/lib/supabase'
import type { ProfileRow, ReviewLogRow, WordRow } from '@/lib/types'

type SyncState = 'idle' | 'syncing' | 'ok' | 'offline' | 'signed_out' | 'error'

const FEED_COUNT_OPTIONS = [0, 3, 5, 10] as const

export default function ProfilePage() {
  const profile = useLiveQuery(() => db.profile.get(PROFILE_ID), [])
  const [email, setEmail] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [theme, setTheme] = useState<string>('system')
  const [feedCount, setFeedCountState] = useState<number>(FEED_DEFAULT_COUNT)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getUserEmail().then(setEmail)
    setTheme(localStorage.getItem('theme') ?? 'system')
    getFeedCount().then(setFeedCountState)
  }, [])

  async function applyFeedCount(n: number) {
    setFeedCountState(n)
    await setFeedCount(n)
  }

  function applyTheme(t: string) {
    setTheme(t)
    if (t === 'system') {
      localStorage.removeItem('theme')
      delete document.documentElement.dataset.theme
    } else {
      localStorage.setItem('theme', t)
      document.documentElement.dataset.theme = t
    }
  }

  async function doSync() {
    setSyncState('syncing')
    setSyncState(await runSync())
  }

  async function exportJson() {
    const payload = {
      exported_at: nowIso(),
      words: await db.words.toArray(),
      review_logs: await db.review_logs.toArray(),
      profile: await db.profile.toArray(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `slovnicek-backup-${payload.exported_at.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importJson(file: File) {
    const data = JSON.parse(await file.text()) as { words?: WordRow[]; review_logs?: ReviewLogRow[]; profile?: ProfileRow[] }
    const lww = async <T extends { id: string; updated_at: string }>(table: typeof db.words | typeof db.review_logs | typeof db.profile, rows: T[]) => {
      for (const row of rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const local = await (table as any).get(row.id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!local || row.updated_at > local.updated_at) await (table as any).put({ ...row, dirty: 1 })
      }
    }
    await lww(db.words, data.words ?? [])
    await lww(db.review_logs, data.review_logs ?? [])
    await lww(db.profile, data.profile ?? [])
    alert('Import hotový')
  }

  const unlocked = profile?.achievements ?? {}

  return (
    <div>
      <h1 className="serif" style={{ fontSize: 28 }}>Profil</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24 }}>
          <div><div className="serif" style={{ fontSize: 28 }}>{profile?.total_points ?? 0}</div><div style={{ color: 'var(--muted)', fontSize: 13 }}>{plural(profile?.total_points ?? 0, ['bod', 'body', 'bodov'])}</div></div>
          <div><div className="serif" style={{ fontSize: 28 }}>{profile?.current_streak ?? 0}</div><div style={{ color: 'var(--muted)', fontSize: 13 }}>séria {plural(profile?.current_streak ?? 0, ['deň', 'dni', 'dní'])}</div></div>
          <div><div className="serif" style={{ fontSize: 28 }}>{profile?.best_streak ?? 0}</div><div style={{ color: 'var(--muted)', fontSize: 13 }}>najlepšia</div></div>
        </div>
      </div>

      <h2 style={{ fontSize: 16 }}>Úspechy</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {ACHIEVEMENTS.map((a) => (
          <div key={a.id} className="card" style={{ padding: 12, opacity: unlocked[a.id] ? 1 : 0.45 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{unlocked[a.id] ? '🏅' : '🔒'} {a.title}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.description}</div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 16 }}>Synchronizácia</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        {!getSupabase() && <p style={{ color: 'var(--muted)', margin: 0 }}>Supabase nie je nakonfigurovaný (.env.local).</p>}
        {getSupabase() && !email && <button className="btn btn-primary" onClick={signInWithGoogle}>Prihlásiť cez Google</button>}
        {email && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14 }}>{email}</span>
            <button className="btn" onClick={doSync} disabled={syncState === 'syncing'}>
              {syncState === 'syncing' ? 'Synchronizujem…' : 'Synchronizovať'}
            </button>
            <button className="btn" onClick={() => signOut().then(() => setEmail(null))}>Odhlásiť</button>
            {syncState === 'ok' && <span style={{ color: 'var(--accent)', fontSize: 13 }}>✓ hotovo</span>}
            {(syncState === 'offline' || syncState === 'error') && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{syncState === 'offline' ? 'offline' : 'chyba'}</span>}
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 16 }}>Záloha</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className="btn" onClick={exportJson}>Export JSON</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import JSON</button>
        <input ref={fileRef} type="file" accept="application/json" hidden
          onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
      </div>

      <h2 style={{ fontSize: 16 }}>Vzhľad</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['light', 'system', 'dark'] as const).map((t) => (
          <button key={t} className="btn" style={theme === t ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : {}}
            onClick={() => applyTheme(t)}>
            {t === 'light' ? 'Svetlý' : t === 'dark' ? 'Tmavý' : 'Systém'}
          </button>
        ))}
      </div>

      <h2 style={{ fontSize: 16 }}>Denný prísun</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        {FEED_COUNT_OPTIONS.map((n) => (
          <button key={n} className="btn" style={feedCount === n ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : {}}
            onClick={() => applyFeedCount(n)}>
            {n === 0 ? 'Vypnutý' : n}
          </button>
        ))}
      </div>
    </div>
  )
}
