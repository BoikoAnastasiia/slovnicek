'use client'
import Link from 'next/link'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { db, getProfile } from '@/lib/db'
import { dueWords } from '@/lib/fsrs'

export default function TodayPage() {
  const dueCount = useLiveQuery(async () => {
    const all = await db.words.toArray()
    return dueWords(all, new Date()).length
  }, [], 0)
  const wordCount = useLiveQuery(() => db.words.filter((w) => !w.deleted_at).count(), [], 0)
  const profile = useLiveQuery(() => getProfile(), [])

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <h1 className="serif" style={{ fontSize: 34, margin: '8px 0 4px' }}>Slovníček</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 28px' }}>
        {wordCount} slov · {profile?.total_points ?? 0} bodov · séria {profile?.current_streak ?? 0} dní
      </p>

      <div className="card" style={{ textAlign: 'center', padding: 36 }}>
        <div className="serif" style={{ fontSize: 64, lineHeight: 1 }}>{dueCount}</div>
        <p style={{ color: 'var(--muted)', margin: '8px 0 24px' }}>
          {dueCount === 0 ? 'Všetko zopakované. Pridaj nové slová!' : 'slov na zopakovanie'}
        </p>
        {dueCount > 0 ? (
          <Link href="/round"><button className="btn btn-primary" style={{ fontSize: 17, padding: '14px 40px' }}>Začať kolo</button></Link>
        ) : (
          <Link href="/add"><button className="btn">Pridať slovo</button></Link>
        )}
      </div>
    </motion.div>
  )
}
