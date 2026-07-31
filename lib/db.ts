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

// crypto.randomUUID is unavailable in insecure contexts (e.g. LAN http) — fall back to v4 via getRandomValues
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function newWord(fields: Partial<WordRow> & { slovak: string }): WordRow {
  const now = new Date()
  const iso = now.toISOString()
  const card = newCard(now)
  return {
    id: uuid(),
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
