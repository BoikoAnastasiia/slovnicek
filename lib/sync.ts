import type { Table } from 'dexie'
import { db } from './db'

export interface SyncTransport {
  push(table: string, rows: Record<string, unknown>[]): Promise<void>
  pull(table: string, since: string): Promise<Record<string, unknown>[]>
}

const EPOCH = '1970-01-01T00:00:00.000Z'

export async function getWatermark(table: string): Promise<string> {
  const row = await db.meta.get(`watermark:${table}`)
  return (row?.value as string) ?? EPOCH
}

async function syncTable(table: Table<any, string>, name: string, transport: SyncTransport): Promise<void> {
  const dirty = await table.where('dirty').equals(1).toArray()
  if (dirty.length > 0) {
    await transport.push(name, dirty.map(stripLocal))
    await table.where('id').anyOf(dirty.map((r) => r.id)).modify({ dirty: 0 })
  }
  const since = await getWatermark(name)
  const remote = await transport.pull(name, since)
  let watermark = since
  for (const raw of remote) {
    const row = raw as { id: string; updated_at: string }
    if (row.updated_at > watermark) watermark = row.updated_at
    const local = await table.get(row.id)
    if (!local || row.updated_at > local.updated_at) {
      const { user_id: _drop, ...rest } = raw as Record<string, unknown>
      await table.put({ ...rest, dirty: 0 })
    }
  }
  if (watermark !== since) await db.meta.put({ key: `watermark:${name}`, value: watermark })
}

function stripLocal(row: Record<string, unknown>): Record<string, unknown> {
  const { dirty: _drop, ...rest } = row
  return rest
}

export async function syncAll(transport: SyncTransport): Promise<void> {
  await syncTable(db.words, 'words', transport)
  await syncTable(db.review_logs, 'review_logs', transport)
  await syncTable(db.profile, 'profile', transport)
}
