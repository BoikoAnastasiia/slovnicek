# Slovníček — Personal Slovak Vocabulary Trainer

**Date:** 2026-07-31
**Status:** Approved

## Overview

An offline-first PWA for a Russian-speaking Slovak learner. It is a personal
knowledge base combined with an FSRS spaced-repetition system — not a
lesson-based course. The user collects words, reviews them in auto-graded quiz
rounds (vocabulary.com-style scoring with points and achievements), and each
word automatically transitions from Russian-translation prompts to Slovak-only
definition prompts as it matures. Premium-minimal feel: fast, calm, focused on
mastering vocabulary.

Project location: `job_searching/slovnicek` (new sibling to `guess-the-band`).

## Stack

- **Next.js (App Router) + React 19 + TypeScript + framer-motion** — built and
  dev-served with **webpack, not Turbopack** (explicit user choice); routing
  via the App Router. The app is client-only: every page is a client
  component, no server rendering of user data, so offline-first behavior is
  unaffected by the framework.
- **Dexie** (IndexedDB) — on-device source of truth; app fully functional offline
- **ts-fsrs** — FSRS scheduling algorithm
- **Serwist** (`@serwist/next`) — service worker + precached shell for the
  installable PWA
- **Supabase** — Postgres + Google OAuth + RLS; used only as a sync backend
- **Web Speech API** — `sk-SK` TTS for pronunciation (free, offline-capable)
- **vitest** — unit tests

## Data model

Three synced tables, mirrored Dexie ↔ Supabase. All rows carry `id` (uuid),
`created_at`, `updated_at`, `deleted_at` (soft delete), and a local-only
`dirty` flag.

### `words`

| Field | Notes |
|---|---|
| `slovak` | headword |
| `translation_ru` | Russian translation |
| `definition_sk` | Slovak learner definition |
| `part_of_speech`, `gender` | optional grammar metadata |
| `examples` | array of Slovak example sentences |
| `tags` | array of strings (e.g. `work`, `A2`, `verbs`) |
| `notes` | free text |
| FSRS state | `due`, `stability`, `difficulty`, `reps`, `lapses`, `state`, `last_review` |
| `prompt_mode` | `auto` \| `pinned_ru` \| `pinned_sk` |

### `review_logs`

One row per answered question: `word_id`, `question_type`, `correct`,
`fsrs_grade`, `points_earned`, `answered_at`.

### `profile`

Single row: `total_points`, `current_streak`, `best_streak`,
`achievements` (map of achievement id → unlock date).

## Sync engine

Single-user, deliberately simple:

- Every local write sets `dirty` and bumps `updated_at`.
- Background sync pushes dirty records, then pulls records with
  `updated_at > watermark` (watermark stored locally).
- Conflict resolution: **last-write-wins on `updated_at`** (acceptable: the
  only writer is one person on a couple of devices).
- Soft deletes (`deleted_at`) propagate like any update.
- Triggers: app start, `online` event, after each review round.
- Signed out or offline: everything works locally; sync waits. Subtle status
  indicator, never a blocking UI.
- Auth: Supabase Google OAuth, one account, RLS scoped to the user id.

## Word entry (assisted)

- User types a Slovak word; the enrichment module queries free dictionary
  sources — **Wiktionary REST API (en.wiktionary + sk.wiktionary)** — and
  prefills whatever it finds: translation, part of speech, gender, definition,
  examples.
- All fields remain editable; missing data simply leaves fields blank
  (RU translations and learner-level SK definitions will often need manual
  entry — accepted trade-off of free sources).
- Offline: same form, no prefill.
- Enrichment is an isolated module with a narrow interface
  (`enrich(word) → Partial<WordFields>`) so a better source can be swapped in
  later without touching callers.

## Review engine — quiz rounds

- A round = up to 10 due words, FSRS ordering.
- Question type follows word maturity (FSRS state/stability):
  - **new** → multiple choice: RU prompt → pick the Slovak word among 4.
    Distractors drawn from the user's own base matched by part of speech;
    built-in fallback distractor pool while the base is small.
  - **learning** → typed recall from RU prompt. Diacritics-tolerant matching
    (`dovera` accepted for `dôvera`, corrected form shown after).
  - **mature** (stability > ~21 days) → prompt is the **Slovak definition**,
    Russian never shown. This IS the RU→SK transition; `prompt_mode` pin
    overrides per word in either direction.
  - **listening** variants: roughly 1 in 5 questions (only when an `sk-SK`
    voice is available) swaps the visual prompt for TTS audio → type or choose
    the word. Answer format follows the word's maturity tier.
- Auto-grading → FSRS: correct = `Good`, incorrect or "don't know" = `Again`.
  No self-grading anywhere.
- TTS button available on every answer reveal.

## Scoring & achievements

- Points per correct answer scale with question difficulty:
  recognition < typed recall < SK-definition prompt.
- Combo multiplier for consecutive correct answers within a round.
- Round summary screen: points earned, per-word results, any unlocked
  achievement (quiet toast — no confetti carnival).
