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
