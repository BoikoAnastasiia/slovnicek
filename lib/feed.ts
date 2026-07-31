import { db, newWord } from './db'
import { fold } from './text'
import type { WordRow } from './types'

export const FEED_DEFAULT_COUNT = 5

export interface BankEntry {
  rank: number
  slovak: string
  translation_ru: string
  part_of_speech: string
  gender: string
  definition_sk: string
  examples: string[]
}

const FEED_COUNT_KEY = 'feed:count'
const FEED_LAST_DATE_KEY = 'feed:last_date'

let bankCache: BankEntry[] | null = null

export async function loadBank(fetchFn: typeof fetch = fetch): Promise<BankEntry[]> {
  if (bankCache) return bankCache
  try {
    const res = await fetchFn('/wordbank.json')
    if (!res.ok) return []
    const data = (await res.json()) as BankEntry[]
    bankCache = data
    return data
  } catch {
    return []
  }
}

export async function getFeedCount(): Promise<number> {
  const row = await db.meta.get(FEED_COUNT_KEY)
  return typeof row?.value === 'number' ? row.value : FEED_DEFAULT_COUNT
}

export async function setFeedCount(n: number): Promise<void> {
  await db.meta.put({ key: FEED_COUNT_KEY, value: n })
}

function rankBand(rank: number): string {
  return rank <= 500 ? 'top500' : rank <= 1000 ? 'top1000' : 'top2000'
}

export async function introduceDailyWords(bank: BankEntry[], today: string): Promise<WordRow[]> {
  // The whole check-then-act sequence runs inside one readwrite transaction so
  // that two overlapping calls (e.g. React strict-mode's synchronous
  // mount/unmount/remount, each kicking off its own async chain) serialize
  // instead of racing: IndexedDB queues concurrent 'rw' transactions on the
  // same stores, so the second call only starts once the first has committed
  // 'feed:last_date' and will see it already equal to `today`.
  return db.transaction('rw', db.words, db.meta, async () => {
    const lastDate = await db.meta.get(FEED_LAST_DATE_KEY)
    if (lastDate?.value === today) return []

    const count = await getFeedCount()
    if (count === 0 || bank.length === 0) return []

    const existing = await db.words.toArray() // includes soft-deleted: a deleted feed word never returns
    const seen = new Set(existing.map((w) => fold(w.slovak)))

    const ordered = [...bank].sort((a, b) => a.rank - b.rank)
    const unseen = ordered.filter((e) => !seen.has(fold(e.slovak))).slice(0, count)

    const rows = unseen.map((e) => newWord({
      slovak: e.slovak,
      translation_ru: e.translation_ru,
      part_of_speech: e.part_of_speech,
      gender: e.gender,
      definition_sk: e.definition_sk,
      examples: e.examples,
      tags: ['feed', rankBand(e.rank)],
    }))

    if (rows.length > 0) await db.words.bulkPut(rows)
    await db.meta.put({ key: FEED_LAST_DATE_KEY, value: today })

    return rows
  })
}
