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
