# Word Bank + Daily Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Ship a bundled frequency-ordered Slovak word bank (~2,000 words with RU translations) and a daily feed that auto-introduces N new words into the SRS.

**Architecture:** A build-time Node pipeline (`scripts/build-wordbank.mjs`, run manually — never part of `npm run build`) produces `public/wordbank.json` from three free datasets. A small `lib/feed.ts` module introduces bank words into Dexie once per day; Today shows what arrived; Profile gets a daily-count setting. No runtime API.

**Tech Stack:** existing app stack; pipeline is plain Node (no new deps).

## Global Constraints

- React 19, Next.js 15 App Router on **webpack** — no `--turbopack` anywhere.
- Offline-first: `wordbank.json` must be available offline (Serwist precache).
- npm; vitest for tests; repo root `/Users/admin/Documents/job_searching/slovnicek`.
- **NO AI attribution anywhere**: plain commit messages, no `Co-Authored-By`, no AI mentions in code/docs.
- Slovak UI strings with correct diacritics and declension (use `lib/plural.ts`).
- All timestamps ISO-8601 strings.

## Data sources (verified 2026-07-31)

- Frequency: `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/sk/sk_50k.txt` (`word count` per line, surface forms).
- EN-edition Slovak dictionary (POS, forms, examples, EN glosses; 17,228 words, ~50 MB): `https://kaikki.org/dictionary/Slovak/kaikki.org-dictionary-Slovak.jsonl`
- RU-edition Slovak dictionary (RU glosses; 7,387 words, 7.2 MB): linked from `https://kaikki.org/ruwiktionary/Словацкий/index.html` (postprocessed JSONL — resolve the exact filename from that page).
- Wiktextract entry format: `word`, `pos`, `senses[].glosses`, `senses[].form_of`, `senses[].examples`, `tags` (see github.com/tatuylonen/wiktextract docs).

---

### Task F1: Word-bank pipeline

**Files:**
- Create: `scripts/build-wordbank.mjs`, `public/wordbank.json` (generated), `.gitignore` entry `scripts/.cache/`
- Test: none (one-shot data tooling; correctness gated by the Task F2 review and stats printed by the script)

**Interfaces:**
- Produces `public/wordbank.json`: ordered array of
  `{ rank: number, slovak: string, translation_ru: string, part_of_speech: string, gender: string, definition_sk: string, examples: string[] }`
  — rank is 1-based frequency order; `translation_ru` may be `""` after this task (F2 fills gaps); `gender`/`definition_sk` may be `""`; `examples` max 2.

**Steps:**
- [ ] Download the three sources into `scripts/.cache/` (skip if present; add dir to `.gitignore`).
- [ ] Build lemma index from EN-edition JSONL: entries with `pos` in {noun, verb, adj, adv, pron, prep, conj, num, particle, intj}; skip entries whose senses are only `form_of`/inflection tags — but record `form → lemma` mappings from them.
- [ ] Walk the frequency list in order: lowercase, keep only `[a-záäčďéíĺľňóôŕšťúýž]{2,}` tokens; resolve each surface form to a lemma via the form index (identity if the token is itself a lemma); accumulate counts per lemma; stop after 3,000 ranked lemmas (buffer above 2,000 for F2 pruning).
- [ ] Exclude: proper nouns (`pos == 'name'` or capitalized-only headwords), single letters, numerals, obvious subtitle junk (tokens not found in either dictionary).
- [ ] Enrich each lemma: `part_of_speech` (EN-edition pos), `gender` from EN-edition `tags` on noun senses (`masculine`→`m`, `feminine`→`ž`, `neuter`→`s`, else `""`), up to 2 example sentences (`senses[].examples[].text`, Slovak text only), `translation_ru` = first RU-edition gloss for the same headword (strip parenthetical qualifiers; join synonym lists with ", " max 3), `definition_sk` = `""` (RU-edition and EN-edition glosses are not Slovak definitions — do not misuse them).
- [ ] Also carry the EN gloss into a temporary sidecar file `scripts/.cache/bank-draft.json` as `gloss_en` per entry (F2 uses it for verification; it must NOT appear in `public/wordbank.json`).
- [ ] Emit `public/wordbank.json` (top 2,000 of the ranked lemmas) and print stats: total, % with RU translation, % with examples, top-20 preview.
- [ ] Run `node scripts/build-wordbank.mjs`; paste stats into the report. Sanity-check the top-20 by eye (expect byť, mať, ten, čo, ísť-type words).
- [ ] `npm run build` still green (wordbank.json is static data; nothing imports it yet).
- [ ] Commit: `feat: word bank build pipeline and generated bank` (script + generated JSON + gitignore).

