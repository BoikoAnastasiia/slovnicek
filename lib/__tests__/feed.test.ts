import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, newWord, softDeleteWord } from '@/lib/db'
import {
  FEED_DEFAULT_COUNT,
  LEARN_BATCH,
  getFeedCount,
  introduceDailyWords,
  introduceMoreWords,
  loadBank,
  searchBankByRussian,
  setFeedCount,
  type BankEntry,
} from '@/lib/feed'

beforeEach(async () => {
  await Promise.all([db.words.clear(), db.review_logs.clear(), db.profile.clear(), db.meta.clear()])
})

function bankOf(n: number): BankEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    rank: i + 1,
    slovak: `slovo${i + 1}`,
    translation_ru: `слово${i + 1}`,
    part_of_speech: 'noun',
    gender: '',
    definition_sk: '',
    examples: [],
  }))
}

function fakeFetch(payload: unknown, ok = true): typeof fetch {
  return (async () => new Response(ok ? JSON.stringify(payload) : 'nope', { status: ok ? 200 : 404 })) as unknown as typeof fetch
}

describe('getFeedCount / setFeedCount', () => {
  it('defaults to FEED_DEFAULT_COUNT when unset', async () => {
    expect(await getFeedCount()).toBe(FEED_DEFAULT_COUNT)
  })
  it('round-trips a set value', async () => {
    await setFeedCount(10)
    expect(await getFeedCount()).toBe(10)
  })
})

describe('loadBank', () => {
  it('fetches /wordbank.json and memoizes across calls', async () => {
    let calls = 0
    const fetchFn: typeof fetch = (async (input: RequestInfo | URL) => {
      calls++
      expect(String(input)).toContain('/wordbank.json')
      return new Response(JSON.stringify(bankOf(3)), { status: 200 })
    }) as unknown as typeof fetch
    const first = await loadBank(fetchFn)
    const second = await loadBank(fetchFn)
    expect(first).toHaveLength(3)
    expect(second).toBe(first)
    expect(calls).toBe(1)
  })

  it('returns [] when the fetch fails (non-ok response)', async () => {
    vi.resetModules()
    const { loadBank: freshLoadBank } = await import('@/lib/feed')
    const out = await freshLoadBank(fakeFetch(null, false))
    expect(out).toEqual([])
  })

  it('returns [] when fetchFn throws', async () => {
    vi.resetModules()
    const { loadBank: freshLoadBank } = await import('@/lib/feed')
    const throwing = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    const out = await freshLoadBank(throwing)
    expect(out).toEqual([])
  })
})

