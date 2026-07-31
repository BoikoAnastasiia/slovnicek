import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, getProfile, newWord, saveWord, softDeleteWord, PROFILE_ID } from '@/lib/db'

beforeEach(async () => {
  await Promise.all([db.words.clear(), db.review_logs.clear(), db.profile.clear(), db.meta.clear()])
})

describe('newWord', () => {
  it('fills defaults, fresh FSRS card, dirty=1', () => {
    const w = newWord({ slovak: 'kniha', translation_ru: 'книга' })
    expect(w.id).toMatch(/[0-9a-f-]{36}/)
    expect(w.tags).toEqual([])
    expect(w.prompt_mode).toBe('auto')
    expect(w.fsrs.state).toBe(0)
    expect(w.due).toBe(w.fsrs.due)
    expect(w.dirty).toBe(1)
  })
})

describe('word persistence', () => {
  it('saveWord bumps updated_at and marks dirty', async () => {
    const w = { ...newWord({ slovak: 'kniha' }), dirty: 0, updated_at: '2020-01-01T00:00:00.000Z' }
    await saveWord(w)
    const stored = (await db.words.get(w.id))!
    expect(stored.dirty).toBe(1)
    expect(stored.updated_at > '2020-01-01T00:00:00.000Z').toBe(true)
  })
  it('softDeleteWord sets deleted_at and dirty', async () => {
    const w = newWord({ slovak: 'kniha' })
    await db.words.put(w)
    await softDeleteWord(w.id)
    const stored = (await db.words.get(w.id))!
    expect(stored.deleted_at).not.toBeNull()
    expect(stored.dirty).toBe(1)
  })
})

describe('getProfile', () => {
  it('creates a singleton profile on first call and reuses it', async () => {
    const p1 = await getProfile()
    expect(p1.id).toBe(PROFILE_ID)
    expect(p1.total_points).toBe(0)
    await db.profile.update(PROFILE_ID, { total_points: 50 })
    const p2 = await getProfile()
    expect(p2.total_points).toBe(50)
  })
})
