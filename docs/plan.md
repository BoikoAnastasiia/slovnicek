# Slovníček Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Slovníček — an offline-first PWA vocabulary trainer for a Russian-speaking Slovak learner: personal word base + FSRS spaced repetition with auto-graded quiz rounds, points/achievements, and automatic RU→SK prompt transition.

**Architecture:** Client-only Next.js App Router app. Dexie (IndexedDB) is the on-device source of truth; all review/scoring/FSRS logic lives in pure `lib/` modules (unit-tested with vitest); Supabase is a dumb sync mirror behind a narrow `SyncTransport` port; enrichment is an isolated Wiktionary module.

**Tech Stack:** Next.js 15 (App Router, **webpack** — no Turbopack), React 19, TypeScript, framer-motion, Dexie + dexie-react-hooks, ts-fsrs, @serwist/next (PWA), @supabase/supabase-js (Google OAuth + sync), vitest + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-07-31-slovnicek-design.md` (copy into repo in Task 1).

## Global Constraints

- **React 19** and **Next.js 15 App Router**; dev and build run on **webpack, not Turbopack** — `package.json` scripts must be `"dev": "next dev"` and `"build": "next build"` with NO `--turbopack` flag anywhere.
- Client-only app: every page/component that touches data has `'use client'`; no server rendering of user data, no API routes.
- Offline-first: every feature except enrichment and sync must work with no network.
- Package manager: **npm**. Project root: `/Users/admin/Documents/job_searching/slovnicek`.
- **NO AI attribution anywhere**: commits are authored solely by the user, with NO `Co-Authored-By` trailer, NO "Generated with Claude Code" line, no AI mentions in README/comments. This overrides any default commit-message instruction.
- Commit messages: short conventional style (`feat: …`, `chore: …`, `test: …`).
- All timestamps stored as ISO-8601 strings (`new Date().toISOString()`); LWW comparisons are string comparisons.
- Path alias `@/*` → repo root (both tsconfig and vitest).

---

### Task 1: Scaffold project + tooling

**Files:**
- Create: entire Next.js scaffold at `slovnicek/`, `vitest.config.ts`, `.env.local.example`, `docs/` (spec + plan copies)
- Modify: `package.json` (scripts, deps)

**Interfaces:**
- Produces: working `npm run dev` (webpack), `npm run build`, `npm test` (vitest), git repo with initial commit.

- [ ] **Step 1: Scaffold**

```bash
cd /Users/admin/Documents/job_searching
npx create-next-app@15 slovnicek --ts --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm
cd slovnicek
```

If the interactive prompt asks about Turbopack, answer **No**.

- [ ] **Step 2: Force webpack scripts + verify React 19**

Edit `package.json` scripts to exactly:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit"
}
```

Run: `npm ls react` → must show `react@19.x`. If create-next-app pinned React 18, run `npm i react@19 react-dom@19`.

- [ ] **Step 3: Install dependencies**

```bash
npm i dexie dexie-react-hooks ts-fsrs framer-motion @supabase/supabase-js @serwist/next
npm i -D vitest fake-indexeddb serwist
```

- [ ] **Step 4: vitest config**

Create `vitest.config.ts`:

```ts
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node' },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

- [ ] **Step 5: Env example + docs**

Create `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Copy the spec and this plan into the repo:

```bash
mkdir -p docs
cp ../docs/superpowers/specs/2026-07-31-slovnicek-design.md docs/design.md
cp ../docs/superpowers/plans/2026-07-31-slovnicek.md docs/plan.md
```

- [ ] **Step 6: Verify build + dev on webpack**

Run: `npm run build` → succeeds. Run `npm run dev` briefly → startup banner must NOT mention Turbopack. Kill it.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 app with vitest and core deps"
```

(create-next-app already ran `git init`. Remember: no AI attribution trailer — plain message only.)

---

### Task 2: Domain types + text utilities

**Files:**
- Create: `lib/types.ts`, `lib/text.ts`
- Test: `lib/__tests__/text.test.ts`

**Interfaces:**
- Produces (types consumed by every later task):

```ts
// lib/types.ts — exact contents
export type PromptMode = 'auto' | 'pinned_ru' | 'pinned_sk'
export type Maturity = 'new' | 'learning' | 'mature'
export type QuestionType =
  | 'mc_ru_to_sk'      // RU prompt → choose Slovak word (recognition)
  | 'typed_ru_to_sk'   // RU prompt → type Slovak word
  | 'sk_definition'    // SK definition prompt → type Slovak word (mature)
  | 'listening_mc'     // hear Slovak word → choose RU translation
  | 'listening_typed'  // hear Slovak word → type it

export interface FsrsCard {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  state: number
  last_review: string | null
  learning_steps?: number
}

export interface WordRow {
  id: string
  slovak: string
  translation_ru: string
  definition_sk: string
  part_of_speech: string
  gender: string
  examples: string[]
  tags: string[]
  notes: string
  fsrs: FsrsCard
  due: string            // denormalized copy of fsrs.due for indexing
  prompt_mode: PromptMode
  created_at: string
  updated_at: string
  deleted_at: string | null
  dirty: number          // 1 = needs push; local-only field
}

export interface ReviewLogRow {
  id: string
  word_id: string
  question_type: QuestionType
  correct: boolean
  fsrs_grade: number     // ts-fsrs Rating: 1 = Again, 3 = Good
  points_earned: number
  answered_at: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  dirty: number
}

export interface ProfileRow {
  id: string             // always 'profile'
  total_points: number
  current_streak: number
  best_streak: number
  last_round_date: string | null   // 'YYYY-MM-DD'
  achievements: Record<string, string>  // achievement id → ISO unlock date
  created_at: string
  updated_at: string
  deleted_at: string | null
  dirty: number
}

export interface MetaRow { key: string; value: unknown }

export interface Question {
  wordId: string
  type: QuestionType
  prompt: string         // RU translation, SK definition, or '' for listening
  answer: string         // canonical correct answer string
  choices?: string[]     // present for mc types, length 4, shuffled
  audioWord?: string     // Slovak word to speak for listening types
}

export interface Enrichment {
  part_of_speech?: string
  definition_sk?: string
  translation_ru?: string
  examples?: string[]
  notes?: string
}
```

- Produces `lib/text.ts`: `fold(s: string): string`, `answersMatch(expected: string, input: string): boolean`, `matchesQuery(w: WordRow, q: string): boolean`

- [ ] **Step 1: Write failing tests** — `lib/__tests__/text.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL (module `@/lib/text` not found).

- [ ] **Step 3: Implement** — create `lib/types.ts` exactly as in Interfaces above, and `lib/text.ts`:

```ts
import type { WordRow } from './types'

export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function answersMatch(expected: string, input: string): boolean {
  const e = fold(expected)
  return e !== '' && e === fold(input)
}

export function matchesQuery(w: WordRow, q: string): boolean {
  const needle = fold(q)
  if (!needle) return true
  const haystack = [w.slovak, w.translation_ru, w.definition_sk, w.notes, ...w.tags]
  return haystack.some((f) => fold(f).includes(needle))
}
```

- [ ] **Step 4: Run tests** — `npm test` → PASS. Also `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib vitest.config.ts
git commit -m "feat: domain types and diacritics-tolerant text matching"
```

---

### Task 3: FSRS module

**Files:**
- Create: `lib/fsrs.ts`
- Test: `lib/__tests__/fsrs.test.ts`

**Interfaces:**
- Consumes: `WordRow`, `FsrsCard`, `Maturity` from `@/lib/types`.
- Produces: `MATURE_STABILITY_DAYS = 21`, `newCard(now: Date): FsrsCard`, `applyAnswer(word: WordRow, correct: boolean, now: Date): WordRow`, `maturityOf(word: WordRow): Maturity`, `promptLangOf(word: WordRow): 'ru' | 'sk'`, `dueWords(all: WordRow[], now: Date): WordRow[]`.

- [ ] **Step 1: Write failing tests** — `lib/__tests__/fsrs.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `npm test lib/__tests__/fsrs.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `lib/fsrs.ts`:

```ts
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
```

Note: `pinned_sk` intentionally wins even with an empty definition (the user pinned it; UI prevents pinning without a definition in Task 13). If ts-fsrs's `Card` type mismatch causes a compile error on the casts, keep the `as unknown as` casts — they are deliberate version tolerance.

- [ ] **Step 4: Run tests** — `npm test` → PASS (text + fsrs). `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib
git commit -m "feat: FSRS scheduling wrapper with maturity tiers and prompt language"
```

---

### Task 4: Dexie database module

**Files:**
- Create: `lib/db.ts`
- Test: `lib/__tests__/db.test.ts`

**Interfaces:**
- Consumes: row types from `@/lib/types`, `newCard` from `@/lib/fsrs`.
- Produces: `db` (Dexie instance with tables `words`, `review_logs`, `profile`, `meta`), `nowIso(): string`, `PROFILE_ID = 'profile'`, `newWord(fields: Partial<WordRow> & { slovak: string }): WordRow`, `saveWord(w: WordRow): Promise<void>`, `softDeleteWord(id: string): Promise<void>`, `getProfile(): Promise<ProfileRow>`.

- [ ] **Step 1: Write failing tests** — `lib/__tests__/db.test.ts`:

```ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, getProfile, newWord, saveWord, softDeleteWord, PROFILE_ID } from '@/lib/db'

beforeEach(async () => {
  await Promise.all([db.words.clear(), db.review_logs.clear(), db.profile.clear(), db.meta.clear()])
})

describe('newWord', () => {
  it('fills defaults, fresh FSRS card, dirty=1', () => {
    const w = newWord({ slovak: 'kniha', translation_ru: 'книга' })
    expect(w.id).toMatch(/[0-9a-f-]{36}/)
    expect(w.tags).toEqual([])
    expect(w.prompt_mode).toBe('auto')
    expect(w.fsrs.state).toBe(0)
    expect(w.due).toBe(w.fsrs.due)
    expect(w.dirty).toBe(1)
  })
})

describe('word persistence', () => {
  it('saveWord bumps updated_at and marks dirty', async () => {
    const w = { ...newWord({ slovak: 'kniha' }), dirty: 0, updated_at: '2020-01-01T00:00:00.000Z' }
    await saveWord(w)
    const stored = (await db.words.get(w.id))!
    expect(stored.dirty).toBe(1)
    expect(stored.updated_at > '2020-01-01T00:00:00.000Z').toBe(true)
  })
  it('softDeleteWord sets deleted_at and dirty', async () => {
    const w = newWord({ slovak: 'kniha' })
    await db.words.put(w)
    await softDeleteWord(w.id)
    const stored = (await db.words.get(w.id))!
    expect(stored.deleted_at).not.toBeNull()
    expect(stored.dirty).toBe(1)
  })
})

describe('getProfile', () => {
  it('creates a singleton profile on first call and reuses it', async () => {
    const p1 = await getProfile()
    expect(p1.id).toBe(PROFILE_ID)
    expect(p1.total_points).toBe(0)
    await db.profile.update(PROFILE_ID, { total_points: 50 })
    const p2 = await getProfile()
    expect(p2.total_points).toBe(50)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npm test lib/__tests__/db.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `lib/db.ts`:

```ts
import Dexie, { type Table } from 'dexie'
import type { MetaRow, ProfileRow, ReviewLogRow, WordRow } from './types'
import { newCard } from './fsrs'

class SlovnicekDb extends Dexie {
  words!: Table<WordRow, string>
  review_logs!: Table<ReviewLogRow, string>
  profile!: Table<ProfileRow, string>
  meta!: Table<MetaRow, string>

  constructor() {
    super('slovnicek')
    this.version(1).stores({
      words: 'id, slovak, due, dirty, updated_at, *tags',
      review_logs: 'id, word_id, answered_at, dirty, updated_at',
      profile: 'id, dirty, updated_at',
      meta: 'key',
    })
  }
}

export const db = new SlovnicekDb()

export const PROFILE_ID = 'profile'

export const nowIso = () => new Date().toISOString()

export function newWord(fields: Partial<WordRow> & { slovak: string }): WordRow {
  const now = new Date()
  const iso = now.toISOString()
  const card = newCard(now)
  return {
    id: crypto.randomUUID(),
    translation_ru: '', definition_sk: '', part_of_speech: '', gender: '',
    examples: [], tags: [], notes: '',
    fsrs: card, due: card.due, prompt_mode: 'auto',
    created_at: iso, updated_at: iso, deleted_at: null, dirty: 1,
    ...fields,
  }
}

export async function saveWord(w: WordRow): Promise<void> {
  await db.words.put({ ...w, updated_at: nowIso(), dirty: 1 })
}

export async function softDeleteWord(id: string): Promise<void> {
  const iso = nowIso()
  await db.words.update(id, { deleted_at: iso, updated_at: iso, dirty: 1 })
}

export async function getProfile(): Promise<ProfileRow> {
  const existing = await db.profile.get(PROFILE_ID)
  if (existing) return existing
  const iso = nowIso()
  const fresh: ProfileRow = {
    id: PROFILE_ID, total_points: 0, current_streak: 0, best_streak: 0,
    last_round_date: null, achievements: {},
    created_at: iso, updated_at: iso, deleted_at: null, dirty: 1,
  }
  await db.profile.put(fresh)
  return fresh
}
```

- [ ] **Step 4: Run tests** — `npm test` → PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib
git commit -m "feat: Dexie schema and word/profile persistence helpers"
```

---

### Task 5: Question generator

**Files:**
- Create: `lib/questions.ts`
- Test: `lib/__tests__/questions.test.ts`

**Interfaces:**
- Consumes: `Question`, `QuestionType`, `WordRow` from `@/lib/types`; `maturityOf`, `promptLangOf` from `@/lib/fsrs`; `answersMatch` from `@/lib/text`.
- Produces: `ROUND_SIZE = 10`, `buildRound(due: WordRow[], all: WordRow[], opts: { ttsAvailable: boolean; rng: () => number; roundSize?: number }): Question[]`, `checkAnswer(q: Question, input: string): boolean`.

- [ ] **Step 1: Write failing tests** — `lib/__tests__/questions.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `npm test lib/__tests__/questions.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `lib/questions.ts`:

```ts
import type { Question, WordRow } from './types'
import { maturityOf, promptLangOf } from './fsrs'
import { answersMatch } from './text'

export const ROUND_SIZE = 10

export const FALLBACK_SK = [
  'dom', 'voda', 'kniha', 'mesto', 'práca', 'čas', 'ruka', 'deň', 'noc', 'cesta',
  'slovo', 'život', 'svet', 'oko', 'hlava', 'rodina', 'jedlo', 'okno', 'stôl', 'more',
]
export const FALLBACK_RU = [
  'дом', 'вода', 'книга', 'город', 'работа', 'время', 'рука', 'день', 'ночь', 'дорога',
  'слово', 'жизнь', 'мир', 'глаз', 'голова', 'семья', 'еда', 'окно', 'стол', 'море',
]

interface BuildOpts { ttsAvailable: boolean; rng: () => number; roundSize?: number }

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
  return { wordId: w.id, type: 'typed_ru_to_sk', prompt: w.translation_ru, answer: w.slovak }
}

function candidates(all: WordRow[], w: WordRow, field: (o: WordRow) => string): string[] {
  const pool = all.filter((o) => o.id !== w.id && !o.deleted_at && field(o).trim() !== '')
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

export function checkAnswer(q: Question, input: string): boolean {
  if (q.choices) return input === q.answer
  return answersMatch(q.answer, input)
}
```

- [ ] **Step 4: Run tests** — `npm test` → PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib
git commit -m "feat: quiz question generator with maturity tiers and listening variants"
```

---

### Task 6: Scoring + achievements

**Files:**
- Create: `lib/scoring.ts`
- Test: `lib/__tests__/scoring.test.ts`

**Interfaces:**
- Consumes: `ProfileRow`, `QuestionType` from `@/lib/types`.
- Produces: `BASE_POINTS: Record<QuestionType, number>`, `pointsFor(type: QuestionType, combo: number): number` (combo = consecutive correct answers BEFORE this one), `RoundResult { total: number; correct: number; points: number }`, `applyRoundToProfile(profile: ProfileRow, round: RoundResult, today: string): ProfileRow` (pure — caller persists), `AchievementDef { id; title; description; check(ctx) }`, `AchievementContext { totalWords; totalReviews; totalPoints; currentStreak; skModeWords; lastRound: RoundResult }`, `ACHIEVEMENTS: AchievementDef[]`, `evaluateAchievements(ctx: AchievementContext, unlocked: Record<string, string>): AchievementDef[]` (returns only newly unlocked; pure).

- [ ] **Step 1: Write failing tests** — `lib/__tests__/scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS, applyRoundToProfile, evaluateAchievements, pointsFor, type AchievementContext } from '@/lib/scoring'
import type { ProfileRow } from '@/lib/types'

const profile = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  id: 'profile', total_points: 100, current_streak: 3, best_streak: 5, last_round_date: '2026-07-30',
  achievements: {}, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null, dirty: 0, ...over,
})
const ctx = (over: Partial<AchievementContext> = {}): AchievementContext => ({
  totalWords: 0, totalReviews: 0, totalPoints: 0, currentStreak: 0, skModeWords: 0,
  lastRound: { total: 10, correct: 5, points: 50 }, ...over,
})

describe('pointsFor', () => {
  it('scales base points by difficulty', () => {
    expect(pointsFor('mc_ru_to_sk', 0)).toBe(10)
    expect(pointsFor('typed_ru_to_sk', 0)).toBe(15)
    expect(pointsFor('sk_definition', 0)).toBe(20)
  })
  it('adds 10% per combo step, capped at 10', () => {
    expect(pointsFor('mc_ru_to_sk', 3)).toBe(13)
    expect(pointsFor('mc_ru_to_sk', 25)).toBe(20)
  })
})

describe('applyRoundToProfile', () => {
  const round = { total: 10, correct: 8, points: 120 }
  it('adds points and extends a consecutive-day streak', () => {
    const p = applyRoundToProfile(profile(), round, '2026-07-31')
    expect(p.total_points).toBe(220)
    expect(p.current_streak).toBe(4)
    expect(p.best_streak).toBe(5)
    expect(p.last_round_date).toBe('2026-07-31')
    expect(p.dirty).toBe(1)
  })
  it('same-day round keeps streak; gap resets to 1; best updates', () => {
    expect(applyRoundToProfile(profile(), round, '2026-07-30').current_streak).toBe(3)
    expect(applyRoundToProfile(profile(), round, '2026-08-10').current_streak).toBe(1)
    expect(applyRoundToProfile(profile({ current_streak: 5 }), round, '2026-07-31').best_streak).toBe(6)
  })
  it('first round ever starts streak at 1', () => {
    expect(applyRoundToProfile(profile({ last_round_date: null, current_streak: 0 }), round, '2026-07-31').current_streak).toBe(1)
  })
})

describe('evaluateAchievements', () => {
  it('returns newly satisfied achievements only', () => {
    const fresh = evaluateAchievements(ctx({ totalWords: 12 }), {})
    const ids = fresh.map((a) => a.id)
    expect(ids).toContain('first_word')
    expect(ids).toContain('words_10')
    expect(ids).not.toContain('words_100')
  })
  it('skips already-unlocked achievements', () => {
    const fresh = evaluateAchievements(ctx({ totalWords: 12 }), { first_word: '2026-01-01', words_10: '2026-01-02' })
    expect(fresh).toHaveLength(0)
  })
  it('perfect_round needs >=5 questions all correct', () => {
    const ok = evaluateAchievements(ctx({ lastRound: { total: 5, correct: 5, points: 50 } }), {})
    expect(ok.map((a) => a.id)).toContain('perfect_round')
    const tooSmall = evaluateAchievements(ctx({ lastRound: { total: 3, correct: 3, points: 30 } }), {})
    expect(tooSmall.map((a) => a.id)).not.toContain('perfect_round')
  })
  it('catalog has unique ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npm test lib/__tests__/scoring.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `lib/scoring.ts`:

```ts
import type { ProfileRow, QuestionType } from './types'

export const BASE_POINTS: Record<QuestionType, number> = {
  mc_ru_to_sk: 10,
  listening_mc: 12,
  typed_ru_to_sk: 15,
  listening_typed: 18,
  sk_definition: 20,
}

export function pointsFor(type: QuestionType, combo: number): number {
  return Math.round(BASE_POINTS[type] * (1 + 0.1 * Math.min(combo, 10)))
}

export interface RoundResult { total: number; correct: number; points: number }

export function applyRoundToProfile(profile: ProfileRow, round: RoundResult, today: string): ProfileRow {
  let streak = profile.current_streak
  if (profile.last_round_date !== today) {
    streak = isYesterday(profile.last_round_date, today) ? streak + 1 : 1
  }
  return {
    ...profile,
    total_points: profile.total_points + round.points,
    current_streak: streak,
    best_streak: Math.max(profile.best_streak, streak),
    last_round_date: today,
    dirty: 1,
  }
}

function isYesterday(prev: string | null, today: string): boolean {
  if (!prev) return false
  const d = new Date(`${today}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return prev === d.toISOString().slice(0, 10)
}

export interface AchievementContext {
  totalWords: number
  totalReviews: number
  totalPoints: number
  currentStreak: number
  skModeWords: number
  lastRound: RoundResult
}

export interface AchievementDef {
  id: string
  title: string
  description: string
  check: (ctx: AchievementContext) => boolean
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_word', title: 'Prvé slovo', description: 'Save your first word', check: (c) => c.totalWords >= 1 },
  { id: 'words_10', title: 'Zberateľ', description: 'Collect 10 words', check: (c) => c.totalWords >= 10 },
  { id: 'words_100', title: 'Slovná zásoba', description: 'Collect 100 words', check: (c) => c.totalWords >= 100 },
  { id: 'words_500', title: 'Knižnica', description: 'Collect 500 words', check: (c) => c.totalWords >= 500 },
  { id: 'reviews_100', title: 'Sto opakovaní', description: 'Answer 100 questions', check: (c) => c.totalReviews >= 100 },
  { id: 'reviews_1000', title: 'Tisíc opakovaní', description: 'Answer 1000 questions', check: (c) => c.totalReviews >= 1000 },
  { id: 'streak_7', title: 'Týždeň v kuse', description: '7-day streak', check: (c) => c.currentStreak >= 7 },
  { id: 'streak_30', title: 'Mesiac v kuse', description: '30-day streak', check: (c) => c.currentStreak >= 30 },
  { id: 'first_sk_mode', title: 'Po slovensky!', description: 'First word promoted to Slovak-only prompts', check: (c) => c.skModeWords >= 1 },
  { id: 'perfect_round', title: 'Čisté kolo', description: 'A round of 5+ with every answer correct', check: (c) => c.lastRound.total >= 5 && c.lastRound.correct === c.lastRound.total },
  { id: 'points_1000', title: 'Tisícka', description: 'Earn 1,000 points', check: (c) => c.totalPoints >= 1000 },
  { id: 'points_10000', title: 'Desaťtisíc', description: 'Earn 10,000 points', check: (c) => c.totalPoints >= 10000 },
]

export function evaluateAchievements(ctx: AchievementContext, unlocked: Record<string, string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlocked[a.id] && a.check(ctx))
}
```

- [ ] **Step 4: Run tests** — `npm test` → PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib
git commit -m "feat: points, streaks and achievement catalog"
```

---

### Task 7: Sync engine (transport port + LWW merge)

**Files:**
- Create: `lib/sync.ts`, `supabase/schema.sql`
- Test: `lib/__tests__/sync.test.ts`

**Interfaces:**
- Consumes: `db`, `nowIso` from `@/lib/db`.
- Produces: `SyncTransport { push(table: string, rows: Record<string, unknown>[]): Promise<void>; pull(table: string, since: string): Promise<Record<string, unknown>[]> }`, `syncAll(transport: SyncTransport): Promise<void>`, `getWatermark(table: string): Promise<string>`. Task 8 implements a Supabase-backed `SyncTransport`.

- [ ] **Step 1: Write failing tests** — `lib/__tests__/sync.test.ts`:

```ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, newWord } from '@/lib/db'
import { getWatermark, syncAll, type SyncTransport } from '@/lib/sync'

function fakeTransport(remote: Record<string, Record<string, unknown>[]>) {
  const pushed: Record<string, Record<string, unknown>[]> = { words: [], review_logs: [], profile: [] }
  const transport: SyncTransport = {
    async push(table, rows) { pushed[table].push(...rows) },
    async pull(table, since) {
      return (remote[table] ?? []).filter((r) => (r.updated_at as string) > since)
    },
  }
  return { transport, pushed }
}

beforeEach(async () => {
  await Promise.all([db.words.clear(), db.review_logs.clear(), db.profile.clear(), db.meta.clear()])
})

describe('syncAll', () => {
  it('pushes dirty rows without the dirty field, then clears the flag', async () => {
    const w = newWord({ slovak: 'kniha' })
    await db.words.put(w)
    const { transport, pushed } = fakeTransport({})
    await syncAll(transport)
    expect(pushed.words).toHaveLength(1)
    expect(pushed.words[0].id).toBe(w.id)
    expect('dirty' in pushed.words[0]).toBe(false)
    expect((await db.words.get(w.id))!.dirty).toBe(0)
  })

  it('pulls newer remote rows and applies them (LWW), skipping older ones', async () => {
    const local = { ...newWord({ slovak: 'stará verzia' }), dirty: 0, updated_at: '2026-07-30T00:00:00.000Z' }
    await db.words.put(local)
    const newer = { ...local, slovak: 'nová verzia', updated_at: '2026-07-31T00:00:00.000Z', user_id: 'u1' }
    const older = { ...newWord({ slovak: 'prehistorická' }), id: local.id, updated_at: '2026-07-01T00:00:00.000Z' }
    const { transport } = fakeTransport({ words: [older, newer] })
    await syncAll(transport)
    const stored = (await db.words.get(local.id))!
    expect(stored.slovak).toBe('nová verzia')
    expect(stored.dirty).toBe(0)
    expect('user_id' in stored).toBe(false)
  })

  it('inserts unseen remote rows and advances the watermark', async () => {
    const remote = { ...newWord({ slovak: 'vzdialené' }), dirty: 0, updated_at: '2026-07-31T12:00:00.000Z' }
    const { transport } = fakeTransport({ words: [remote] })
    await syncAll(transport)
    expect(await db.words.get(remote.id)).toBeTruthy()
    expect(await getWatermark('words')).toBe('2026-07-31T12:00:00.000Z')
    // second sync with same remote: nothing new pulled
    const second = fakeTransport({ words: [remote] })
    await syncAll(second.transport)
    expect(second.pushed.words).toHaveLength(0)
  })

  it('local dirty edit newer than remote survives a pull', async () => {
    const w = { ...newWord({ slovak: 'moja verzia' }), updated_at: '2026-07-31T10:00:00.000Z' }
    await db.words.put(w)
    const remoteOlder = { ...w, slovak: 'cudzia verzia', updated_at: '2026-07-31T09:00:00.000Z' }
    const { transport } = fakeTransport({ words: [remoteOlder] })
    await syncAll(transport)
    expect((await db.words.get(w.id))!.slovak).toBe('moja verzia')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npm test lib/__tests__/sync.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `lib/sync.ts`:

```ts
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
```

Known accepted limitation (single-user app): a write landing between `push` and the `modify({ dirty: 0 })` could lose its dirty flag until the next edit. Do not engineer around it.

- [ ] **Step 4: Write the Supabase schema doc** — `supabase/schema.sql` (run manually in the Supabase SQL editor; Task 8 covers setup):

```sql
create table public.words (
  id uuid primary key,
  user_id uuid not null references auth.users (id) default auth.uid(),
  slovak text not null default '',
  translation_ru text not null default '',
  definition_sk text not null default '',
  part_of_speech text not null default '',
  gender text not null default '',
  examples jsonb not null default '[]',
  tags jsonb not null default '[]',
  notes text not null default '',
  fsrs jsonb not null default '{}',
  due timestamptz,
  prompt_mode text not null default 'auto',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table public.review_logs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) default auth.uid(),
  word_id uuid not null,
  question_type text not null,
  correct boolean not null,
  fsrs_grade int not null,
  points_earned int not null,
  answered_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table public.profile (
  id text not null,
  user_id uuid not null references auth.users (id) default auth.uid(),
  total_points int not null default 0,
  current_streak int not null default 0,
  best_streak int not null default 0,
  last_round_date text,
  achievements jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

alter table public.words enable row level security;
alter table public.review_logs enable row level security;
alter table public.profile enable row level security;

create policy "own rows" on public.words for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.review_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.profile for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index words_user_updated on public.words (user_id, updated_at);
create index review_logs_user_updated on public.review_logs (user_id, updated_at);
```

- [ ] **Step 5: Run tests** — `npm test` → PASS. `npm run typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add lib supabase
git commit -m "feat: offline-first sync engine with LWW merge and Supabase schema"
```

---

### Task 8: Supabase client, auth helpers, transport

**Files:**
- Create: `lib/supabase.ts`, `.env.local` (user-provided values)

**Interfaces:**
- Consumes: `SyncTransport`, `syncAll` from `@/lib/sync`.
- Produces: `getSupabase(): SupabaseClient | null` (null when env vars missing), `signInWithGoogle(): Promise<void>`, `signOut(): Promise<void>`, `getUserId(): Promise<string | null>`, `getUserEmail(): Promise<string | null>`, `runSync(): Promise<'ok' | 'offline' | 'signed_out' | 'error'>` — the one function UI calls to sync.

No unit tests here — it is thin glue over the SDK; the merge logic is already covered by Task 7. Type-check and manual verification only.

- [ ] **Step 1: Implement** — `lib/supabase.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { syncAll, type SyncTransport } from './sync'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  if (!client) client = createClient(url, key)
  return client
}

export async function signInWithGoogle(): Promise<void> {
  await getSupabase()?.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/profile` },
  })
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut()
}

export async function getUserId(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function getUserEmail(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user?.email ?? null
}

function supabaseTransport(supabase: SupabaseClient, userId: string): SyncTransport {
  return {
    async push(table, rows) {
      const { error } = await supabase.from(table).upsert(rows.map((r) => ({ ...r, user_id: userId })))
      if (error) throw error
    },
    async pull(table, since) {
      const { data, error } = await supabase
        .from(table).select('*').gt('updated_at', since)
        .order('updated_at', { ascending: true }).limit(1000)
      if (error) throw error
      return data ?? []
    },
  }
}

export async function runSync(): Promise<'ok' | 'offline' | 'signed_out' | 'error'> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline'
  const supabase = getSupabase()
  if (!supabase) return 'signed_out'
  const userId = await getUserId()
  if (!userId) return 'signed_out'
  try {
    await syncAll(supabaseTransport(supabase, userId))
    return 'ok'
  } catch {
    return 'error'
  }
}
```

- [ ] **Step 2: Manual Supabase setup (document for the user; do not block on it)**

Add these instructions to `docs/setup-supabase.md`:

```md
# Supabase setup (one-time)

1. Create a project at supabase.com → copy Project URL + anon key into `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
2. SQL Editor → paste and run `supabase/schema.sql`.
3. Authentication → Providers → Google → enable; create OAuth credentials in
   Google Cloud Console (type: Web application), authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Authentication → URL Configuration → add `http://localhost:3000/profile`
   and your production URL to Redirect URLs.
```

Create `.env.local` from `.env.local.example` (values may be blank until the user completes setup — the app must run without them; `getSupabase()` returns null).

- [ ] **Step 3: Verify** — `npm run typecheck` → clean. `npm run build` → succeeds with empty env vars.

- [ ] **Step 4: Commit**

```bash
git add lib docs .env.local.example
git commit -m "feat: supabase auth helpers and sync transport"
```

---

### Task 9: Enrichment module (Wiktionary)

**Files:**
- Create: `lib/enrich.ts`
- Test: `lib/__tests__/enrich.test.ts`

**Interfaces:**
- Consumes: `Enrichment` from `@/lib/types`.
- Produces: `enrich(word: string, fetchFn?: typeof fetch): Promise<Enrichment>` — best-effort, never throws, returns `{}` on total failure.

- [ ] **Step 1: Write failing tests** — `lib/__tests__/enrich.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { enrich } from '@/lib/enrich'

const EN_FIXTURE = {
  sk: [{
    partOfSpeech: 'Noun',
    language: 'Slovak',
    definitions: [{
      definition: '<span>trust</span>, confidence',
      parsedExamples: [{ example: '<i>Mám k nemu plnú dôveru.</i>' }],
    }],
  }],
}
const SK_FIXTURE = {
  sk: [{
    partOfSpeech: 'podstatné meno',
    language: 'slovenčina',
    definitions: [{ definition: 'pevné presvedčenie o <b>spoľahlivosti</b> niekoho' }],
  }],
}

function fakeFetch(byHost: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    const host = Object.keys(byHost).find((h) => url.includes(h))
    if (!host) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(byHost[host]), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

describe('enrich', () => {
  it('extracts POS, EN gloss note and examples from en.wiktionary, SK definition from sk.wiktionary', async () => {
    const out = await enrich('dôvera', fakeFetch({ 'en.wiktionary.org': EN_FIXTURE, 'sk.wiktionary.org': SK_FIXTURE }))
    expect(out.part_of_speech).toBe('noun')
    expect(out.notes).toBe('EN: trust, confidence')
    expect(out.examples).toEqual(['Mám k nemu plnú dôveru.'])
    expect(out.definition_sk).toBe('pevné presvedčenie o spoľahlivosti niekoho')
  })
  it('returns partial data when one source 404s', async () => {
    const out = await enrich('dôvera', fakeFetch({ 'en.wiktionary.org': EN_FIXTURE }))
    expect(out.part_of_speech).toBe('noun')
    expect(out.definition_sk).toBeUndefined()
  })
  it('returns {} when everything fails', async () => {
    const failing = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(await enrich('dôvera', failing)).toEqual({})
  })
  it('ignores non-Slovak sections on en.wiktionary', async () => {
    const out = await enrich('most', fakeFetch({
      'en.wiktionary.org': { en: [{ partOfSpeech: 'Adverb', language: 'English', definitions: [{ definition: 'most' }] }] },
    }))
    expect(out.part_of_speech).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npm test lib/__tests__/enrich.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `lib/enrich.ts`:

```ts
import type { Enrichment } from './types'

interface WiktiDef {
  partOfSpeech?: string
  language?: string
  definitions?: { definition?: string; parsedExamples?: { example?: string }[] }[]
}

const strip = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

async function fetchDefs(host: string, word: string, fetchFn: typeof fetch): Promise<Record<string, WiktiDef[]> | null> {
  try {
    const res = await fetchFn(
      `https://${host}/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
      { headers: { accept: 'application/json' } },
    )
    if (!res.ok) return null
    return (await res.json()) as Record<string, WiktiDef[]>
  } catch {
    return null
  }
}

export async function enrich(word: string, fetchFn: typeof fetch = fetch): Promise<Enrichment> {
  const [en, sk] = await Promise.all([
    fetchDefs('en.wiktionary.org', word, fetchFn),
    fetchDefs('sk.wiktionary.org', word, fetchFn),
  ])
  const out: Enrichment = {}

  const enSlovak = Object.values(en ?? {}).flat().filter((e) => e.language === 'Slovak')
  const first = enSlovak[0]
  if (first?.partOfSpeech) out.part_of_speech = first.partOfSpeech.toLowerCase()
  const gloss = strip(first?.definitions?.[0]?.definition ?? '')
  if (gloss) out.notes = `EN: ${gloss}`
  const examples = enSlovak
    .flatMap((e) => e.definitions ?? [])
    .flatMap((d) => d.parsedExamples ?? [])
    .map((x) => strip(x.example ?? ''))
    .filter(Boolean)
    .slice(0, 2)
  if (examples.length) out.examples = examples

  const skDefs = Object.values(sk ?? {}).flat()
  const skFirst = strip(skDefs[0]?.definitions?.[0]?.definition ?? '')
  if (skFirst) out.definition_sk = skFirst

  return out
}
```

(RU translation is intentionally not auto-filled — free sources rarely have it for SK; the field stays manual per the spec.)

- [ ] **Step 4: Run tests** — `npm test` → PASS. `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib
git commit -m "feat: best-effort Wiktionary enrichment"
```

---

### Task 10: TTS module + app shell (layout, theme, nav, global styles)

**Files:**
- Create: `lib/tts.ts`, `components/Nav.tsx`
- Modify: `app/layout.tsx`, `app/globals.css` (replace scaffold contents), delete `app/page.module.css` scaffold leftovers if unused

**Interfaces:**
- Produces: `ttsAvailable(): boolean`, `speakSk(text: string): void`, `onVoicesReady(cb: () => void): void`; `<Nav />`; CSS custom properties (`--bg`, `--surface`, `--text`, `--muted`, `--accent`, `--accent-soft`, `--danger`, `--border`, `--radius`, `--font-serif`, `--font-sans`) and utility classes `.card`, `.btn`, `.btn-primary`, `.serif` used by all screens; theme via `data-theme` attribute on `<html>` (`localStorage.theme` = `'light' | 'dark'`, absent = system).

No unit tests (browser APIs + markup). Verify by build + eye.

- [ ] **Step 1: TTS module** — `lib/tts.ts`:

```ts
export function getSkVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null
  return speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('sk')) ?? null
}

export function ttsAvailable(): boolean {
  return getSkVoice() !== null
}

export function speakSk(text: string): void {
  const voice = getSkVoice()
  if (!voice) return
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  u.rate = 0.9
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
}

export function onVoicesReady(cb: () => void): void {
  if (typeof speechSynthesis === 'undefined') return
  if (speechSynthesis.getVoices().length > 0) cb()
  else speechSynthesis.addEventListener('voiceschanged', () => cb(), { once: true })
}
```

- [ ] **Step 2: Layout with fonts + theme bootstrap** — `app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter } from 'next/font/google'
import Nav from '@/components/Nav'
import './globals.css'

const fraunces = Fraunces({ subsets: ['latin', 'latin-ext'], variable: '--font-fraunces' })
const inter = Inter({ subsets: ['latin', 'latin-ext', 'cyrillic'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Slovníček',
  description: 'Personal Slovak vocabulary trainer',
  manifest: '/manifest.webmanifest',
}
export const viewport: Viewport = { themeColor: '#2f6f5e' }

const themeInit = `try{const t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch{}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <main className="app-main">{children}</main>
        <Nav />
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Global styles** — replace `app/globals.css` entirely:

```css
:root {
  --bg: #faf9f7;
  --surface: #ffffff;
  --text: #1c1b1a;
  --muted: #6f6b66;
  --accent: #2f6f5e;
  --accent-soft: #e3efeb;
  --danger: #b3453f;
  --border: #e7e3de;
  --radius: 14px;
  --font-serif: var(--font-fraunces), Georgia, serif;
  --font-sans: var(--font-inter), system-ui, sans-serif;
}
[data-theme='dark'] {
  --bg: #141312;
  --surface: #1e1c1a;
  --text: #f0eeeb;
  --muted: #98938c;
  --accent: #7fb8a4;
  --accent-soft: #24322d;
  --danger: #d3766f;
  --border: #2c2926;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']):not([data-theme='dark']) {
    --bg: #141312;
    --surface: #1e1c1a;
    --text: #f0eeeb;
    --muted: #98938c;
    --accent: #7fb8a4;
    --accent-soft: #24322d;
    --danger: #d3766f;
    --border: #2c2926;
  }
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
.app-main {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 20px 96px;
  min-height: 100dvh;
}
.serif { font-family: var(--font-serif); }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
}
.btn {
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 18px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.05s ease;
}
.btn:hover { border-color: var(--accent); }
.btn:active { transform: scale(0.98); }
.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 600;
}
[data-theme='dark'] .btn-primary { color: #10201b; }

input, textarea, select {
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  width: 100%;
}
input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
label { font-size: 13px; color: var(--muted); display: block; margin: 14px 0 4px; }

.nav {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--bg) 85%, transparent);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--border);
}
.nav a {
  color: var(--muted);
  text-decoration: none;
  font-size: 14px;
  padding: 8px 16px;
  border-radius: 999px;
}
.nav a.active { color: var(--accent); background: var(--accent-soft); font-weight: 600; }
```

- [ ] **Step 4: Nav** — `components/Nav.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: 'Dnes' },
  { href: '/base', label: 'Slová' },
  { href: '/add', label: '+ Pridať' },
  { href: '/profile', label: 'Profil' },
]

export default function Nav() {
  const pathname = usePathname()
  return (
    <nav className="nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''}>
          {l.label}
        </Link>
      ))}
    </nav>
  )
}
```

- [ ] **Step 5: Placeholder home** — replace `app/page.tsx` with a minimal client page (real Today screen comes in Task 12):

```tsx
'use client'
export default function TodayPage() {
  return <h1 className="serif">Slovníček</h1>
}
```

Delete `app/page.module.css` and any scaffold demo assets it referenced.

- [ ] **Step 6: Verify** — `npm run build` → clean. `npm run dev`, open http://localhost:3000: paper-warm background, nav pills at bottom, dark mode follows system.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: app shell with theme tokens, fonts, nav and TTS helper"
```

---

### Task 11: PWA (Serwist + manifest + icon)

**Files:**
- Create: `app/sw.ts`, `app/manifest.ts`, `public/icon.svg`
- Modify: `next.config.ts` (replace with `next.config.mjs`), `tsconfig.json`, `.gitignore`

**Interfaces:**
- Produces: installable PWA; service worker precaches the app shell so all routes load offline.

- [ ] **Step 1: Next config with Serwist** — delete `next.config.ts`, create `next.config.mjs`:

```js
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})

export default withSerwist({})
```

- [ ] **Step 2: Service worker** — `app/sw.ts`:

```ts
import { defaultCache } from '@serwist/next/worker'
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}
declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
})

serwist.addEventListeners()
```

Update `tsconfig.json` `compilerOptions.lib` to include `"webworker"` and add `"types": ["@serwist/next/typings"]`. Add `public/sw.js` and `public/swe-worker*.js` to `.gitignore`.

- [ ] **Step 3: Manifest** — `app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Slovníček',
    short_name: 'Slovníček',
    description: 'Personal Slovak vocabulary trainer',
    start_url: '/',
    display: 'standalone',
    background_color: '#faf9f7',
    theme_color: '#2f6f5e',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
```

- [ ] **Step 4: Icon** — `public/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#2f6f5e"/>
  <text x="256" y="352" text-anchor="middle" font-family="Georgia, serif" font-size="288" fill="#faf9f7">S</text>
</svg>
```

- [ ] **Step 5: Verify** — `npm run build` → succeeds and emits `public/sw.js`. `npm run start`, open http://localhost:3000 → DevTools → Application: manifest detected, service worker active; Network → Offline → reload still renders.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: installable PWA with Serwist service worker"
```

---

### Task 12: Today screen

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `db`, `getProfile` from `@/lib/db`; `dueWords` from `@/lib/fsrs`; `useLiveQuery` from `dexie-react-hooks`.

- [ ] **Step 1: Implement** — `app/page.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { db, getProfile } from '@/lib/db'
import { dueWords } from '@/lib/fsrs'

export default function TodayPage() {
  const dueCount = useLiveQuery(async () => {
    const all = await db.words.toArray()
    return dueWords(all, new Date()).length
  }, [], 0)
  const wordCount = useLiveQuery(() => db.words.filter((w) => !w.deleted_at).count(), [], 0)
  const profile = useLiveQuery(() => getProfile(), [])

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <h1 className="serif" style={{ fontSize: 34, margin: '8px 0 4px' }}>Slovníček</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 28px' }}>
        {wordCount} slov · {profile?.total_points ?? 0} bodov · séria {profile?.current_streak ?? 0} dní
      </p>

      <div className="card" style={{ textAlign: 'center', padding: 36 }}>
        <div className="serif" style={{ fontSize: 64, lineHeight: 1 }}>{dueCount}</div>
        <p style={{ color: 'var(--muted)', margin: '8px 0 24px' }}>
          {dueCount === 0 ? 'Všetko zopakované. Pridaj nové slová!' : 'slov na zopakovanie'}
        </p>
        {dueCount > 0 ? (
          <Link href="/round"><button className="btn btn-primary" style={{ fontSize: 17, padding: '14px 40px' }}>Začať kolo</button></Link>
        ) : (
          <Link href="/add"><button className="btn">Pridať slovo</button></Link>
        )}
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Verify** — `npm run dev`: counts render (0 words initially), button links to `/round`. `npm run typecheck` clean.

- [ ] **Step 3: Commit**

```bash
git add app
git commit -m "feat: today screen with due count and streak"
```

---

### Task 13: Word form + Add screen + Base screen with detail sheet

**Files:**
- Create: `components/WordForm.tsx`, `components/WordSheet.tsx`, `app/add/page.tsx`, `app/base/page.tsx`

**Interfaces:**
- Consumes: `newWord`, `saveWord`, `softDeleteWord`, `db` from `@/lib/db`; `enrich` from `@/lib/enrich`; `matchesQuery` from `@/lib/text`; `maturityOf`, `promptLangOf`, `MATURE_STABILITY_DAYS` from `@/lib/fsrs`; `speakSk`, `ttsAvailable` from `@/lib/tts`; `runSync` from `@/lib/supabase`.
- Produces: `<WordForm initial?: WordRow, onSaved: () => void />`, `<WordSheet word: WordRow, onClose: () => void />`.

- [ ] **Step 1: WordForm** — `components/WordForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import type { WordRow } from '@/lib/types'
import { newWord, saveWord } from '@/lib/db'
import { enrich } from '@/lib/enrich'
import { runSync } from '@/lib/supabase'

export default function WordForm({ initial, onSaved }: { initial?: WordRow; onSaved: () => void }) {
  const [slovak, setSlovak] = useState(initial?.slovak ?? '')
  const [translationRu, setTranslationRu] = useState(initial?.translation_ru ?? '')
  const [definitionSk, setDefinitionSk] = useState(initial?.definition_sk ?? '')
  const [partOfSpeech, setPartOfSpeech] = useState(initial?.part_of_speech ?? '')
  const [gender, setGender] = useState(initial?.gender ?? '')
  const [examples, setExamples] = useState((initial?.examples ?? []).join('\n'))
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [enriching, setEnriching] = useState(false)

  async function prefill() {
    if (!slovak.trim() || !navigator.onLine) return
    setEnriching(true)
    const e = await enrich(slovak.trim())
    if (e.part_of_speech && !partOfSpeech) setPartOfSpeech(e.part_of_speech)
    if (e.definition_sk && !definitionSk) setDefinitionSk(e.definition_sk)
    if (e.translation_ru && !translationRu) setTranslationRu(e.translation_ru)
    if (e.examples?.length && !examples) setExamples(e.examples.join('\n'))
    if (e.notes && !notes) setNotes(e.notes)
    setEnriching(false)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!slovak.trim()) return
    const fields = {
      slovak: slovak.trim(),
      translation_ru: translationRu.trim(),
      definition_sk: definitionSk.trim(),
      part_of_speech: partOfSpeech.trim(),
      gender: gender.trim(),
      examples: examples.split('\n').map((s) => s.trim()).filter(Boolean),
      tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
      notes: notes.trim(),
    }
    await saveWord(initial ? { ...initial, ...fields } : newWord(fields))
    runSync().catch(() => {})
    onSaved()
  }

  return (
    <form onSubmit={save}>
      <label>Slovenské slovo</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={slovak} onChange={(e) => setSlovak(e.target.value)} onBlur={prefill} autoFocus required />
        <button type="button" className="btn" onClick={prefill} disabled={enriching}>
          {enriching ? '…' : 'Doplniť'}
        </button>
      </div>
      <label>Preklad (RU)</label>
      <input value={translationRu} onChange={(e) => setTranslationRu(e.target.value)} />
      <label>Definícia (SK)</label>
      <textarea value={definitionSk} onChange={(e) => setDefinitionSk(e.target.value)} rows={2} />
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label>Slovný druh</label>
          <input value={partOfSpeech} onChange={(e) => setPartOfSpeech(e.target.value)} />
        </div>
        <div style={{ width: 90 }}>
          <label>Rod</label>
          <input value={gender} onChange={(e) => setGender(e.target.value)} placeholder="m/ž/s" />
        </div>
      </div>
      <label>Príklady (jeden na riadok)</label>
      <textarea value={examples} onChange={(e) => setExamples(e.target.value)} rows={2} />
      <label>Tagy (oddelené čiarkou)</label>
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="práca, A2" />
      <label>Poznámky</label>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn btn-primary" style={{ marginTop: 20, width: '100%' }}>
        {initial ? 'Uložiť zmeny' : 'Pridať slovo'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Add page** — `app/add/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import WordForm from '@/components/WordForm'

export default function AddPage() {
  const [savedFlash, setSavedFlash] = useState(false)
  const [formKey, setFormKey] = useState(0)
  return (
    <div>
      <h1 className="serif" style={{ fontSize: 28 }}>Nové slovo</h1>
      {savedFlash && <p style={{ color: 'var(--accent)' }}>Uložené ✓</p>}
      <WordForm
        key={formKey}
        onSaved={() => {
          setSavedFlash(true)
          setFormKey((k) => k + 1)
          setTimeout(() => setSavedFlash(false), 2000)
        }}
      />
    </div>
  )
}
```

- [ ] **Step 3: WordSheet (detail bottom sheet)** — `components/WordSheet.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { WordRow } from '@/lib/types'
import { saveWord, softDeleteWord } from '@/lib/db'
import { maturityOf, promptLangOf, MATURE_STABILITY_DAYS } from '@/lib/fsrs'
import { speakSk, ttsAvailable } from '@/lib/tts'
import WordForm from '@/components/WordForm'

export default function WordSheet({ word, onClose }: { word: WordRow; onClose: () => void }) {
  const [editing, setEditing] = useState(false)
  const mastery = Math.min(100, Math.round((word.fsrs.stability / MATURE_STABILITY_DAYS) * 100))
  const lang = promptLangOf(word)

  async function setPin(mode: WordRow['prompt_mode']) {
    await saveWord({ ...word, prompt_mode: mode })
  }
  async function remove() {
    if (confirm(`Vymazať „${word.slovak}“?`)) {
      await softDeleteWord(word.id)
      onClose()
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50,
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          padding: 24, maxWidth: 640, margin: '0 auto', maxHeight: '85dvh', overflowY: 'auto',
        }}
      >
        {editing ? (
          <WordForm initial={word} onSaved={() => setEditing(false)} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <h2 className="serif" style={{ fontSize: 32, margin: 0 }}>{word.slovak}</h2>
              {word.gender && <span style={{ color: 'var(--muted)' }}>{word.gender}.</span>}
              {ttsAvailable() && <button className="btn" onClick={() => speakSk(word.slovak)}>🔊</button>}
            </div>
            <p style={{ fontSize: 18, margin: '6px 0' }}>{word.translation_ru}</p>
            {word.definition_sk && <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>{word.definition_sk}</p>}
            {word.examples.map((ex) => <p key={ex} style={{ margin: '4px 0' }}>„{ex}“</p>)}
            {word.tags.length > 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>{word.tags.map((t) => `#${t}`).join(' ')}</p>}

            <div style={{ margin: '16px 0' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                {maturityOf(word) === 'new' ? 'nové' : maturityOf(word)} · režim: {lang === 'sk' ? 'slovenčina' : 'ruština'}
              </div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                <div style={{ height: 6, width: `${mastery}%`, background: 'var(--accent)', borderRadius: 3 }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => setEditing(true)}>Upraviť</button>
              {word.prompt_mode !== 'pinned_sk' && word.definition_sk && (
                <button className="btn" onClick={() => setPin('pinned_sk')}>Pripnúť SK</button>
              )}
              {word.prompt_mode !== 'pinned_ru' && (
                <button className="btn" onClick={() => setPin('pinned_ru')}>Pripnúť RU</button>
              )}
              {word.prompt_mode !== 'auto' && (
                <button className="btn" onClick={() => setPin('auto')}>Auto režim</button>
              )}
              <button className="btn" style={{ color: 'var(--danger)' }} onClick={remove}>Vymazať</button>
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
```

Note the pin buttons enforce the Task 3 rule: "Pripnúť SK" is hidden when `definition_sk` is empty.

- [ ] **Step 4: Base page** — `app/base/page.tsx`:

```tsx
'use client'
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { matchesQuery } from '@/lib/text'
import { maturityOf } from '@/lib/fsrs'
import type { WordRow } from '@/lib/types'
import WordSheet from '@/components/WordSheet'

const TIER_DOT = { new: 'var(--muted)', learning: 'var(--accent)', mature: 'gold' } as const

export default function BasePage() {
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const words = useLiveQuery(
    () => db.words.filter((w) => !w.deleted_at).reverse().sortBy('created_at'),
    [], [] as WordRow[],
  )
  const allTags = useMemo(() => [...new Set(words.flatMap((w) => w.tags))].sort(), [words])
  const visible = words.filter((w) => matchesQuery(w, query) && (!activeTag || w.tags.includes(activeTag)))
  const open = words.find((w) => w.id === openId)

  return (
    <div>
      <h1 className="serif" style={{ fontSize: 28 }}>Slová <span style={{ color: 'var(--muted)', fontSize: 16 }}>({words.length})</span></h1>
      <input placeholder="Hľadať…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
          {allTags.map((t) => (
            <button
              key={t}
              className="btn"
              style={{ padding: '4px 12px', fontSize: 13, ...(activeTag === t ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)' } : {}) }}
              onClick={() => setActiveTag(activeTag === t ? null : t)}
            >
              #{t}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {visible.map((w) => (
          <button key={w.id} className="card" onClick={() => setOpenId(w.id)}
            style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '14px 16px' }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: TIER_DOT[maturityOf(w)], flexShrink: 0 }} />
            <span className="serif" style={{ fontSize: 18 }}>{w.slovak}</span>
            <span style={{ color: 'var(--muted)', marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {w.translation_ru || w.definition_sk}
            </span>
          </button>
        ))}
        {visible.length === 0 && <p style={{ color: 'var(--muted)' }}>Žiadne slová.</p>}
      </div>
      {open && <WordSheet word={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}
```

- [ ] **Step 5: Verify** — `npm run dev`: add a word (try "dôvera" online — fields prefill), find it in Base via search `dover`, open sheet, edit, pin, delete. `npm run typecheck` clean.

- [ ] **Step 6: Commit**

```bash
git add app components
git commit -m "feat: word base with search, tags, detail sheet and assisted add form"
```

---

### Task 14: Round + summary screen

**Files:**
- Create: `app/round/page.tsx`

**Interfaces:**
- Consumes: `db`, `getProfile` from `@/lib/db`; `dueWords`, `applyAnswer`, `promptLangOf` from `@/lib/fsrs`; `buildRound`, `checkAnswer` from `@/lib/questions`; `pointsFor`, `applyRoundToProfile`, `evaluateAchievements`, type `AchievementDef` from `@/lib/scoring`; `speakSk`, `ttsAvailable`, `onVoicesReady` from `@/lib/tts`; `runSync` from `@/lib/supabase`; `Question`, `WordRow` from `@/lib/types`.

- [ ] **Step 1: Implement** — `app/round/page.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { db, getProfile } from '@/lib/db'
import { applyAnswer, dueWords, promptLangOf } from '@/lib/fsrs'
import { buildRound, checkAnswer } from '@/lib/questions'
import { applyRoundToProfile, evaluateAchievements, pointsFor, type AchievementDef } from '@/lib/scoring'
import { onVoicesReady, speakSk, ttsAvailable } from '@/lib/tts'
import { runSync } from '@/lib/supabase'
import type { Question, WordRow } from '@/lib/types'

type Phase = 'loading' | 'answering' | 'feedback' | 'summary' | 'empty'

export default function RoundPage() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [wordsById, setWordsById] = useState<Map<string, WordRow>>(new Map())
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('loading')
  const [typed, setTyped] = useState('')
  const [lastCorrect, setLastCorrect] = useState(false)
  const [combo, setCombo] = useState(0)
  const [points, setPoints] = useState(0)
  const [unlocked, setUnlocked] = useState<AchievementDef[]>([])
  const correctRef = useRef(0)
  const pointsRef = useRef(0)
  const q = questions[index]
  const word = q ? wordsById.get(q.wordId) : undefined

  useEffect(() => {
    onVoicesReady(() => {})
    ;(async () => {
      const all = await db.words.toArray()
      const due = dueWords(all, new Date())
      if (due.length === 0) { setPhase('empty'); return }
      const round = buildRound(due, all, { ttsAvailable: ttsAvailable(), rng: Math.random })
      setWordsById(new Map(all.map((w) => [w.id, w])))
      setQuestions(round)
      setPhase('answering')
    })()
  }, [])

  useEffect(() => {
    if (phase === 'answering' && q?.audioWord) speakSk(q.audioWord)
  }, [phase, index]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(input: string) {
    if (phase !== 'answering' || !q) return
    const correct = checkAnswer(q, input)
    const now = new Date()
    const w = await db.words.get(q.wordId)
    if (w) await db.words.put(applyAnswer(w, correct, now))
    const earned = correct ? pointsFor(q.type, combo) : 0
    const iso = now.toISOString()
    await db.review_logs.put({
      id: crypto.randomUUID(), word_id: q.wordId, question_type: q.type, correct,
      fsrs_grade: correct ? 3 : 1, points_earned: earned, answered_at: iso,
      created_at: iso, updated_at: iso, deleted_at: null, dirty: 1,
    })
    if (correct) correctRef.current += 1
    pointsRef.current += earned
    setPoints(pointsRef.current)
    setCombo(correct ? combo + 1 : 0)
    setLastCorrect(correct)
    setPhase('feedback')
  }

  async function next() {
    if (index + 1 < questions.length) {
      setIndex(index + 1)
      setTyped('')
      setPhase('answering')
    } else {
      await finishRound()
    }
  }

  async function finishRound() {
    const iso = new Date().toISOString()
    const round = { total: questions.length, correct: correctRef.current, points: pointsRef.current }
    const profile = await getProfile()
    const updated = applyRoundToProfile(profile, round, iso.slice(0, 10))
    const allWords = await db.words.filter((w) => !w.deleted_at).toArray()
    const ctx = {
      totalWords: allWords.length,
      totalReviews: await db.review_logs.count(),
      totalPoints: updated.total_points,
      currentStreak: updated.current_streak,
      skModeWords: allWords.filter((w) => promptLangOf(w) === 'sk').length,
      lastRound: round,
    }
    const fresh = evaluateAchievements(ctx, updated.achievements)
    await db.profile.put({
      ...updated,
      achievements: { ...updated.achievements, ...Object.fromEntries(fresh.map((a) => [a.id, iso])) },
      updated_at: iso,
    })
    setUnlocked(fresh)
    setPhase('summary')
    runSync().catch(() => {})
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase === 'feedback' && e.key === 'Enter') next()
      if (phase === 'answering' && q?.choices && ['1', '2', '3', '4'].includes(e.key)) submit(q.choices[Number(e.key) - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (phase === 'loading') return null
  if (phase === 'empty') {
    return (
      <div style={{ textAlign: 'center', paddingTop: 80 }}>
        <p className="serif" style={{ fontSize: 24 }}>Nič nie je na zopakovanie</p>
        <Link href="/add"><button className="btn">Pridať slová</button></Link>
      </div>
    )
  }

  if (phase === 'summary') {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', paddingTop: 60 }}>
        <p style={{ color: 'var(--muted)' }}>Kolo dokončené</p>
        <div className="serif" style={{ fontSize: 56 }}>+{points}</div>
        <p style={{ margin: '4px 0 24px' }}>{correctRef.current} / {questions.length} správne</p>
        {unlocked.map((a) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card"
            style={{ margin: '8px auto', maxWidth: 320, borderColor: 'var(--accent)' }}>
            <strong>🏅 {a.title}</strong>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{a.description}</div>
          </motion.div>
        ))}
        <Link href="/"><button className="btn btn-primary" style={{ marginTop: 20 }}>Hotovo</button></Link>
      </motion.div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>
        <span>{index + 1} / {questions.length}</span>
        {combo > 1 && <span>🔥 x{combo}</span>}
        <span>{points} b</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={index} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
          {q.type.startsWith('listening') ? (
            <button className="btn" style={{ display: 'block', margin: '0 auto 24px', fontSize: 32, padding: '20px 32px' }}
              onClick={() => speakSk(q.audioWord!)}>🔊</button>
          ) : (
            <p className={q.type === 'sk_definition' ? 'serif' : ''} style={{ fontSize: q.type === 'sk_definition' ? 24 : 28, textAlign: 'center', margin: '20px 0 32px' }}>
              {q.prompt}
            </p>
          )}

          {phase === 'answering' && q.choices && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {q.choices.map((c, i) => (
                <button key={c} className="btn" style={{ padding: 18, fontSize: 17 }} onClick={() => submit(c)}>
                  <span style={{ color: 'var(--muted)', fontSize: 12, marginRight: 6 }}>{i + 1}</span>{c}
                </button>
              ))}
            </div>
          )}
          {phase === 'answering' && !q.choices && (
            <form onSubmit={(e) => { e.preventDefault(); submit(typed) }}>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus
                placeholder="Napíš po slovensky…" autoComplete="off" autoCapitalize="off" style={{ fontSize: 18, textAlign: 'center' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" className="btn" style={{ flex: 1 }} onClick={() => submit('')}>Neviem</button>
                <button className="btn btn-primary" style={{ flex: 2 }}>Odpovedať</button>
              </div>
            </form>
          )}

          {phase === 'feedback' && word && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card"
              style={{ borderColor: lastCorrect ? 'var(--accent)' : 'var(--danger)', textAlign: 'center' }}>
              <p style={{ color: lastCorrect ? 'var(--accent)' : 'var(--danger)', fontWeight: 600, margin: 0 }}>
                {lastCorrect ? `Správne +${pointsFor(q.type, combo - 1)}` : 'Nesprávne'}
              </p>
              <div className="serif" style={{ fontSize: 30, margin: '8px 0 2px' }}>
                {word.slovak}
                {ttsAvailable() && <button className="btn" style={{ marginLeft: 10, padding: '4px 10px' }} onClick={() => speakSk(word.slovak)}>🔊</button>}
              </div>
              <p style={{ margin: '2px 0' }}>{word.translation_ru}</p>
              {word.definition_sk && <p style={{ color: 'var(--muted)', fontStyle: 'italic', margin: '2px 0' }}>{word.definition_sk}</p>}
              {word.examples[0] && <p style={{ fontSize: 14, margin: '6px 0 0' }}>„{word.examples[0]}“</p>}
              <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={next}>
                Ďalej ⏎
              </button>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
```

Note: in the feedback panel `pointsFor(q.type, combo - 1)` re-derives the just-earned amount because `combo` was already incremented; incorrect answers show no points.

- [ ] **Step 2: Verify manually** — `npm run dev`: seed 5+ words, run a round: MC for new words with keyboard 1-4, Enter advances feedback, points/combo tick, summary shows totals and `first_word`/`perfect_round` achievements when earned. Answer one wrong → combo resets, word rescheduled soon (check in Base sheet). `npm run typecheck` clean.

- [ ] **Step 3: Commit**

```bash
git add app
git commit -m "feat: auto-graded quiz rounds with points, combos and summary"
```

---

### Task 15: Profile screen (auth, sync, achievements, backup, theme)

**Files:**
- Create: `app/profile/page.tsx`

**Interfaces:**
- Consumes: `db`, `getProfile`, `nowIso` from `@/lib/db`; `ACHIEVEMENTS` from `@/lib/scoring`; `getSupabase`, `getUserEmail`, `signInWithGoogle`, `signOut`, `runSync` from `@/lib/supabase`; row types from `@/lib/types`.

- [ ] **Step 1: Implement** — `app/profile/page.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getProfile, nowIso } from '@/lib/db'
import { ACHIEVEMENTS } from '@/lib/scoring'
import { getSupabase, getUserEmail, runSync, signInWithGoogle, signOut } from '@/lib/supabase'
import type { ProfileRow, ReviewLogRow, WordRow } from '@/lib/types'

type SyncState = 'idle' | 'syncing' | 'ok' | 'offline' | 'signed_out' | 'error'

export default function ProfilePage() {
  const profile = useLiveQuery(() => getProfile(), [])
  const [email, setEmail] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [theme, setTheme] = useState<string>('system')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getUserEmail().then(setEmail)
    setTheme(localStorage.getItem('theme') ?? 'system')
  }, [])

  function applyTheme(t: string) {
    setTheme(t)
    if (t === 'system') {
      localStorage.removeItem('theme')
      delete document.documentElement.dataset.theme
    } else {
      localStorage.setItem('theme', t)
      document.documentElement.dataset.theme = t
    }
  }

  async function doSync() {
    setSyncState('syncing')
    setSyncState(await runSync())
  }

  async function exportJson() {
    const payload = {
      exported_at: nowIso(),
      words: await db.words.toArray(),
      review_logs: await db.review_logs.toArray(),
      profile: await db.profile.toArray(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `slovnicek-backup-${payload.exported_at.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importJson(file: File) {
    const data = JSON.parse(await file.text()) as { words?: WordRow[]; review_logs?: ReviewLogRow[]; profile?: ProfileRow[] }
    const lww = async <T extends { id: string; updated_at: string }>(table: typeof db.words | typeof db.review_logs | typeof db.profile, rows: T[]) => {
      for (const row of rows) {
        const local = await (table as any).get(row.id)
        if (!local || row.updated_at > local.updated_at) await (table as any).put({ ...row, dirty: 1 })
      }
    }
    await lww(db.words, data.words ?? [])
    await lww(db.review_logs, data.review_logs ?? [])
    await lww(db.profile, data.profile ?? [])
    alert('Import hotový')
  }

  const unlocked = profile?.achievements ?? {}

  return (
    <div>
      <h1 className="serif" style={{ fontSize: 28 }}>Profil</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24 }}>
          <div><div className="serif" style={{ fontSize: 28 }}>{profile?.total_points ?? 0}</div><div style={{ color: 'var(--muted)', fontSize: 13 }}>bodov</div></div>
          <div><div className="serif" style={{ fontSize: 28 }}>{profile?.current_streak ?? 0}</div><div style={{ color: 'var(--muted)', fontSize: 13 }}>séria dní</div></div>
          <div><div className="serif" style={{ fontSize: 28 }}>{profile?.best_streak ?? 0}</div><div style={{ color: 'var(--muted)', fontSize: 13 }}>najlepšia</div></div>
        </div>
      </div>

      <h2 style={{ fontSize: 16 }}>Úspechy</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {ACHIEVEMENTS.map((a) => (
          <div key={a.id} className="card" style={{ padding: 12, opacity: unlocked[a.id] ? 1 : 0.45 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{unlocked[a.id] ? '🏅' : '🔒'} {a.title}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.description}</div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 16 }}>Synchronizácia</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        {!getSupabase() && <p style={{ color: 'var(--muted)', margin: 0 }}>Supabase nie je nakonfigurovaný (.env.local).</p>}
        {getSupabase() && !email && <button className="btn btn-primary" onClick={signInWithGoogle}>Prihlásiť cez Google</button>}
        {email && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14 }}>{email}</span>
            <button className="btn" onClick={doSync} disabled={syncState === 'syncing'}>
              {syncState === 'syncing' ? 'Synchronizujem…' : 'Synchronizovať'}
            </button>
            <button className="btn" onClick={() => signOut().then(() => setEmail(null))}>Odhlásiť</button>
            {syncState === 'ok' && <span style={{ color: 'var(--accent)', fontSize: 13 }}>✓ hotovo</span>}
            {(syncState === 'offline' || syncState === 'error') && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{syncState === 'offline' ? 'offline' : 'chyba'}</span>}
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 16 }}>Záloha</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className="btn" onClick={exportJson}>Export JSON</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import JSON</button>
        <input ref={fileRef} type="file" accept="application/json" hidden
          onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
      </div>

      <h2 style={{ fontSize: 16 }}>Vzhľad</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['light', 'system', 'dark'] as const).map((t) => (
          <button key={t} className="btn" style={theme === t ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : {}}
            onClick={() => applyTheme(t)}>
            {t === 'light' ? 'Svetlý' : t === 'dark' ? 'Tmavý' : 'Systém'}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify manually** — theme buttons switch instantly and persist on reload; export downloads a JSON containing seeded words; re-import after deleting a word restores it; without `.env.local` values, the sync card shows the unconfigured note; with them, Google sign-in redirects and returns to `/profile`. `npm run typecheck` clean.

- [ ] **Step 3: Commit**

```bash
git add app
git commit -m "feat: profile with achievements, sync controls, backup and theming"
```

---

### Task 16: Sync bootstrap + final verification + README

**Files:**
- Create: `components/SyncBootstrap.tsx`, `README.md` (replace scaffold)
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `runSync` from `@/lib/supabase`.

- [ ] **Step 1: Auto-sync on start + reconnect** — `components/SyncBootstrap.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { runSync } from '@/lib/supabase'

export default function SyncBootstrap() {
  useEffect(() => {
    runSync().catch(() => {})
    const onOnline = () => runSync().catch(() => {})
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])
  return null
}
```

In `app/layout.tsx`, import it and render `<SyncBootstrap />` as the first child of `<body>` (after the theme script).

This event-driven retriggering (start, reconnect, after each round) is the spec's "retry, never block": failed syncs leave rows dirty, so the next trigger pushes them; no timed backoff loop is needed.

- [ ] **Step 2: README** — replace `README.md` (human-authored tone, no AI mentions):

```md
# Slovníček

Personal Slovak vocabulary trainer for Russian speakers. Offline-first PWA:
collect words, review them in auto-graded quiz rounds scheduled by FSRS, and
watch prompts switch from Russian translations to Slovak-only definitions as
words mature.

## Stack

Next.js 15 (App Router, webpack) · React 19 · Dexie (IndexedDB) · ts-fsrs ·
Serwist · Supabase (Google auth + sync) · framer-motion · vitest

## Development

    npm install
    npm run dev       # http://localhost:3000
    npm test          # unit tests
    npm run build

Copy `.env.local.example` to `.env.local` and fill Supabase credentials to
enable sync (see `docs/setup-supabase.md`). The app is fully usable without
them — everything is stored locally.
```

- [ ] **Step 3: Full verification pass**

Run in order, all must pass:

```bash
npm test          # all suites green
npm run typecheck # clean
npm run lint      # clean
npm run build     # succeeds, emits public/sw.js
```

Manual smoke (production build: `npm run start`):
1. Add 6 words (one enriched online), complete a full round, check summary points and Today's streak.
2. DevTools → Network → Offline: reload — app loads; add a word, run a round; both work.
3. Go back online → Profile → Synchronizovať (if Supabase configured) → rows appear in Supabase table editor.
4. Verify no commit contains AI attribution: `git log --format='%an %ae%n%b' | grep -iE 'claude|anthropic|co-authored'` → empty output.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "docs: readme and sync bootstrap"
```

---

## Deferred (explicitly out of scope)

Bulk import, stats dashboard/heatmap, LLM enrichment (swap into `lib/enrich.ts` behind the same signature), Vercel deployment (standard Next.js deploy whenever the user wants it; remember to add the production URL to Supabase redirect URLs).
