'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { db, getProfile } from '@/lib/db'
import { applyAnswer, dueWords, promptLangOf } from '@/lib/fsrs'
import { buildRound, checkAnswer } from '@/lib/questions'
import { applyRoundToProfile, evaluateAchievements, pointsFor, type AchievementDef } from '@/lib/scoring'
import { onVoicesReady, speakSk, ttsAvailable } from '@/lib/tts'
import { runSync } from '@/lib/supabase'
import type { Question, WordRow } from '@/lib/types'

type Phase = 'loading' | 'answering' | 'feedback' | 'summary' | 'empty'

export default function RoundPage() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [wordsById, setWordsById] = useState<Map<string, WordRow>>(new Map())
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('loading')
  const [typed, setTyped] = useState('')
  const [lastCorrect, setLastCorrect] = useState(false)
  const [combo, setCombo] = useState(0)
  const [points, setPoints] = useState(0)
  const [unlocked, setUnlocked] = useState<AchievementDef[]>([])
  const correctRef = useRef(0)
  const pointsRef = useRef(0)
  const resultsRef = useRef<{ wordId: string; correct: boolean }[]>([])
  const busyRef = useRef(false)
  const q = questions[index]
  const word = q ? wordsById.get(q.wordId) : undefined

  useEffect(() => {
    onVoicesReady(() => {})
    ;(async () => {
      const all = await db.words.toArray()
      const due = dueWords(all, new Date())
      if (due.length === 0) { setPhase('empty'); return }
      const round = buildRound(due, all, { ttsAvailable: ttsAvailable(), rng: Math.random })
      setWordsById(new Map(all.map((w) => [w.id, w])))
      setQuestions(round)
      setPhase('answering')
    })()
  }, [])

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
      const earned = correct ? pointsFor(q.type, combo) : 0
      const iso = now.toISOString()
      await db.review_logs.put({
        id: crypto.randomUUID(), word_id: q.wordId, question_type: q.type, correct,
        fsrs_grade: correct ? 3 : 1, points_earned: earned, answered_at: iso,
        created_at: iso, updated_at: iso, deleted_at: null, dirty: 1,
      })
      if (correct) correctRef.current += 1
      resultsRef.current.push({ wordId: q.wordId, correct })
      pointsRef.current += earned
      setPoints(pointsRef.current)
      setCombo(correct ? combo + 1 : 0)
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
        <p className="serif" style={{ fontSize: 24 }}>Nič nie je na zopakovanie</p>
        <Link href="/add"><button className="btn">Pridať slová</button></Link>
      </div>
    )
  }

  if (phase === 'summary') {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', paddingTop: 60 }}>
        <p style={{ color: 'var(--muted)' }}>Kolo dokončené</p>
        <div className="serif" style={{ fontSize: 56 }}>+{points}</div>
        <p style={{ margin: '4px 0 24px' }}>{correctRef.current} / {questions.length} správne</p>
        {unlocked.map((a) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card"
            style={{ margin: '8px auto', maxWidth: 320, borderColor: 'var(--accent)' }}>
            <strong>🏅 {a.title}</strong>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{a.description}</div>
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
        <Link href="/"><button className="btn btn-primary" style={{ marginTop: 20 }}>Hotovo</button></Link>
      </motion.div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>
        <span>{index + 1} / {questions.length}</span>
        {combo > 1 && <span>🔥 x{combo}</span>}
        <span>{points} b</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={index} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
          {q.type.startsWith('listening') ? (
            <button className="btn" style={{ display: 'block', margin: '0 auto 24px', fontSize: 32, padding: '20px 32px' }}
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
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus
                placeholder="Napíš po slovensky…" autoComplete="off" autoCapitalize="off" style={{ fontSize: 18, textAlign: 'center' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" className="btn" style={{ flex: 1 }} onClick={() => submit('')}>Neviem</button>
                <button className="btn btn-primary" style={{ flex: 2 }}>Odpovedať</button>
              </div>
            </form>
          )}

          {phase === 'feedback' && word && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card"
              style={{ borderColor: lastCorrect ? 'var(--accent)' : 'var(--danger)', textAlign: 'center' }}>
              <p style={{ color: lastCorrect ? 'var(--accent)' : 'var(--danger)', fontWeight: 600, margin: 0 }}>
                {lastCorrect ? `Správne +${pointsFor(q.type, combo - 1)}` : 'Nesprávne'}
              </p>
              <div className="serif" style={{ fontSize: 30, margin: '8px 0 2px' }}>
                {word.slovak}
                {ttsAvailable() && <button className="btn" style={{ marginLeft: 10, padding: '4px 10px' }} onClick={() => speakSk(word.slovak)}>🔊</button>}
              </div>
              <p style={{ margin: '2px 0' }}>{word.translation_ru}</p>
              {word.definition_sk && <p style={{ color: 'var(--muted)', fontStyle: 'italic', margin: '2px 0' }}>{word.definition_sk}</p>}
              {word.examples[0] && <p style={{ fontSize: 14, margin: '6px 0 0' }}>„{word.examples[0]}“</p>}
              <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={next}>
                Ďalej ⏎
              </button>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
