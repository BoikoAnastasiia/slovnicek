import { describe, expect, it } from 'vitest'
import { buildRound, checkAnswer } from '@/lib/questions'
import { newCard, MATURE_STABILITY_DAYS } from '@/lib/fsrs'
import type { WordRow } from '@/lib/types'

const NOW = new Date('2026-07-31T10:00:00.000Z')
let seq = 0
const word = (over: Partial<WordRow> = {}): WordRow => ({
  id: `w${seq++}`, slovak: `slovo${seq}`, translation_ru: `слово${seq}`, definition_sk: `definícia ${seq}`,
  part_of_speech: 'noun', gender: '', examples: [], tags: [], notes: '',
  fsrs: newCard(NOW), due: newCard(NOW).due, prompt_mode: 'auto',
  created_at: NOW.toISOString(), updated_at: NOW.toISOString(), deleted_at: null, dirty: 0,
  ...over,
})
const learningFsrs = () => ({ ...newCard(NOW), state: 2, stability: 3 })
const matureFsrs = () => ({ ...newCard(NOW), state: 2, stability: MATURE_STABILITY_DAYS + 5 })
const rng = () => 0.42
const opts = { ttsAvailable: false, rng }

describe('buildRound', () => {
  it('caps at roundSize and keeps due order', () => {
    const due = Array.from({ length: 15 }, () => word())
    const qs = buildRound(due, due, opts)
    expect(qs).toHaveLength(10)
    expect(qs.map((q) => q.wordId)).toEqual(due.slice(0, 10).map((w) => w.id))
  })

  it('new words get 4-choice MC including the answer', () => {
    const due = [word()]
    const pool = [due[0], word(), word(), word(), word()]
    const [q] = buildRound(due, pool, opts)
    expect(q.type).toBe('mc_ru_to_sk')
    expect(q.prompt).toBe(due[0].translation_ru)
    expect(q.choices).toHaveLength(4)
    expect(new Set(q.choices).size).toBe(4)
    expect(q.choices).toContain(due[0].slovak)
    expect(q.answer).toBe(due[0].slovak)
  })

  it('pads MC choices from the fallback pool when base is small', () => {
    const due = [word()]
    const [q] = buildRound(due, due, opts)
    expect(q.choices).toHaveLength(4)
    expect(new Set(q.choices).size).toBe(4)
  })

  it('learning words get typed recall', () => {
    const [q] = buildRound([word({ fsrs: learningFsrs() })], [], opts)
    expect(q.type).toBe('typed_ru_to_sk')
    expect(q.choices).toBeUndefined()
  })

  it('mature words get SK-definition prompts with no Russian', () => {
    const w = word({ fsrs: matureFsrs() })
    const [q] = buildRound([w], [], opts)
    expect(q.type).toBe('sk_definition')
    expect(q.prompt).toBe(w.definition_sk)
    expect(q.prompt).not.toContain(w.translation_ru)
  })

  it('every 5th question becomes a listening variant when TTS is available', () => {
    const due = Array.from({ length: 10 }, () => word({ fsrs: learningFsrs() }))
    const qs = buildRound(due, due, { ...opts, ttsAvailable: true })
    expect(qs[4].type).toBe('listening_typed')
    expect(qs[4].audioWord).toBe(due[4].slovak)
    expect(qs[9].type).toBe('listening_typed')
    expect(qs[0].type).toBe('typed_ru_to_sk')
  })

  it('listening for new words is MC over Russian translations', () => {
    const due = [word(), word(), word(), word(), word()]
    const qs = buildRound(due, due, { ...opts, ttsAvailable: true })
    expect(qs[4].type).toBe('listening_mc')
    expect(qs[4].choices).toHaveLength(4)
    expect(qs[4].answer).toBe(due[4].translation_ru)
  })

  it('no listening questions when TTS unavailable', () => {
    const due = Array.from({ length: 10 }, () => word())
    expect(buildRound(due, due, opts).every((q) => !q.type.startsWith('listening'))).toBe(true)
  })
})

describe('checkAnswer', () => {
  it('typed answers are diacritics-tolerant', () => {
    const q = { wordId: 'x', type: 'typed_ru_to_sk' as const, prompt: 'доверие', answer: 'dôvera' }
    expect(checkAnswer(q, 'dovera')).toBe(true)
    expect(checkAnswer(q, 'dover')).toBe(false)
  })
  it('MC answers require exact choice', () => {
    const q = { wordId: 'x', type: 'mc_ru_to_sk' as const, prompt: 'п', answer: 'dôvera', choices: ['dôvera', 'a', 'b', 'c'] }
    expect(checkAnswer(q, 'dôvera')).toBe(true)
    expect(checkAnswer(q, 'a')).toBe(false)
  })
})

describe('shared-gloss synonyms', () => {
  const ze = () => word({ slovak: 'že', translation_ru: 'что', part_of_speech: 'conj' })
  const co = () => word({ slovak: 'čo', translation_ru: 'что', part_of_speech: 'pron' })

  it('MC distractors never include a word sharing the gloss with the answer', () => {
    const due = [ze()]
    const pool = [due[0], co(), word(), word(), word()]
    const [q] = buildRound(due, pool, opts)
    expect(q.type).toBe('mc_ru_to_sk')
    expect(q.choices).not.toContain('čo')
  })

  it('listening MC distractors never overlap the gloss of the answer', () => {
    const due = [word(), word(), word(), word(), ze()]
    const pool = [due[4], word({ slovak: 'čo', translation_ru: 'что, какой', part_of_speech: 'conj' }), word(), word()]
    const qs = buildRound(due, pool, { ...opts, ttsAvailable: true })
    expect(qs[4].type).toBe('listening_mc')
    expect(qs[4].choices).not.toContain('что, какой')
  })

  it('typed answers accept a synonym from the collection', () => {
    const target = ze()
    target.fsrs = learningFsrs()
    const [q] = buildRound([target], [target, co()], opts)
    expect(q.type).toBe('typed_ru_to_sk')
    expect(checkAnswer(q, 'čo')).toBe(true)
    expect(checkAnswer(q, 'že')).toBe(true)
    expect(checkAnswer(q, 'ten')).toBe(false)
  })

  it('typed answers accept a synonym from the bank', () => {
    const target = ze()
    target.fsrs = learningFsrs()
    const bank = [{ slovak: 'čo', translation_ru: 'что' }]
    const [q] = buildRound([target], [target], { ...opts, bank })
    expect(checkAnswer(q, 'čo')).toBe(true)
  })

  it('comma-separated gloss variants count as overlap', () => {
    const target = word({ slovak: 'ten', translation_ru: 'тот, этот' })
    target.fsrs = learningFsrs()
    const other = word({ slovak: 'tento', translation_ru: 'этот' })
    const [q] = buildRound([target], [target, other], opts)
    expect(checkAnswer(q, 'tento')).toBe(true)
  })

  it('listening typed still requires the exact word heard', () => {
    const due = [word({ fsrs: learningFsrs() }), word({ fsrs: learningFsrs() }), word({ fsrs: learningFsrs() }), word({ fsrs: learningFsrs() }), ze()]
    due[4].fsrs = learningFsrs()
    const qs = buildRound(due, [...due, co()], { ...opts, ttsAvailable: true })
    expect(qs[4].type).toBe('listening_typed')
    expect(checkAnswer(qs[4], 'čo')).toBe(false)
    expect(checkAnswer(qs[4], 'že')).toBe(true)
  })
})
