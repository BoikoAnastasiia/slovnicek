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
  check: (ctx: AchievementContext) => boolean
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // words
  { id: 'first_word', check: (c) => c.totalWords >= 1 },
  { id: 'words_10', check: (c) => c.totalWords >= 10 },
  { id: 'words_50', check: (c) => c.totalWords >= 50 },
  { id: 'words_100', check: (c) => c.totalWords >= 100 },
  { id: 'words_500', check: (c) => c.totalWords >= 500 },
  { id: 'words_1000', check: (c) => c.totalWords >= 1000 },
  { id: 'words_2000', check: (c) => c.totalWords >= 2000 },
  // reviews
  { id: 'reviews_100', check: (c) => c.totalReviews >= 100 },
  { id: 'reviews_500', check: (c) => c.totalReviews >= 500 },
  { id: 'reviews_1000', check: (c) => c.totalReviews >= 1000 },
  { id: 'reviews_5000', check: (c) => c.totalReviews >= 5000 },
  // streaks
  { id: 'streak_3', check: (c) => c.currentStreak >= 3 },
  { id: 'streak_7', check: (c) => c.currentStreak >= 7 },
  { id: 'streak_30', check: (c) => c.currentStreak >= 30 },
  { id: 'streak_100', check: (c) => c.currentStreak >= 100 },
  // sk-mode
  { id: 'first_sk_mode', check: (c) => c.skModeWords >= 1 },
  { id: 'sk_mode_10', check: (c) => c.skModeWords >= 10 },
  { id: 'sk_mode_100', check: (c) => c.skModeWords >= 100 },
  // rounds
  { id: 'perfect_round', check: (c) => c.lastRound.total >= 5 && c.lastRound.correct === c.lastRound.total },
  { id: 'perfect_10', check: (c) => c.lastRound.total >= 10 && c.lastRound.correct === c.lastRound.total },
  // points
  { id: 'points_100', check: (c) => c.totalPoints >= 100 },
  { id: 'points_1000', check: (c) => c.totalPoints >= 1000 },
  { id: 'points_5000', check: (c) => c.totalPoints >= 5000 },
  { id: 'points_10000', check: (c) => c.totalPoints >= 10000 },
  { id: 'points_50000', check: (c) => c.totalPoints >= 50000 },
]

export function evaluateAchievements(ctx: AchievementContext, unlocked: Record<string, string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlocked[a.id] && a.check(ctx))
}