- Daily streak = any completed round that day.
- Achievements: fixed local catalog evaluated after each round — e.g. first
  word saved; 10/100/500 words; 100/1000 reviews; 7/30-day streak; first word
  promoted to SK-mode; all-correct round; 1,000/10,000 points.
- All gamification computed locally, synced via `profile` + `review_logs`.

## Screens

1. **Today** — due count, streak, points, one primary "Start round" action.
2. **Base** — instant fuzzy search, tag filter chips, word list; word detail
   sheet (all fields, mastery bar from FSRS stability, pronounce, edit, pin
   prompt mode, delete).
3. **Add** — assisted entry form.
4. **Round** — quiz flow: chip header (question count, flame combo chip,
   gold score chip with floating point gains), animated progress bar.
5. **Summary** — round results and achievement unlocks.
6. **Profile/Settings** — stats, link to the achievements page, sync status,
   Google sign-in, theme toggle, daily-feed size.
7. **Achievements** — dedicated gallery page (25 achievements, Slovak copy).

## Design language

Premium-minimal: generous whitespace; serif display face for Slovak headwords,
clean sans for UI; calm palette; light + dark themes; subtle framer-motion
transitions (reuse the user's established morph pattern from ImageGenChat);
keyboard-driven rounds on desktop (1–4 answer keys, Enter to continue);
mobile-first layout as a PWA.

## Error handling

- Offline: entry, review, scoring fully functional; enrichment and sync
  degrade silently with a subtle indicator.
- TTS: hidden when no `sk-SK` voice is available.
- Sync failures: retry with backoff; never block or lose local writes.
- Enrichment failures/timeouts: fall back to blank editable fields.

## Testing (vitest)

Unit tests target the four places where silent bugs hurt:

1. FSRS integration (grade application, due scheduling, maturity thresholds).
2. Question generator (type selection by maturity, distractor picking,
   diacritics-tolerant matching).
3. Sync merge logic (LWW, watermark, soft deletes, dirty tracking).
4. Scoring and achievement rules.

## Out of scope for v1

- Bulk import; stats dashboard/heatmap (deferred by user choice).
- LLM-based enrichment (module boundary allows swapping in later).
- Multi-user features, leaderboards.

## Addendum (2026-07-31): Bundled word bank + daily feed

User clarification: the app must SUPPLY vocabulary — "I don't want to think
about what words I need." No suitable runtime Slovak↔Russian API exists, so
the app ships a pregenerated word bank and feeds it into the SRS daily.

- **Word bank:** top ~2,000 Slovak lemmas by real-world frequency
  (OpenSubtitles corpus via hermitdave/FrequencyWords), enriched from
  kaikki.org Wiktionary extractions: RU translations primarily from the
  ruwiktionary Slovak dataset (7.4k words), POS/gender/examples from the
  enwiktionary Slovak dataset (17k words); remaining RU gaps filled and the
  whole bank quality-reviewed at build time. Shipped as
  `public/wordbank.json`, precached by the service worker (offline-first
  preserved; no runtime API, no keys).
- **Daily feed:** once per day, the app auto-introduces N new bank words
  (default 5, configurable 0/3/5/10 in Profile; 0 disables) into the word
  base with tags `feed` + frequency band (`top500`/`top1000`/`top2000`),
  in frequency order, skipping any word already in the base (including
  deleted ones — a deleted feed word never returns). Introduction happens on
  Today screen load, idempotent per day.
- Manual Add and Wiktionary enrichment remain unchanged — the feed makes
  them optional, not obsolete.

## Addendum (2026-08-02): shipped post-v1 changes

Everything below is implemented and live at
https://slovnicek-alpha.vercel.app (Vercel, auto-deploy from `main`).

- **Endless learning** — no daily cap: „Učiť sa nové slová" on Today and
  „Ďalších 10 nových slov" on the round summary pull the next batch of bank
  words on demand.
- **RU-first entry** — the Add form has a Slovak/Russian toggle; „Nájsť"
  looks the Russian word up in the bank and prefills the entry.
- **Shared-gloss synonyms** — words sharing a Russian gloss variant (e.g.
  `že`/`čo` = «что») are accepted as typed answers for each other, and MC
  distractors never include a word whose gloss overlaps the answer.
- **Mistake feedback** — wrong typed answers render the user's input with
  mistyped letters in red and skipped letters as gaps (Levenshtein alignment
  over folded characters, diffed against the closest accepted answer).
- **Hints** — typed questions offer „Nápoveda": first hint shows the word
  shape, each further hint reveals one letter (never the whole word); using
  any hint halves the question's points (rounded up).
- **Visual refresh** — lexicat-inspired pill buttons with 3D bottom edges,
  blue + gold palette, cap logo/hero, gamified round header (chips + progress
  bar that turns gold while a combo runs), subtle CSS-only confetti dots,
  view transitions between pages (next-view-transitions, directional slides),
  toast confirmation after adding a word.
- **Backup UI dropped** (user choice) — sync + local storage only; the
  achievements catalog was expanded to 25 instead and moved to its own page.
- **Word bank note** — the bank is a build-time artifact
  (`scripts/build-wordbank.mjs`); the app never calls a vocabulary API at
  runtime. Wiktionary REST is used only for best-effort enrichment of
  manually added words.
