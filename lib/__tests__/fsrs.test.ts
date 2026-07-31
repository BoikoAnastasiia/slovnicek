import { describe, expect, it } from 'vitest'
import { applyAnswer, dueWords, maturityOf, newCard, promptLangOf, MATURE_STABILITY_DAYS } from '@/lib/fsrs'
import type { WordRow } from '@/lib/types'

const NOW = new Date('2026-07-31T10:00:00.000Z')

const word = (over: Partial<WordRow> = {}): WordRow => ({
  id: 'w1', slovak: 'dôvera', translation_ru: 'доверие', definition_sk: 'pevné presvedčenie',
  part_of_speech: 'noun', gender: 'f', examples: [], tags: [], notes: '',
  fsrs: newCard(NOW), due: newCard(NOW).due, prompt_mode: 'auto',
  created_at: NOW.toISOString(), updated_at: NOW.toISOString(), deleted_at: null, dirty: 0,
  ...over,
})

describe('newCard', () => {
  it('is due immediately and in state New (0)', () => {
    const c = newCard(NOW)
    expect(c.due).toBe(NOW.toISOString())
    expect(c.state).toBe(0)
    expect(c.reps).toBe(0)
  })
})

describe('applyAnswer', () => {
  it('correct answer schedules the word into the future and marks dirty', () => {
    const w = applyAnswer(word(), true, NOW)
    expect(new Date(w.fsrs.due).getTime()).toBeGreaterThan(NOW.getTime())
    expect(w.due).toBe(w.fsrs.due)
    expect(w.fsrs.reps).toBe(1)
    expect(w.fsrs.last_review).toBe(NOW.toISOString())
    expect(w.dirty).toBe(1)
  })
  it('wrong answer schedules sooner than correct answer', () => {
    const right = applyAnswer(word(), true, NOW)
    const wrong = applyAnswer(word(), false, NOW)
    expect(new Date(wrong.fsrs.due).getTime()).toBeLessThanOrEqual(new Date(right.fsrs.due).getTime())
  })
})

describe('maturityOf / promptLangOf', () => {
  const mature = () => word({ fsrs: { ...newCard(NOW), state: 2, stability: MATURE_STABILITY_DAYS + 5 } })
  const learning = () => word({ fsrs: { ...newCard(NOW), state: 2, stability: 3 } })

  it('classifies tiers', () => {
    expect(maturityOf(word())).toBe('new')
    expect(maturityOf(learning())).toBe('learning')
    expect(maturityOf(mature())).toBe('mature')
  })
  it('mature words in auto mode get SK prompts', () => {
    expect(promptLangOf(word())).toBe('ru')
    expect(promptLangOf(mature())).toBe('sk')
  })
  it('pins override; empty definition falls back to RU', () => {
    expect(promptLangOf(word({ prompt_mode: 'pinned_sk' }))).toBe('sk')
    expect(promptLangOf({ ...mature(), prompt_mode: 'pinned_ru' })).toBe('ru')
    expect(promptLangOf({ ...mature(), definition_sk: ' ' })).toBe('ru')
  })
})

describe('dueWords', () => {
  it('returns non-deleted due words sorted by due date', () => {
    const later = new Date('2026-08-05T00:00:00.000Z').toISOString()
    const a = word({ id: 'a' })
    const b = word({ id: 'b', due: later })
    const c = word({ id: 'c', deleted_at: NOW.toISOString() })
    const earlier = word({ id: 'd', due: '2026-07-01T00:00:00.000Z' })
    expect(dueWords([a, b, c, earlier], NOW).map((w) => w.id)).toEqual(['d', 'a'])
  })
})
