import 'fake-indexeddb/auto'
import { liveQuery } from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, getProfile, newWord, saveWord, softDeleteWord, uuid, PROFILE_ID } from '@/lib/db'

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

describe('liveQuery read-only constraint (regression)', () => {
  // Pins the bug that crashed the app: getProfile() performs a db.profile.put()
  // write when the profile row is missing. Dexie forbids writes inside a
  // liveQuery observer ("Readwrite transaction in liveQuery context"), which
  // surfaced as an unhandled rejection and crashed app/page.tsx and
  // app/profile/page.tsx on first load. The fix is to read via
  // db.profile.get(PROFILE_ID) inside useLiveQuery instead of getProfile().
  it('liveQuery(() => db.profile.get(PROFILE_ID)) emits undefined without error on an empty db', async () => {
    const emitted: (unknown | undefined)[] = []
    const errors: unknown[] = []
    await new Promise<void>((resolve) => {
      const sub = liveQuery(() => db.profile.get(PROFILE_ID)).subscribe({
        next: (v) => { emitted.push(v); sub.unsubscribe(); resolve() },
        error: (e) => { errors.push(e); sub.unsubscribe(); resolve() },
      })
    })
    expect(errors).toEqual([])
    expect(emitted).toEqual([undefined])
  })

  it('liveQuery(() => getProfile()) rejects with a Dexie error on an empty db', async () => {
    const errors: unknown[] = []
    const emitted: unknown[] = []
    await new Promise<void>((resolve) => {
      const sub = liveQuery(() => getProfile()).subscribe({
        next: (v) => { emitted.push(v); sub.unsubscribe(); resolve() },
        error: (e) => { errors.push(e); sub.unsubscribe(); resolve() },
      })
    })
    expect(emitted).toEqual([])
    expect(errors.length).toBe(1)
    expect(String((errors[0] as Error).message ?? errors[0])).toMatch(/Readwrite transaction in liveQuery context/i)
  })
})

describe('uuid', () => {
  it('produces v4-format ids with and without crypto.randomUUID (insecure contexts)', () => {
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    expect(uuid()).toMatch(re)
    const orig = crypto.randomUUID
    // simulate an insecure context where randomUUID is missing
    ;(crypto as { randomUUID?: unknown }).randomUUID = undefined
    expect(uuid()).toMatch(re)
    ;(crypto as { randomUUID?: unknown }).randomUUID = orig
  })
})
