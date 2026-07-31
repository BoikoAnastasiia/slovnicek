import { createEmptyCard, fsrs, Rating, State, type Card } from 'ts-fsrs'
import type { FsrsCard, Maturity, WordRow } from './types'

export const MATURE_STABILITY_DAYS = 21

const scheduler = fsrs()

function serializeCard(c: Card): FsrsCard {
  return {
    ...c,
    due: c.due.toISOString(),
    last_review: c.last_review ? c.last_review.toISOString() : null,
  } as unknown as FsrsCard
}

function deserializeCard(c: FsrsCard): Card {
  return {
    ...c,
    due: new Date(c.due),
    last_review: c.last_review ? new Date(c.last_review) : undefined,
  } as unknown as Card
}

export function newCard(now: Date): FsrsCard {
  return serializeCard(createEmptyCard(now))
}

export function applyAnswer(word: WordRow, correct: boolean, now: Date): WordRow {
  const rating = correct ? Rating.Good : Rating.Again
  const { card } = scheduler.next(deserializeCard(word.fsrs), now, rating)
  const fc = serializeCard(card)
  return { ...word, fsrs: fc, due: fc.due, updated_at: now.toISOString(), dirty: 1 }
}

export function maturityOf(word: WordRow): Maturity {
  if (word.fsrs.state === State.New) return 'new'
  if (word.fsrs.state === State.Review && word.fsrs.stability >= MATURE_STABILITY_DAYS) return 'mature'
  return 'learning'
}

export function promptLangOf(word: WordRow): 'ru' | 'sk' {
  if (word.prompt_mode === 'pinned_ru') return 'ru'
  if (word.prompt_mode === 'pinned_sk') return 'sk'
  return maturityOf(word) === 'mature' && word.definition_sk.trim() !== '' ? 'sk' : 'ru'
}

export function dueWords(all: WordRow[], now: Date): WordRow[] {
  const cutoff = now.toISOString()
  return all
    .filter((w) => !w.deleted_at && w.due <= cutoff)
    .sort((a, b) => a.due.localeCompare(b.due))
}