### Task F2: RU gap-fill + bank quality pass

**Files:**
- Modify: `public/wordbank.json` (via `scripts/.cache/bank-draft.json` sidecar)

**Steps:**
- [ ] Controller-orchestrated (not a single implementer): batch-translate entries with empty `translation_ru` (SK word + POS + EN gloss as context, RU output, ≤200 words per batch agent).
- [ ] Independent review agent samples ≥10% of ALL translations (both ruwiktionary-sourced and generated) against the EN gloss sidecar, flags mistranslations/wrong-register entries; flagged entries get corrected or pruned; if the pass prunes below 2,000 the next ranked lemmas from the 3,000 buffer fill in (with the same treatment).
- [ ] Final bank: exactly 2,000 entries, 100% non-empty `translation_ru`, valid JSON, no `gloss_en` field.
- [ ] Commit: `feat: complete russian translations in word bank`.

### Task F3: Feed module + UI integration

**Files:**
- Create: `lib/feed.ts`, `lib/__tests__/feed.test.ts`
- Modify: `app/page.tsx` (introduce-on-load + arrival notice), `app/profile/page.tsx` (daily-count setting), `app/sw.ts` (precache wordbank)

**Interfaces (contract):**

```ts
// lib/feed.ts
export const FEED_DEFAULT_COUNT = 5
export interface BankEntry {
  rank: number; slovak: string; translation_ru: string
  part_of_speech: string; gender: string; definition_sk: string; examples: string[]
}
export async function loadBank(fetchFn?: typeof fetch): Promise<BankEntry[]>   // GET /wordbank.json, module-memoized, [] on failure
export async function getFeedCount(): Promise<number>                          // meta key 'feed:count', default FEED_DEFAULT_COUNT
export async function setFeedCount(n: number): Promise<void>
export async function introduceDailyWords(bank: BankEntry[], today: string): Promise<WordRow[]>
```

`introduceDailyWords` rules (all unit-tested with fake-indexeddb):
1. Reads meta `'feed:last_date'`; if `=== today` or count is 0 or bank empty → returns `[]`.
2. Builds a fold()-based set of ALL existing `words.slovak` **including soft-deleted** (a deleted feed word never returns).
3. Takes the first N unseen bank entries in rank order; creates each via `newWord({...})` with `tags: ['feed', band]` where band = rank ≤ 500 ? 'top500' : rank ≤ 1000 ? 'top1000' : 'top2000'; bulk-puts them.
4. Sets `'feed:last_date' = today` even when fewer than N (or 0) unseen words remain; returns the created rows.
5. Idempotent under double invocation (React strict-mode double-mount): second call same day returns `[]`.

UI:
- `app/page.tsx`: on mount, `loadBank().then(b => introduceDailyWords(b, todayStr))`; when words arrive show a quiet line under the header: `+N nové slová z prísunu` with correct declension via `plural(n, ['nové slovo', 'nové slová', 'nových slov'])` — exact copy: `+1 nové slovo`, `+3 nové slová`, `+5 nových slov`.
- `app/profile/page.tsx`: new section `Denný prísun` with buttons 0/3/5/10 (0 shown as `Vypnutý`), styled like the theme buttons, wired to get/setFeedCount.
- `app/sw.ts`: add `{ url: '/wordbank.json', revision: <hash or build-time constant> }` via Serwist `additionalPrecacheEntries` (consult @serwist/next docs in node_modules; keep it simple — a manifest-version string constant bumped when the bank changes is acceptable).
- meta table stays local-only (feed settings don't sync — acceptable, note in report).

**Steps:** failing tests → implement → `npm test` (all suites) → `npm run typecheck` → `npm run lint` → `npm run build` → commit `feat: daily word feed from bundled bank`.

### Task F4: Verification

- [ ] Full gates: test/typecheck/lint/build.
- [ ] Browser smoke (production build, fresh IndexedDB): first load introduces 5 words tagged `feed`+`top500`, notice shows correct declension, reload does NOT introduce more, Base shows them, a round works with them, Profile setting changes count, offline reload serves wordbank.
- [ ] Attribution grep across new commits → empty.
