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

export function applyHintPenalty(points: number, hintsUsed: number): number {
  return hintsUsed > 0 ? Math.ceil(points / 2) : points
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
  // words
  { id: 'first_word', title: 'Prvé slovo', description: 'Ulož svoje prvé slovo', check: (c) => c.totalWords >= 1 },
  { id: 'words_10', title: 'Zberateľ', description: 'Zbierka má 10 slov', check: (c) => c.totalWords >= 10 },
  { id: 'words_50', title: 'Polstovka', description: 'Zbierka má 50 slov', check: (c) => c.totalWords >= 50 },
  { id: 'words_100', title: 'Slovná zásoba', description: 'Zbierka má 100 slov', check: (c) => c.totalWords >= 100 },
  { id: 'words_500', title: 'Knižnica', description: 'Zbierka má 500 slov', check: (c) => c.totalWords >= 500 },
  { id: 'words_1000', title: 'Tisíc slov', description: 'Zbierka má 1 000 slov', check: (c) => c.totalWords >= 1000 },
  { id: 'words_2000', title: 'Celá banka', description: 'Zbierka má 2 000 slov', check: (c) => c.totalWords >= 2000 },
  // reviews
  { id: 'reviews_100', title: 'Sto opakovaní', description: 'Odpovedz na 100 otázok', check: (c) => c.totalReviews >= 100 },
  { id: 'reviews_500', title: 'Päťsto opakovaní', description: 'Odpovedz na 500 otázok', check: (c) => c.totalReviews >= 500 },
  { id: 'reviews_1000', title: 'Tisíc opakovaní', description: 'Odpovedz na 1 000 otázok', check: (c) => c.totalReviews >= 1000 },
  { id: 'reviews_5000', title: 'Päťtisíc opakovaní', description: 'Odpovedz na 5 000 otázok', check: (c) => c.totalReviews >= 5000 },
  // streaks
  { id: 'streak_3', title: 'Tri dni', description: 'Séria 3 dni v kuse', check: (c) => c.currentStreak >= 3 },
  { id: 'streak_7', title: 'Týždeň v kuse', description: 'Séria 7 dní v kuse', check: (c) => c.currentStreak >= 7 },
  { id: 'streak_30', title: 'Mesiac v kuse', description: 'Séria 30 dní v kuse', check: (c) => c.currentStreak >= 30 },
  { id: 'streak_100', title: 'Sto dní', description: 'Séria 100 dní v kuse', check: (c) => c.currentStreak >= 100 },
  // sk-mode
  { id: 'first_sk_mode', title: 'Po slovensky!', description: 'Prvé slovo v slovenskom režime', check: (c) => c.skModeWords >= 1 },
  { id: 'sk_mode_10', title: 'Desať po slovensky', description: '10 slov v slovenskom režime', check: (c) => c.skModeWords >= 10 },
  { id: 'sk_mode_100', title: 'Sto po slovensky', description: '100 slov v slovenskom režime', check: (c) => c.skModeWords >= 100 },
  // rounds
  { id: 'perfect_round', title: 'Čisté kolo', description: 'Kolo od 5 otázok bez chyby', check: (c) => c.lastRound.total >= 5 && c.lastRound.correct === c.lastRound.total },
  { id: 'perfect_10', title: 'Dokonalá desiatka', description: 'Kolo od 10 otázok bez chyby', check: (c) => c.lastRound.total >= 10 && c.lastRound.correct === c.lastRound.total },
  // points
  { id: 'points_100', title: 'Prvá stovka', description: 'Získaj 100 bodov', check: (c) => c.totalPoints >= 100 },
  { id: 'points_1000', title: 'Tisícka', description: 'Získaj 1 000 bodov', check: (c) => c.totalPoints >= 1000 },
  { id: 'points_5000', title: 'Päťtisícka', description: 'Získaj 5 000 bodov', check: (c) => c.totalPoints >= 5000 },
  { id: 'points_10000', title: 'Desaťtisíc', description: 'Získaj 10 000 bodov', check: (c) => c.totalPoints >= 10000 },
  { id: 'points_50000', title: 'Päťdesiattisíc', description: 'Získaj 50 000 bodov', check: (c) => c.totalPoints >= 50000 },
]

export function evaluateAchievements(ctx: AchievementContext, unlocked: Record<string, string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlocked[a.id] && a.check(ctx))
}
