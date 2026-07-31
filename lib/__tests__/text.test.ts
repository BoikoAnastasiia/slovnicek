import { describe, expect, it } from 'vitest'
import { answersMatch, fold, matchesQuery } from '@/lib/text'
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
