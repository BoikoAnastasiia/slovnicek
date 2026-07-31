import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, newWord } from '@/lib/db'
import { getWatermark, syncAll, type SyncTransport } from '@/lib/sync'

function fakeTransport(remote: Record<string, Record<string, unknown>[]>) {
  const pushed: Record<string, Record<string, unknown>[]> = { words: [], review_logs: [], profile: [] }
  const transport: SyncTransport = {
    async push(table, rows) { pushed[table].push(...rows) },
    async pull(table, since) {
      return (remote[table] ?? []).filter((r) => (r.updated_at as string) > since)
    },
  }
  return { transport, pushed }
}

beforeEach(async () => {
  await Promise.all([db.words.clear(), db.review_logs.clear(), db.profile.clear(), db.meta.clear()])
})

describe('syncAll', () => {
  it('pushes dirty rows without the dirty field, then clears the flag', async () => {
    const w = newWord({ slovak: 'kniha' })
    await db.words.put(w)
    const { transport, pushed } = fakeTransport({})
    await syncAll(transport)
    expect(pushed.words).toHaveLength(1)
    expect(pushed.words[0].id).toBe(w.id)
    expect('dirty' in pushed.words[0]).toBe(false)
    expect((await db.words.get(w.id))!.dirty).toBe(0)
  })

  it('pulls newer remote rows and applies them (LWW), skipping older ones', async () => {
    const local = { ...newWord({ slovak: 'stará verzia' }), dirty: 0, updated_at: '2026-07-30T00:00:00.000Z' }
    await db.words.put(local)
    const newer = { ...local, slovak: 'nová verzia', updated_at: '2026-07-31T00:00:00.000Z', user_id: 'u1' }
    const older = { ...newWord({ slovak: 'prehistorická' }), id: local.id, updated_at: '2026-07-01T00:00:00.000Z' }
    const { transport } = fakeTransport({ words: [older, newer] })
    await syncAll(transport)
    const stored = (await db.words.get(local.id))!
    expect(stored.slovak).toBe('nová verzia')
    expect(stored.dirty).toBe(0)
    expect('user_id' in stored).toBe(false)
  })

  it('inserts unseen remote rows and advances the watermark', async () => {
    const remote = { ...newWord({ slovak: 'vzdialené' }), dirty: 0, updated_at: '2026-07-31T12:00:00.000Z' }
    const { transport } = fakeTransport({ words: [remote] })
    await syncAll(transport)
    expect(await db.words.get(remote.id)).toBeTruthy()
    expect(await getWatermark('words')).toBe('2026-07-31T12:00:00.000Z')
    // second sync with same remote: nothing new pulled
    const second = fakeTransport({ words: [remote] })
    await syncAll(second.transport)
    expect(second.pushed.words).toHaveLength(0)
  })

  it('local dirty edit newer than remote survives a pull', async () => {
    const w = { ...newWord({ slovak: 'moja verzia' }), updated_at: '2026-07-31T10:00:00.000Z' }
    await db.words.put(w)
    const remoteOlder = { ...w, slovak: 'cudzia verzia', updated_at: '2026-07-31T09:00:00.000Z' }
    const { transport } = fakeTransport({ words: [remoteOlder] })
    await syncAll(transport)
    expect((await db.words.get(w.id))!.slovak).toBe('moja verzia')
  })

  it('pulls before pushing: an older local dirty row is overwritten by a newer remote row and is not pushed', async () => {
    const w = { ...newWord({ slovak: 'zastaraná' }), updated_at: '2026-07-31T08:00:00.000Z', dirty: 1 }
    await db.words.put(w)
    const remoteNewer = { ...w, slovak: 'aktuálna', updated_at: '2026-07-31T09:00:00.000Z', user_id: 'u1' }
    const { transport, pushed } = fakeTransport({ words: [remoteNewer] })
    await syncAll(transport)
    const stored = (await db.words.get(w.id))!
    expect(stored.slovak).toBe('aktuálna')
    expect(stored.dirty).toBe(0)
    // The row lost the race and was cleared to dirty:0 by the pull merge
    // *before* the push step ran, so it must not have been pushed at all.
    expect(pushed.words).toHaveLength(0)
  })

  it('pulls before pushing: a newer local dirty row survives the pull and is still pushed afterward', async () => {
    const w = { ...newWord({ slovak: 'moja verzia' }), updated_at: '2026-07-31T10:00:00.000Z', dirty: 1 }
    await db.words.put(w)
    const remoteOlder = { ...w, slovak: 'cudzia verzia', updated_at: '2026-07-31T09:00:00.000Z', user_id: 'u1' }
    const { transport, pushed } = fakeTransport({ words: [remoteOlder] })
    await syncAll(transport)
    const stored = (await db.words.get(w.id))!
    expect(stored.slovak).toBe('moja verzia')
    expect(stored.dirty).toBe(0)
    expect(pushed.words).toHaveLength(1)
    expect(pushed.words[0].id).toBe(w.id)
    expect(pushed.words[0].slovak).toBe('moja verzia')
  })

  it('normalizes PostgREST-style timestamps (+00:00, trimmed fractional seconds) before comparing/storing', async () => {
    const local = { ...newWord({ slovak: 'stará' }), updated_at: '2026-07-31T09:00:00.000Z', dirty: 0 }
    await db.words.put(local)
    const remote = {
      ...local,
      slovak: 'nová',
      updated_at: '2026-07-31T10:00:00+00:00',
      user_id: 'u1',
    }
    const { transport } = fakeTransport({ words: [remote] })
    // fakeTransport's pull filter does a raw string comparison against the
    // watermark; use since = EPOCH (default) so the remote row is returned.
    await syncAll(transport)
    const stored = (await db.words.get(local.id))!
    expect(stored.slovak).toBe('nová')
    expect(stored.updated_at).toBe('2026-07-31T10:00:00.000Z')
    expect(await getWatermark('words')).toBe('2026-07-31T10:00:00.000Z')
  })
})