describe('introduceDailyWords', () => {
  it('rule 1a: no-ops when feed:last_date already equals today', async () => {
    await db.meta.put({ key: 'feed:last_date', value: '2026-07-31' })
    const rows = await introduceDailyWords(bankOf(5), '2026-07-31')
    expect(rows).toEqual([])
    expect(await db.words.count()).toBe(0)
  })

  it('rule 1b: no-ops when feed count is 0', async () => {
    await setFeedCount(0)
    const rows = await introduceDailyWords(bankOf(5), '2026-07-31')
    expect(rows).toEqual([])
    expect(await db.words.count()).toBe(0)
  })

  it('rule 1c: no-ops when bank is empty', async () => {
    const rows = await introduceDailyWords([], '2026-07-31')
    expect(rows).toEqual([])
    expect(await db.words.count()).toBe(0)
  })

  it('rule 2: excludes words already present, including soft-deleted ones', async () => {
    const kept = newWord({ slovak: 'slovo1' })
    await db.words.put(kept)
    const deletedWord = newWord({ slovak: 'slovo2' })
    await db.words.put(deletedWord)
    await softDeleteWord(deletedWord.id)

    await setFeedCount(3)
    const rows = await introduceDailyWords(bankOf(5), '2026-07-31')

    const introduced = rows.map((r) => r.slovak)
    expect(introduced).not.toContain('slovo1')
    expect(introduced).not.toContain('slovo2')
    expect(introduced).toEqual(['slovo3', 'slovo4', 'slovo5'])
  })

  it('rule 3: creates the first N unseen bank entries in rank order, tagged feed + rank band', async () => {
    // Bank spanning the three rank bands directly (top500 / top1000 / top2000).
    const spanning: BankEntry[] = [
      { rank: 500, slovak: 'top500word', translation_ru: 'р1', part_of_speech: 'noun', gender: '', definition_sk: '', examples: [] },
      { rank: 501, slovak: 'top1000word', translation_ru: 'р2', part_of_speech: 'noun', gender: '', definition_sk: '', examples: [] },
      { rank: 1001, slovak: 'top2000word', translation_ru: 'р3', part_of_speech: 'noun', gender: '', definition_sk: '', examples: [] },
    ]
    await setFeedCount(3)
    const rows = await introduceDailyWords(spanning, '2026-07-31')
    expect(rows).toHaveLength(3)
    const byWord = Object.fromEntries(rows.map((r) => [r.slovak, r]))
    expect(byWord['top500word'].tags).toEqual(['feed', 'top500'])
    expect(byWord['top1000word'].tags).toEqual(['feed', 'top1000'])
    expect(byWord['top2000word'].tags).toEqual(['feed', 'top2000'])
    expect(byWord['top500word'].translation_ru).toBe('р1')

    const stored = await db.words.toArray()
    expect(stored).toHaveLength(3)
  })

  it('rule 3: takes entries in rank order regardless of input array order', async () => {
    await setFeedCount(2)
    const shuffled: BankEntry[] = [
      { rank: 3, slovak: 'third', translation_ru: 'т', part_of_speech: 'noun', gender: '', definition_sk: '', examples: [] },
      { rank: 1, slovak: 'first', translation_ru: 'о', part_of_speech: 'noun', gender: '', definition_sk: '', examples: [] },
      { rank: 2, slovak: 'second', translation_ru: 'в', part_of_speech: 'noun', gender: '', definition_sk: '', examples: [] },
    ]
    const rows = await introduceDailyWords(shuffled, '2026-07-31')
    expect(rows.map((r) => r.slovak)).toEqual(['first', 'second'])
  })

  it('rule 4: sets feed:last_date even when fewer than N unseen words remain (including zero)', async () => {
    await db.words.put(newWord({ slovak: 'slovo1' }))
    await setFeedCount(5)
    const rows = await introduceDailyWords([bankOf(1)[0]], '2026-07-31')
    expect(rows).toEqual([])
    const meta = await db.meta.get('feed:last_date')
    expect(meta?.value).toBe('2026-07-31')
  })

  it('rule 5: idempotent under double invocation the same day (strict-mode double-mount)', async () => {
    await setFeedCount(3)
    const bank = bankOf(5)
    const first = await introduceDailyWords(bank, '2026-07-31')
    const second = await introduceDailyWords(bank, '2026-07-31')
    expect(first).toHaveLength(3)
    expect(second).toEqual([])
    expect(await db.words.count()).toBe(3)
  })

  it('rule 5: idempotent even when both calls race concurrently (simulates strict-mode double-mount)', async () => {
    await setFeedCount(3)
    const bank = bankOf(5)
    const [first, second] = await Promise.all([
      introduceDailyWords(bank, '2026-07-31'),
      introduceDailyWords(bank, '2026-07-31'),
    ])
    const totalIntroduced = first.length + second.length
    expect(totalIntroduced).toBe(3)
    expect(await db.words.count()).toBe(3)
  })

  it('does not reintroduce a word across days once already introduced', async () => {
    await setFeedCount(2)
    const bank = bankOf(4)
    const day1 = await introduceDailyWords(bank, '2026-07-31')
    expect(day1.map((r) => r.slovak)).toEqual(['slovo1', 'slovo2'])
    const day2 = await introduceDailyWords(bank, '2026-08-01')
    expect(day2.map((r) => r.slovak)).toEqual(['slovo3', 'slovo4'])
  })
})

