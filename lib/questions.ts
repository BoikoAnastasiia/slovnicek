import type { Question, WordRow } from './types'
import { maturityOf, promptLangOf } from './fsrs'
import { answersMatch, glossesOverlap } from './text'

export const ROUND_SIZE = 10

export const FALLBACK_SK = [
  'dom', 'voda', 'kniha', 'mesto', 'práca', 'čas', 'ruka', 'deň', 'noc', 'cesta',
  'slovo', 'život', 'svet', 'oko', 'hlava', 'rodina', 'jedlo', 'okno', 'stôl', 'more',
]
export const FALLBACK_RU = [
  'дом', 'вода', 'книга', 'город', 'работа', 'время', 'рука', 'день', 'ночь', 'дорога',
  'слово', 'жизнь', 'мир', 'глаз', 'голова', 'семья', 'еда', 'окно', 'стол', 'море',
]

interface GlossEntry { slovak: string; translation_ru: string }

interface BuildOpts { ttsAvailable: boolean; rng: () => number; roundSize?: number; bank?: GlossEntry[] }

export function buildRound(due: WordRow[], all: WordRow[], opts: BuildOpts): Question[] {
  const size = opts.roundSize ?? ROUND_SIZE
  return due.slice(0, size).map((w, i) => buildQuestion(w, all, i, opts))
}

function buildQuestion(w: WordRow, all: WordRow[], index: number, opts: BuildOpts): Question {
  if (promptLangOf(w) === 'sk') {
    return { wordId: w.id, type: 'sk_definition', prompt: w.definition_sk, answer: w.slovak }
  }
  const tier = maturityOf(w)
  const listening = opts.ttsAvailable && index % 5 === 4
  if (listening) {
    if (tier === 'new') {
      const distractors = pick3(candidates(all, w, (o) => o.translation_ru), FALLBACK_RU, w.translation_ru, opts.rng)
      return {
        wordId: w.id, type: 'listening_mc', prompt: '', audioWord: w.slovak,
        choices: shuffle([w.translation_ru, ...distractors], opts.rng), answer: w.translation_ru,
      }
    }
    return { wordId: w.id, type: 'listening_typed', prompt: '', audioWord: w.slovak, answer: w.slovak }
  }
  if (tier === 'new') {
    const distractors = pick3(candidates(all, w, (o) => o.slovak), FALLBACK_SK, w.slovak, opts.rng)
    return {
      wordId: w.id, type: 'mc_ru_to_sk', prompt: w.translation_ru,
      choices: shuffle([w.slovak, ...distractors], opts.rng), answer: w.slovak,
    }
  }
  return { wordId: w.id, type: 'typed_ru_to_sk', prompt: w.translation_ru, answer: w.slovak, accepted: synonymsOf(w, all, opts.bank) }
}

// words that share a RU gloss variant with the target — equally correct answers to its prompt
function synonymsOf(w: WordRow, all: WordRow[], bank: GlossEntry[] = []): string[] {
  const pool: GlossEntry[] = [...all.filter((o) => o.id !== w.id && !o.deleted_at), ...bank]
  const found = pool
    .filter((e) => e.slovak !== w.slovak && glossesOverlap(e.translation_ru, w.translation_ru))
    .map((e) => e.slovak)
  return [...new Set(found)]
}

function candidates(all: WordRow[], w: WordRow, field: (o: WordRow) => string): string[] {
  const pool = all.filter((o) => o.id !== w.id && !o.deleted_at && field(o).trim() !== ''
    && !glossesOverlap(o.translation_ru, w.translation_ru))
  const samePos = pool.filter((o) => o.part_of_speech === w.part_of_speech && w.part_of_speech !== '')
  const chosen = samePos.length >= 3 ? samePos : pool
  return [...new Set(chosen.map(field))]
}

function pick3(pool: string[], fallback: string[], answer: string, rng: () => number): string[] {
  const out: string[] = []
  const from = (src: string[]) => {
    const avail = src.filter((s) => s !== answer && !out.includes(s))
    while (out.length < 3 && avail.length) {
      out.push(avail.splice(Math.floor(rng() * avail.length), 1)[0])
    }
  }
  from(pool)
  from(fallback)
  return out
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Hint 1 shows the word shape; each further hint reveals one letter, never the whole word.
export function hintMask(answer: string, hints: number): string {
  const revealed = Math.min(hints - 1, maxHints(answer) - 1)
  let seen = 0
  return [...answer]
    .map((ch) => {
      if (ch === ' ') return ' '
      seen += 1
      return seen <= revealed ? ch : '_'
    })
    .join(' ')
}

export function maxHints(answer: string): number {
  return [...answer].filter((ch) => ch !== ' ').length
}

export function checkAnswer(q: Question, input: string): boolean {
  if (q.choices) return input === q.answer
  return answersMatch(q.answer, input) || (q.accepted ?? []).some((a) => answersMatch(a, input))
}
