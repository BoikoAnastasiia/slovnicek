'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Link, useTransitionRouter } from 'next-view-transitions'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { db, PROFILE_ID } from '@/lib/db'
import { introduceDailyWords, introduceMoreWords, loadBank } from '@/lib/feed'
import { dueWords } from '@/lib/fsrs'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function TodayPage() {
  const t = useTranslations('today')
  const router = useTransitionRouter()
  const dueCount = useLiveQuery(async () => {
    const all = await db.words.toArray()
    return dueWords(all, new Date()).length
  }, [], 0)
  const wordCount = useLiveQuery(() => db.words.filter((w) => !w.deleted_at).count(), [], 0)
  const profile = useLiveQuery(() => db.profile.get(PROFILE_ID), [])
  const [introducedCount, setIntroducedCount] = useState(0)
  const [bankExhausted, setBankExhausted] = useState(false)
  const busyRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadBank().then((bank) => introduceDailyWords(bank, todayStr())).then((rows) => {
      if (!cancelled && rows.length > 0) setIntroducedCount(rows.length)
    })
    return () => { cancelled = true }
  }, [])

  async function learnMore() {
    if (busyRef.current) return
    busyRef.current = true
    try {
      const bank = await loadBank()
      const rows = await introduceMoreWords(bank, 10)
      if (rows.length === 0) {
        setBankExhausted(true)
        return
      }
      router.push('/round')
    } finally {
      busyRef.current = false
    }
  }

  return (
    <div className="today-page">
      <h1 className="serif" style={{ fontSize: 34, margin: '8px 0 4px' }}>Slovníček</h1>
      <p style={{ color: 'var(--muted)', margin: introducedCount > 0 ? '0 0 4px' : '0 0 28px' }}>
        {t('words', { count: wordCount })} · {t('points', { count: profile?.total_points ?? 0 })} · {t('streak', { count: profile?.current_streak ?? 0 })}
      </p>
      {introducedCount > 0 && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: 'var(--muted)', margin: '0 0 24px', fontSize: 14 }}>
          {t('feedIntro', { count: introducedCount })}
        </motion.p>
      )}

      <div className="card" style={{ textAlign: 'center', padding: 36 }}>
        <Image src="/hero.png" alt="" width={200} height={136} priority style={{ display: 'block', margin: '0 auto 4px' }} />
        <div className="serif" style={{ fontSize: 64, lineHeight: 1 }}>{dueCount}</div>
        <p style={{ color: 'var(--muted)', margin: '8px 0 24px' }}>
          {dueCount === 0
            ? (bankExhausted ? t('allDoneAdd') : t('allDoneBank'))
            : t('dueLabel', { count: dueCount })}
        </p>
        {dueCount > 0 ? (
          <Link href="/round"><button className="btn btn-primary" style={{ fontSize: 17, padding: '14px 40px' }}>{t('startRound')}</button></Link>
        ) : bankExhausted ? (
          <Link href="/add"><button className="btn">{t('addWord')}</button></Link>
        ) : (
          <button className="btn btn-primary" style={{ fontSize: 17, padding: '14px 40px' }} onClick={learnMore}>{t('learnNew')}</button>
        )}
      </div>
    </div>
  )
}