describe('searchBankByRussian', () => {
  const bank: BankEntry[] = [
    { rank: 1, slovak: 'ten', translation_ru: 'тот, этот', part_of_speech: 'pron', gender: '', definition_sk: '', examples: [] },
    { rank: 2, slovak: 'testovat', translation_ru: 'тестировать', part_of_speech: 'verb', gender: '', definition_sk: '', examples: [] },
    { rank: 3, slovak: 'test', translation_ru: 'тест, испытание', part_of_speech: 'noun', gender: '', definition_sk: '', examples: [] },
  ]

  it('returns null for an empty or whitespace query', () => {
    expect(searchBankByRussian(bank, '')).toBeNull()
    expect(searchBankByRussian(bank, '   ')).toBeNull()
  })

  it('returns null when no variant matches', () => {
    expect(searchBankByRussian(bank, 'мир')).toBeNull()
  })

  it('matches a comma-separated variant, not just the first one', () => {
    expect(searchBankByRussian(bank, 'этот')?.slovak).toBe('ten')
  })

  it('is case-insensitive', () => {
    expect(searchBankByRussian(bank, 'ТЕСТ')?.slovak).toBe('test')
  })

  it('prefers an exact match over a prefix match, even at a higher rank', () => {
    // 'тест' is an exact variant of entry rank 3 ('test'), but is also a
    // prefix of entry rank 2's 'тестировать'. Exact must win.
    expect(searchBankByRussian(bank, 'тест')?.slovak).toBe('test')
  })

  it('falls back to a prefix match (lowest rank) when no exact match exists', () => {
    // 'тес' is a prefix of both 'тестировать' (rank 2) and 'тест' (rank 3),
    // and an exact match for neither.
    expect(searchBankByRussian(bank, 'тес')?.slovak).toBe('testovat')
  })

  it('does not prefix-match queries shorter than 3 characters', () => {
    expect(searchBankByRussian(bank, 'те')).toBeNull()
  })
})

describe('introduceMoreWords', () => {
  it('introduces exactly N unseen bank words in rank order, skipping existing and soft-deleted', async () => {
    const kept = newWord({ slovak: 'slovo1' })
    await db.words.put(kept)
    const deletedWord = newWord({ slovak: 'slovo2' })
    await db.words.put(deletedWord)
    await softDeleteWord(deletedWord.id)

    const rows = await introduceMoreWords(bankOf(10), 3)
    expect(rows.map((r) => r.slovak)).toEqual(['slovo3', 'slovo4', 'slovo5'])
    expect(rows.every((r) => r.tags[0] === 'feed')).toBe(true)
  })

  it('defaults to LEARN_BATCH when count is omitted', async () => {
    const rows = await introduceMoreWords(bankOf(20))
    expect(rows).toHaveLength(LEARN_BATCH)
  })

  it('does not read or write feed:last_date', async () => {
    await introduceMoreWords(bankOf(5), 2)
    const meta = await db.meta.get('feed:last_date')
    expect(meta).toBeUndefined()

    // Even with feed:last_date already set for today, introduceMoreWords still introduces.
    await db.meta.put({ key: 'feed:last_date', value: '2026-07-31' })
    const rows = await introduceMoreWords(bankOf(5), 2)
    expect(rows).toHaveLength(2)
  })

  it('works repeatedly: two consecutive calls introduce different words', async () => {
    const bank = bankOf(10)
    const first = await introduceMoreWords(bank, 4)
    const second = await introduceMoreWords(bank, 4)
    expect(first.map((r) => r.slovak)).toEqual(['slovo1', 'slovo2', 'slovo3', 'slovo4'])
    expect(second.map((r) => r.slovak)).toEqual(['slovo5', 'slovo6', 'slovo7', 'slovo8'])
    expect(await db.words.count()).toBe(8)
  })

  it('returns [] once the bank is exhausted', async () => {
    const bank = bankOf(3)
    const first = await introduceMoreWords(bank, 5)
    expect(first).toHaveLength(3)
    const second = await introduceMoreWords(bank, 5)
    expect(second).toEqual([])
  })
})
