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
})
