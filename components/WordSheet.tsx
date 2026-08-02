'use client'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import type { WordRow } from '@/lib/types'
import { saveWord, softDeleteWord } from '@/lib/db'
import { maturityOf, promptLangOf, MATURE_STABILITY_DAYS } from '@/lib/fsrs'
import { speakSk, ttsAvailable } from '@/lib/tts'
import WordForm from '@/components/WordForm'

export default function WordSheet({ word, onClose }: { word: WordRow; onClose: () => void }) {
  const t = useTranslations('sheet')
  const [editing, setEditing] = useState(false)
  const mastery = Math.min(100, Math.round((word.fsrs.stability / MATURE_STABILITY_DAYS) * 100))
  const lang = promptLangOf(word)

  async function setPin(mode: WordRow['prompt_mode']) {
    await saveWord({ ...word, prompt_mode: mode })
  }
  async function remove() {
    if (confirm(t('confirmDelete', { word: word.slovak }))) {
      await softDeleteWord(word.id)
      onClose()
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50,
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          padding: 24, maxWidth: 640, margin: '0 auto', maxHeight: '85dvh', overflowY: 'auto',
        }}
      >
        {editing ? (
          <WordForm initial={word} onSaved={() => setEditing(false)} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <h2 className="serif" style={{ fontSize: 32, margin: 0 }}>{word.slovak}</h2>
              {word.gender && <span style={{ color: 'var(--muted)' }}>{word.gender}.</span>}
              {ttsAvailable() && <button className="btn" aria-label={t('listen')} onClick={() => speakSk(word.slovak)}>🔊</button>}
            </div>
            <p style={{ fontSize: 18, margin: '6px 0' }}>{word.translation_ru}</p>
            {word.definition_sk && <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>{word.definition_sk}</p>}
            {word.examples.map((ex) => <p key={ex} style={{ margin: '4px 0' }}>„{ex}“</p>)}
            {word.tags.length > 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>{word.tags.map((t) => `#${t}`).join(' ')}</p>}

            <div style={{ margin: '16px 0' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                {t(`tier${maturityOf(word)[0].toUpperCase()}${maturityOf(word).slice(1)}`)} · {t('mode')}: {lang === 'sk' ? t('langSk') : t('langRu')}
              </div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                <div style={{ height: 6, width: `${mastery}%`, background: 'var(--accent)', borderRadius: 3 }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => setEditing(true)}>{t('edit')}</button>
              {word.prompt_mode !== 'pinned_sk' && word.definition_sk && (
                <button className="btn" onClick={() => setPin('pinned_sk')}>{t('pinSk')}</button>
              )}
              {word.prompt_mode !== 'pinned_ru' && (
                <button className="btn" onClick={() => setPin('pinned_ru')}>{t('pinRu')}</button>
              )}
              {word.prompt_mode !== 'auto' && (
                <button className="btn" onClick={() => setPin('auto')}>{t('autoMode')}</button>
              )}
              <button className="btn" style={{ color: 'var(--danger)' }} onClick={remove}>{t('delete')}</button>
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
