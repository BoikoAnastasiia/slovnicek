'use client'
import { useEffect, useState } from 'react'
import WordForm from '@/components/WordForm'
import Toast from '@/components/Toast'

export default function AddPage() {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div>
      <h1 className="serif" style={{ fontSize: 28 }}>Nové slovo</h1>
      <WordForm
        key={formKey}
        onSaved={(saved) => {
          setFormKey((k) => k + 1)
          setToast({ id: Date.now(), text: `„${saved.slovak}“ pridané ✓` })
        }}
      />
      <Toast toast={toast} />
    </div>
  )
}
