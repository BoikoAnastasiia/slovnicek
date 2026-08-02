'use client'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'next-view-transitions'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { db, getProfile, uuid } from '@/lib/db'
import { introduceMoreWords, loadBank } from '@/lib/feed'
import { applyAnswer, dueWords, promptLangOf } from '@/lib/fsrs'
import { buildRound, checkAnswer, hintMask, maxHints } from '@/lib/questions'
import { applyHintPenalty, applyRoundToProfile, evaluateAchievements, pointsFor, type AchievementDef } from '@/lib/scoring'
import { closestAnswer, diffAnswer } from '@/lib/text'
import { onVoicesReady, speakSk, ttsAvailable } from '@/lib/tts'
import { runSync } from '@/lib/supabase'
import type { Question, WordRow } from '@/lib/types'

type Phase = 'loading' | 'answering' | 'feedback' | 'summary' | 'empty'

function FlameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
    </svg>
  )
}

export default function RoundPage() {
  const t = useTranslations('round')
  const ta = useTranslations('achievements')
  const [questions, setQuestions] = useState<Question[]>([])
  const [wordsById, setWordsById] = useState<Map<string, WordRow>>(new Map())
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('loading')
  const [typed, setTyped] = useState('')
  const [hints, setHints] = useState(0)
  const [lastInput, setLastInput] = useState('')
  const [lastEarned, setLastEarned] = useState(0)
  const [lastCorrect, setLastCorrect] = useState(false)
  const [combo, setCombo] = useState(0)
  const [points, setPoints] = useState(0)
  const [unlocked, setUnlocked] = useState<AchievementDef[]>([])
  const [moreExhausted, setMoreExhausted] = useState(false)
  const correctRef = useRef(0)
  const pointsRef = useRef(0)
  const resultsRef = useRef<{ wordId: string; correct: boolean }[]>([])
  const busyRef = useRef(false)
  const q = questions[index]
  const word = q ? wordsById.get(q.wordId) : undefined

  async function loadRound() {
    const all = await db.words.toArray()
    const due = dueWords(all, new Date())
    if (due.length === 0) { setPhase('empty'); return }
    const bank = await loadBank().catch(() => [])
    const round = buildRound(due, all, { ttsAvailable: ttsAvailable(), rng: Math.random, bank })
    setWordsById(new Map(all.map((w) => [w.id, w])))
    setQuestions(round)
    setPhase('answering')
  }

  useEffect(() => {
    onVoicesReady(() => {})
    loadRound()
  }, [])

  async function learnMoreAndContinue() {
    if (busyRef.current) return
    busyRef.current = true
    try {
      const bank = await loadBank()
      const rows = await introduceMoreWords(bank, 10)
      if (rows.length === 0) {
        setMoreExhausted(true)
        return
      }
      setIndex(0)
      setTyped('')
      setHints(0)
      setLastInput('')
      setLastEarned(0)
      setLastCorrect(false)
      setCombo(0)
      setPoints(0)
      setUnlocked([])
      correctRef.current = 0
      pointsRef.current = 0
      resultsRef.current = []
      setPhase('loading')
      await loadRound()
    } finally {
      busyRef.current = false
    }
  }

  useEffect(() => {
    if (phase === 'answering' && q?.audioWord) speakSk(q.audioWord)
  }, [phase, index]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(input: string) {
    if (phase !== 'answering' || !q) return
    if (busyRef.current) return
    busyRef.current = true
    try {
      const correct = checkAnswer(q, input)
      const now = new Date()
      const w = await db.words.get(q.wordId)
      if (w) await db.words.put(applyAnswer(w, correct, now))
      const earned = correct ? applyHintPenalty(pointsFor(q.type, combo), hints) : 0
      const iso = now.toISOString()
      await db.review_logs.put({
        id: uuid(), word_id: q.wordId, question_type: q.type, correct,
        fsrs_grade: correct ? 3 : 1, points_earned: earned, answered_at: iso,
        created_at: iso, updated_at: iso, deleted_at: null, dirty: 1,
      })
      if (correct) correctRef.current += 1
      resultsRef.current.push({ wordId: q.wordId, correct })
      pointsRef.current += earned
      setPoints(pointsRef.current)
      setCombo(correct ? combo + 1 : 0)
      setLastInput(input)
      setLastEarned(earned)
      setLastCorrect(correct)
      setPhase('feedback')
    } finally {
      busyRef.current = false
    }
  }

  async function next() {
    if (busyRef.current) return
    busyRef.current = true
    try {
      if (index + 1 < questions.length) {
        setIndex(index + 1)
        setTyped('')
        setHints(0)
        setPhase('answering')
      } else {
        await finishRound()
      }
    } finally {
      busyRef.current = false
    }
  }

  async function finishRound() {
    const iso = new Date().toISOString()
    const round = { total: questions.length, correct: correctRef.current, points: pointsRef.current }
    const profile = await getProfile()
    const updated = applyRoundToProfile(profile, round, iso.slice(0, 10))
    const allWords = await db.words.filter((w) => !w.deleted_at).toArray()
    const ctx = {
      totalWords: allWords.length,
      totalReviews: await db.review_logs.count(),
      totalPoints: updated.total_points,
      currentStreak: updated.current_streak,
      skModeWords: allWords.filter((w) => promptLangOf(w) === 'sk').length,
      lastRound: round,
    }
    const fresh = evaluateAchievements(ctx, updated.achievements)
    await db.profile.put({
      ...updated,
      achievements: { ...updated.achievements, ...Object.fromEntries(fresh.map((a) => [a.id, iso])) },
      updated_at: iso,
    })
    setUnlocked(fresh)
    setPhase('summary')
    runSync().catch(() => {})
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase === 'feedback' && e.key === 'Enter') next()
      if (phase === 'answering' && q?.choices && ['1', '2', '3', '4'].includes(e.key)) submit(q.choices[Number(e.key) - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (phase === 'loading') return null
  if (phase === 'empty') {
    return (
      <div style={{ textAlign: 'center', paddingTop: 80 }}>
        <p className="serif" style={{ fontSize: 24 }}>{t('empty')}</p>
        <Link href="/add"><button className="btn">{t('addWords')}</button></Link>
      </div>
    )
  }

  if (phase === 'summary') {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', paddingTop: 60 }}>
        <p style={{ color: 'var(--muted)' }}>{t('done')}</p>
        <div className="serif" style={{ fontSize: 56 }}>+{points}</div>
        <p style={{ margin: '4px 0 24px' }}>{t('correctOf', { correct: correctRef.current, total: questions.length })}</p>
        {unlocked.map((a) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card"
            style={{ margin: '8px auto', maxWidth: 320, borderColor: 'var(--accent)' }}>
            <strong>🏅 {ta(`${a.id}.title`)}</strong>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{ta(`${a.id}.description`)}</div>
          </motion.div>
        ))}
        <div style={{ fontSize: 13, color: 'var(--muted)', margin: '12px 0 20px' }}>
          {resultsRef.current.map((r, i) => (
            <div key={i}>
              <span style={{ color: r.correct ? 'var(--accent)' : 'var(--danger)' }}>{r.correct ? '✓' : '✗'}</span>
              {' '}{wordsById.get(r.wordId)?.slovak}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
          <Link href="/"><button className="btn btn-primary">{t('finish')}</button></Link>
          {!moreExhausted && (
            <button className="btn" onClick={learnMoreAndContinue}>{t('moreTen')}</button>
          )}
        </div>
      </motion.div>
    )
  }

  const answered = index + (phase === 'feedback' ? 1 : 0)
  const progressPct = questions.length ? (answered / questions.length) * 100 : 0

  return (
    <div className="round-page">
      <div className="round-top">
        <span className="chip chip-count">{index + 1} / {questions.length}</span>
        <AnimatePresence>
          {combo > 1 && (
            <motion.span key="combo" className="chip chip-combo"
              initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}>
              <FlameIcon />
              <motion.span key={combo} initial={{ scale: 1.5 }} animate={{ scale: 1 }} style={{ display: 'inline-block' }}>
                ×{combo}
              </motion.span>
            </motion.span>
          )}
        </AnimatePresence>
        <span className="chip chip-score">
          <span className="coin" aria-hidden />
          <motion.span key={points} className="serif" initial={{ scale: points > 0 ? 1.35 : 1 }} animate={{ scale: 1 }}
            style={{ display: 'inline-block' }}>
            {points}
          </motion.span>
          <AnimatePresence>
            {phase === 'feedback' && lastEarned > 0 && (
              <motion.span key={`gain-${index}`} className="chip-gain"
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: -16 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}>
                +{lastEarned}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" data-hot={combo > 1 ? '' : undefined} style={{ width: `${progressPct}%` }} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={index} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
          {q.type.startsWith('listening') ? (
            <button className="btn" aria-label={t('playWord')} style={{ display: 'block', margin: '0 auto 24px', fontSize: 32, padding: '20px 32px' }}
              onClick={() => speakSk(q.audioWord!)}>🔊</button>
          ) : (
            <p className={q.type === 'sk_definition' ? 'serif' : ''} style={{ fontSize: q.type === 'sk_definition' ? 24 : 28, textAlign: 'center', margin: '20px 0 32px' }}>
              {q.prompt}
            </p>
          )}

          {phase === 'answering' && q.choices && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {q.choices.map((c, i) => (
                <button key={c} className="btn" style={{ padding: 18, fontSize: 17 }} onClick={() => submit(c)}>
                  <span style={{ color: 'var(--muted)', fontSize: 12, marginRight: 6 }}>{i + 1}</span>{c}
                </button>
              ))}
            </div>
          )}
          {phase === 'answering' && !q.choices && (
            <form onSubmit={(e) => { e.preventDefault(); submit(typed) }}>
              {hints > 0 && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                  <p className="hint-mask">{hintMask(q.answer, hints)}</p>
                  <p className="hint-note">{t('hintNote', { count: maxHints(q.answer) })}</p>
                </motion.div>
              )}
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus
                aria-label={t('answerAria')}
                placeholder={t('typedPlaceholder')} autoComplete="off" autoCapitalize="off" style={{ fontSize: 18, textAlign: 'center' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" className="btn" style={{ padding: '12px 14px' }}
                  onClick={() => setHints((h) => Math.min(h + 1, maxHints(q.answer)))}
                  disabled={hints >= maxHints(q.answer)}>
                  {t('hint')}
                </button>
                <button type="button" className="btn" style={{ flex: 1 }} onClick={() => submit('')}>{t('dontKnow')}</button>
                <button className="btn btn-primary" style={{ flex: 2 }}>{t('answer')}</button>
              </div>
            </form>
          )}

          {phase === 'feedback' && word && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card"
              style={{ borderColor: lastCorrect ? 'var(--accent)' : 'var(--danger)', textAlign: 'center' }}>
              <p style={{ color: lastCorrect ? 'var(--accent)' : 'var(--danger)', fontWeight: 600, margin: 0 }}>
                {lastCorrect ? t('correct', { points: lastEarned }) : t('wrong')}
              </p>
              {!lastCorrect && !q.choices && lastInput.trim() !== '' && (
                <p className="answer-diff">
                  <span style={{ color: 'var(--muted)', fontSize: 13, letterSpacing: 0 }}>{t('yourAnswer')}</span>
                  {diffAnswer(lastInput, closestAnswer(lastInput, [q.answer, ...(q.accepted ?? [])])).map((s, i) => (
                    <span key={i} className={s.status === 'ok' ? undefined : 'diff-bad'}>{s.char}</span>
                  ))}
                </p>
              )}
              <div className="serif" style={{ fontSize: 30, margin: '8px 0 2px' }}>
                {word.slovak}
                {ttsAvailable() && <button className="btn" aria-label={t('listen')} style={{ marginLeft: 10, padding: '4px 10px' }} onClick={() => speakSk(word.slovak)}>🔊</button>}
              </div>
              <p style={{ margin: '2px 0' }}>{word.translation_ru}</p>
              {word.definition_sk && <p style={{ color: 'var(--muted)', fontStyle: 'italic', margin: '2px 0' }}>{word.definition_sk}</p>}
              {word.examples[0] && <p style={{ fontSize: 14, margin: '6px 0 0' }}>„{word.examples[0]}“</p>}
              <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={next}>
                {t('next')}
              </button>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
