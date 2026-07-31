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
