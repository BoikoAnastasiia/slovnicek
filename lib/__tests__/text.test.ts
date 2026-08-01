import { describe, expect, it } from 'vitest'
import { answersMatch, closestAnswer, diffAnswer, fold, matchesQuery } from '@/lib/text'
import type { WordRow } from '@/lib/types'

const word = (over: Partial<WordRow>): WordRow => ({
  id: 'w1', slovak: 'dôvera', translation_ru: 'доверие', definition_sk: 'pevné presvedčenie o spoľahlivosti',
  part_of_speech: 'noun', gender: 'f', examples: [], tags: ['abstract'], notes: '',
  fsrs: { due: '2026-01-01T00:00:00.000Z', stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, state: 0, last_review: null },
  due: '2026-01-01T00:00:00.000Z', prompt_mode: 'auto',
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null, dirty: 0,
  ...over,
})

describe('fold', () => {
  it('strips Slovak diacritics and lowercases', () => {
    expect(fold('Dôvera')).toBe('dovera')
    expect(fold('ľúbiť')).toBe('lubit')
    expect(fold('  Čaj ')).toBe('caj')
  })
  it('leaves Cyrillic intact', () => {
    expect(fold('Доверие')).toBe('доверие')
  })
})

describe('answersMatch', () => {
  it('accepts diacritics-free input', () => {
    expect(answersMatch('dôvera', 'dovera')).toBe(true)
    expect(answersMatch('dôvera', 'DÔVERA ')).toBe(true)
  })
  it('rejects different words', () => {
    expect(answersMatch('dôvera', 'dovtera')).toBe(false)
    expect(answersMatch('dôvera', '')).toBe(false)
  })
})

describe('matchesQuery', () => {
  it('matches folded substrings across fields and tags', () => {
    const w = word({})
    expect(matchesQuery(w, 'dover')).toBe(true)
    expect(matchesQuery(w, 'довер')).toBe(true)
    expect(matchesQuery(w, 'abstract')).toBe(true)
    expect(matchesQuery(w, 'xyz')).toBe(false)
    expect(matchesQuery(w, '')).toBe(true)
  })
})

describe('diffAnswer', () => {
  const chars = (typed: string, expected: string) =>
    diffAnswer(typed, expected).map((s) => `${s.status[0]}:${s.char}`).join(' ')

  it('marks a substituted letter wrong', () => {
    expect(chars('divera', 'dôvera')).toBe('o:d w:i o:v o:e o:r o:a')
  })
  it('marks an extra letter wrong', () => {
    const segs = diffAnswer('doverra', 'dôvera')
    expect(segs.map((s) => s.char).join('')).toBe('doverra')
    expect(segs.filter((s) => s.status === 'wrong').map((s) => s.char)).toEqual(['r'])
    expect(segs.some((s) => s.status === 'missing')).toBe(false)
  })
  it('marks a skipped letter missing', () => {
    expect(chars('dvera', 'dôvera')).toBe('o:d m:· o:v o:e o:r o:a')
  })
  it('ignores diacritic-only differences', () => {
    expect(diffAnswer('dovera', 'dôvera').every((s) => s.status === 'ok')).toBe(true)
  })
  it('keeps the typed characters for display', () => {
    expect(diffAnswer('dovera', 'dôvera').map((s) => s.char).join('')).toBe('dovera')
  })
})

describe('closestAnswer', () => {
  it('picks the accepted answer nearest to the input', () => {
    expect(closestAnswer('čč', ['že', 'čo'])).toBe('čo')
    expect(closestAnswer('žee', ['že', 'čo'])).toBe('že')
  })
  it('falls back to the first answer', () => {
    expect(closestAnswer('xxxxx', ['že', 'čo'])).toBe('že')
  })
})
