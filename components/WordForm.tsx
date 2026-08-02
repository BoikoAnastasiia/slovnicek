'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { WordRow } from '@/lib/types'
import { newWord, saveWord } from '@/lib/db'
import { enrich } from '@/lib/enrich'
import { loadBank, searchBankByRussian } from '@/lib/feed'
import { runSync } from '@/lib/supabase'

export default function WordForm({ initial, onSaved }: { initial?: WordRow; onSaved: (saved: WordRow) => void }) {
  const t = useTranslations('form')
  const [mode, setMode] = useState<'sk' | 'ru'>('sk')
  const [slovak, setSlovak] = useState(initial?.slovak ?? '')
  const [translationRu, setTranslationRu] = useState(initial?.translation_ru ?? '')
  const [definitionSk, setDefinitionSk] = useState(initial?.definition_sk ?? '')
  const [partOfSpeech, setPartOfSpeech] = useState(initial?.part_of_speech ?? '')
  const [gender, setGender] = useState(initial?.gender ?? '')
  const [examples, setExamples] = useState((initial?.examples ?? []).join('\n'))
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [enriching, setEnriching] = useState(false)
  const [searching, setSearching] = useState(false)
  const [ruMiss, setRuMiss] = useState(false)

  async function prefill() {
    if (!slovak.trim() || !navigator.onLine) return
    setEnriching(true)
    const e = await enrich(slovak.trim())
    if (e.part_of_speech && !partOfSpeech) setPartOfSpeech(e.part_of_speech)
    if (e.definition_sk && !definitionSk) setDefinitionSk(e.definition_sk)
    if (e.translation_ru && !translationRu) setTranslationRu(e.translation_ru)
    if (e.examples?.length && !examples) setExamples(e.examples.join('\n'))
    if (e.notes && !notes) setNotes(e.notes)
    setEnriching(false)
  }

  async function findByRussian() {
    setRuMiss(false)
    if (!translationRu.trim()) return
    setSearching(true)
    const bank = await loadBank()
    const hit = searchBankByRussian(bank, translationRu.trim())
    if (hit) {
      setSlovak(hit.slovak)
      if (hit.part_of_speech && !partOfSpeech) setPartOfSpeech(hit.part_of_speech)
      if (hit.gender && !gender) setGender(hit.gender)
      if (hit.examples?.length && !examples) setExamples(hit.examples.join('\n'))
      setTranslationRu(hit.translation_ru)
      await prefillFor(hit.slovak)
    } else {
      setRuMiss(true)
    }
    setSearching(false)
  }

  async function prefillFor(word: string) {
    if (!word.trim() || !navigator.onLine) return
    const e = await enrich(word.trim())
    if (e.definition_sk && !definitionSk) setDefinitionSk(e.definition_sk)
    if (e.notes && !notes) setNotes(e.notes)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!slovak.trim()) return
    const fields = {
      slovak: slovak.trim(),
      translation_ru: translationRu.trim(),
      definition_sk: definitionSk.trim(),
      part_of_speech: partOfSpeech.trim(),
      gender: gender.trim(),
      examples: examples.split('\n').map((s) => s.trim()).filter(Boolean),
      tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
      notes: notes.trim(),
    }
    const row = initial ? { ...initial, ...fields } : newWord(fields)
    await saveWord(row)
    runSync().catch(() => {})
    onSaved(row)
  }

  return (
    <form onSubmit={save}>
      {!initial && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className="btn"
            style={mode === 'sk' ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : {}}
            onClick={() => setMode('sk')}
          >
            {t('modeSk')}
          </button>
          <button
            type="button"
            className="btn"
            style={mode === 'ru' ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : {}}
            onClick={() => setMode('ru')}
          >
            {t('modeRu')}
          </button>
        </div>
      )}
      {mode === 'sk' ? (
        <>
          <label htmlFor="wf-slovak">{t('modeSk')}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="wf-slovak" value={slovak} onChange={(e) => setSlovak(e.target.value)} onBlur={prefill} autoFocus required />
            <button type="button" className="btn" onClick={prefill} disabled={enriching}>
              {enriching ? '…' : t('enrich')}
            </button>
          </div>
          <label htmlFor="wf-translation-ru">{t('translationRu')}</label>
          <input id="wf-translation-ru" value={translationRu} onChange={(e) => setTranslationRu(e.target.value)} />
        </>
      ) : (
        <>
          <label htmlFor="wf-translation-ru">{t('modeRu')}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="wf-translation-ru"
              value={translationRu}
              onChange={(e) => { setTranslationRu(e.target.value); setRuMiss(false) }}
              autoFocus
            />
            <button type="button" className="btn" onClick={findByRussian} disabled={searching}>
              {searching ? '…' : t('find')}
            </button>
          </div>
          {ruMiss && (
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0' }}>
              {t('ruMiss')}
            </p>
          )}
          <label htmlFor="wf-slovak">{t('modeSk')}</label>
          <input id="wf-slovak" value={slovak} onChange={(e) => setSlovak(e.target.value)} onBlur={prefill} required />
        </>
      )}
      <label htmlFor="wf-definition-sk">{t('definitionSk')}</label>
      <textarea id="wf-definition-sk" value={definitionSk} onChange={(e) => setDefinitionSk(e.target.value)} rows={2} />
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="wf-pos">{t('partOfSpeech')}</label>
          <input id="wf-pos" value={partOfSpeech} onChange={(e) => setPartOfSpeech(e.target.value)} />
        </div>
        <div style={{ width: 90 }}>
          <label htmlFor="wf-gender">{t('gender')}</label>
          <input id="wf-gender" value={gender} onChange={(e) => setGender(e.target.value)} placeholder={t('genderPlaceholder')} />
        </div>
      </div>
      <label htmlFor="wf-examples">{t('examples')}</label>
      <textarea id="wf-examples" value={examples} onChange={(e) => setExamples(e.target.value)} rows={2} />
      <label htmlFor="wf-tags">{t('tags')}</label>
      <input id="wf-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t('tagsPlaceholder')} />
      <label htmlFor="wf-notes">{t('notes')}</label>
      <input id="wf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className="btn btn-primary" style={{ marginTop: 20, width: '100%' }}>
        {initial ? t('submitSave') : t('submitAdd')}
      </button>
    </form>
  )
}
