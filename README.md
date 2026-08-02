# Slovníček

Personal Slovak vocabulary trainer for Russian speakers. Offline-first PWA:
collect words, review them in auto-graded quiz rounds scheduled by FSRS, and
watch prompts switch from Russian translations to Slovak-only definitions as
words mature. A bundled bank of the 2,000 most frequent Slovak words feeds
you new vocabulary daily — no lesson plans, no curation.

**Live:** https://slovnicek-alpha.vercel.app

## Features

- **Spaced repetition** (ts-fsrs) with question types that follow word
  maturity: multiple choice → typed recall → Slovak-definition prompts;
  listening variants via `sk-SK` TTS
- **Built-in word supply** — frequency-ordered bank of 2,000 words with
  Russian translations, introduced daily and on demand (endless mode)
- **Forgiving grading** — diacritics-tolerant typing, synonyms sharing a
  Russian gloss accepted, letter-level mistake highlighting, optional hints
  (half points)
- **Gamification** — points with combo multiplier, daily streaks,
  25 achievements, animated round header
- **Offline-first** — IndexedDB source of truth, installable PWA, works with
  zero connection; optional Google sign-in syncs devices through Supabase
  (last-write-wins, RLS-scoped)
- **Personal knowledge base** — search, tag filters, assisted word entry in
  Slovak or Russian with dictionary prefill

<p align="center">
  <img src="docs/screens/today.png" width="260" alt="Today — due words and daily feed" />
  <img src="docs/screens/round.png" width="260" alt="Quiz round — auto-graded questions" />
  <img src="docs/screens/base.png" width="260" alt="Word base — search and tags" />
</p>

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
