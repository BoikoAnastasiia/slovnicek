'use client'
import { useState } from 'react'
import WordForm from '@/components/WordForm'

export default function AddPage() {
  const [savedFlash, setSavedFlash] = useState(false)
  const [formKey, setFormKey] = useState(0)
  return (
    <div>
      <h1 className="serif" style={{ fontSize: 28 }}>Nové slovo</h1>
      {savedFlash && <p style={{ color: 'var(--accent)' }}>Uložené ✓</p>}
      <WordForm
        key={formKey}
        onSaved={() => {
          setSavedFlash(true)
          setFormKey((k) => k + 1)
          setTimeout(() => setSavedFlash(false), 2000)
        }}
      />
    </div>
  )
}
