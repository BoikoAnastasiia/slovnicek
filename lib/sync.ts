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

const TIMESTAMP_FIELDS = ['updated_at', 'created_at', 'deleted_at'] as const

// PostgREST may return timestamps as '+00:00' with trimmed/expanded fractional
// seconds, while local rows are always stored as 'Z'-suffixed ISO strings.
// Normalize so string LWW comparisons aren't format-dependent.
function normalizeTimestamps(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row }
  for (const field of TIMESTAMP_FIELDS) {
    const value = out[field]
    if (typeof value === 'string') out[field] = new Date(value).toISOString()
  }
  return out
}

function stripLocal(row: Record<string, unknown>): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { dirty: _drop, ...rest } = row
  return rest
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncTable(table: Table<any, string>, name: string, transport: SyncTransport): Promise<void> {
  // Pull first: a newer remote row must win over a stale local edit (including
  // a dirty one) before we decide what still needs pushing. Pushing first
  // would let an older offline edit clobber a newer server-side edit, with no
  // way for the pull step to recover it afterwards.
  const since = await getWatermark(name)
  const remote = await transport.pull(name, since)
  let watermark = since
  for (const raw of remote) {
    const row = normalizeTimestamps(raw as Record<string, unknown>) as { id: string; updated_at: string }
    if (row.updated_at > watermark) watermark = row.updated_at
    const local = await table.get(row.id)
    if (!local || row.updated_at > local.updated_at) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { user_id: _drop, ...rest } = row as Record<string, unknown>
      await table.put({ ...rest, dirty: 0 })
    }
  }
  if (watermark !== since) await db.meta.put({ key: `watermark:${name}`, value: watermark })

  // Re-query dirty rows AFTER the pull: a row that just lost to a newer
  // remote update is no longer dirty and must not be pushed.
  const dirty = await table.where('dirty').equals(1).toArray()
  if (dirty.length > 0) {
    await transport.push(name, dirty.map(stripLocal))
    await table.where('id').anyOf(dirty.map((r) => r.id)).modify({ dirty: 0 })
  }
}

export async function syncAll(transport: SyncTransport): Promise<void> {
  await syncTable(db.words, 'words', transport)
  await syncTable(db.review_logs, 'review_logs', transport)
  await syncTable(db.profile, 'profile', transport)
}
