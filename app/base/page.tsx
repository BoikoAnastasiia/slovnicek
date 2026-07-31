'use client'
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { matchesQuery } from '@/lib/text'
import { maturityOf } from '@/lib/fsrs'
import type { WordRow } from '@/lib/types'
import WordSheet from '@/components/WordSheet'

const TIER_DOT = { new: 'var(--muted)', learning: 'var(--accent)', mature: 'gold' } as const

export default function BasePage() {
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const words = useLiveQuery(
    () => db.words.filter((w) => !w.deleted_at).reverse().sortBy('created_at'),
    [], [] as WordRow[],
  )
  const allTags = useMemo(() => [...new Set(words.flatMap((w) => w.tags))].sort(), [words])
  const visible = words.filter((w) => matchesQuery(w, query) && (!activeTag || w.tags.includes(activeTag)))
  const open = words.find((w) => w.id === openId)

  return (
    <div>
      <h1 className="serif" style={{ fontSize: 28 }}>Slová <span style={{ color: 'var(--muted)', fontSize: 16 }}>({words.length})</span></h1>
      <input placeholder="Hľadať…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
          {allTags.map((t) => (
            <button
              key={t}
              className="btn"
              style={{ padding: '4px 12px', fontSize: 13, ...(activeTag === t ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)' } : {}) }}
              onClick={() => setActiveTag(activeTag === t ? null : t)}
            >
              #{t}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {visible.map((w) => (
          <button key={w.id} className="card" onClick={() => setOpenId(w.id)}
            style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '14px 16px' }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: TIER_DOT[maturityOf(w)], flexShrink: 0 }} />
            <span className="serif" style={{ fontSize: 18 }}>{w.slovak}</span>
            <span style={{ color: 'var(--muted)', marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {w.translation_ru || w.definition_sk}
            </span>
          </button>
        ))}
        {visible.length === 0 && <p style={{ color: 'var(--muted)' }}>Žiadne slová.</p>}
      </div>
      {open && <WordSheet word={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}
