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
  accepted?: string[]    // extra correct answers (words sharing the RU gloss), typed RU→SK only
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
