'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import WordForm from '@/components/WordForm'
import Toast from '@/components/Toast'

export default function AddPage() {
  const t = useTranslations('add')
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <div>
      <h1 className="serif" style={{ fontSize: 28 }}>{t('title')}</h1>
      <WordForm
        key={formKey}
        onSaved={(saved) => {
          setFormKey((k) => k + 1)
          setToast({ id: Date.now(), text: t('added', { word: saved.slovak }) })
        }}
      />
      <Toast toast={toast} />
    </div>
  )
}
